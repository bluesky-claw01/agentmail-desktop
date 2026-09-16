import { AgentMailClient, AgentMailError, AgentMailTimeoutError } from 'agentmail';
import { InboxInfo, Message, ComposeMessage, FolderType } from '../shared/types';
import { createProxyAwareFetch, isProxyConfigured } from './proxy-fetch';

export interface ApiKeyValidationResult {
  valid: boolean;
  statusCode?: number;
  errorType?: string;
  message?: string;
}

function isHtmlBody(body: unknown): boolean {
  if (typeof body !== 'string') return false;
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('cloudfront');
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/Bearer\s+\S+/gi, '[redacted]').slice(0, 300);
  }
  return String(error).slice(0, 300);
}

function networkCode(error: unknown): string | undefined {
  const anyErr = error as { code?: string; cause?: { code?: string } };
  return anyErr?.code || anyErr?.cause?.code;
}

export class AgentMailAPI {
  private client: AgentMailClient | null = null;

  setApiKey(apiKey: string): void {
    this.client = new AgentMailClient({
      apiKey,
      fetch: createProxyAwareFetch()
    });
  }

  async validateApiKey(): Promise<ApiKeyValidationResult> {
    if (!this.client) {
      return {
        valid: false,
        errorType: 'config',
        message: 'API key not set'
      };
    }

    try {
      await this.client.inboxes.list({ limit: 1 });
      return { valid: true };
    } catch (error) {
      return this.mapValidationError(error);
    }
  }

  private mapValidationError(error: unknown): ApiKeyValidationResult {
    if (error instanceof AgentMailTimeoutError) {
      return {
        valid: false,
        errorType: 'timeout',
        message: 'Request timed out while contacting AgentMail API'
      };
    }

    if (error instanceof AgentMailError) {
      const statusCode = error.statusCode;
      const htmlBlocked = isHtmlBody(error.body);

      // CloudFront/HTML 403 is a network/path block, not an auth decision.
      if (htmlBlocked || (statusCode === 403 && isHtmlBody(error.body))) {
        const proxyHint = isProxyConfigured()
          ? 'Proxy is set, but AgentMail still returned a blocked HTML response.'
          : 'No HTTP(S)_PROXY is set. On this network, AgentMail API often requires a proxy.';
        return {
          valid: false,
          statusCode,
          errorType: 'network_blocked',
          message: `Unable to reach AgentMail API (request blocked by CDN/network). ${proxyHint}`
        };
      }

      if (statusCode === 401) {
        return {
          valid: false,
          statusCode,
          errorType: 'unauthorized',
          message: 'Authentication failed (401)'
        };
      }

      if (statusCode === 403) {
        return {
          valid: false,
          statusCode,
          errorType: 'forbidden',
          message:
            'API key authenticated but does not have permission for this operation (403). Organization/pod/inbox-scoped keys may be unable to list all inboxes.'
        };
      }

      if (statusCode === 429) {
        return {
          valid: false,
          statusCode,
          errorType: 'rate_limit',
          message: 'AgentMail rate limit reached (429)'
        };
      }

      console.error('AgentMail validation failed', {
        statusCode,
        errorName: error.name,
        message: safeErrorMessage(error)
      });

      return {
        valid: false,
        statusCode,
        errorType: 'service',
        message: statusCode
          ? `AgentMail service error (${statusCode})`
          : `AgentMail service error: ${safeErrorMessage(error)}`
      };
    }

    const code = networkCode(error);
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return {
        valid: false,
        errorType: 'dns',
        message: `Unable to reach AgentMail API (DNS failure: ${code})`
      };
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return {
        valid: false,
        errorType: 'timeout',
        message: `Unable to reach AgentMail API (${code})`
      };
    }
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
      return {
        valid: false,
        errorType: 'network',
        message: `Unable to reach AgentMail API (${code})`
      };
    }

    const message = safeErrorMessage(error);
    if (/fetch failed/i.test(message)) {
      return {
        valid: false,
        errorType: 'network',
        message: `Unable to reach AgentMail API (fetch failed${code ? `: ${code}` : ''})`
      };
    }

    console.error('AgentMail validation failed', {
      errorName: error instanceof Error ? error.name : typeof error,
      message,
      code
    });

    return {
      valid: false,
      errorType: 'unknown',
      message: message || 'Unable to reach AgentMail API'
    };
  }

  async listInboxes(): Promise<InboxInfo[]> {
    if (!this.client) throw new Error('API key not set');

    try {
      const response = await this.client.inboxes.list({ limit: 10 });
      return response.inboxes.map((inbox) => ({
        id: inbox.inboxId,
        email: inbox.email,
        name: inbox.displayName
      }));
    } catch (error) {
      console.error('Failed to list inboxes:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error)
      });
      throw error;
    }
  }

  async listMessages(inboxId: string, limit: number = 100): Promise<Message[]> {
    if (!this.client) throw new Error('API key not set');

    try {
      const response = await this.client.inboxes.messages.list(inboxId, { limit });

      return response.messages.map((msg) => {
        const labels = msg.labels || [];
        const isSent = labels.includes('sent');
        const isArchived = labels.includes('archived');

        let folder: FolderType;
        if (isSent) {
          folder = FolderType.SENT;
        } else if (isArchived) {
          folder = FolderType.ARCHIVE;
        } else {
          folder = FolderType.INBOX;
        }

        return {
          id: msg.messageId,
          inboxId: inboxId,
          threadId: msg.threadId,
          from: msg.from || '',
          to: msg.to || [],
          cc: msg.cc,
          subject: msg.subject || '(No Subject)',
          text: msg.preview || '',
          html: '',
          date: new Date(msg.timestamp).getTime(),
          labels: labels,
          folder: folder,
          unread: labels.includes('unread')
        };
      });
    } catch (error) {
      console.error('Failed to list messages:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error)
      });
      throw error;
    }
  }

  async sendMessage(inboxId: string, message: ComposeMessage): Promise<string> {
    if (!this.client) throw new Error('API key not set');

    try {
      const response = await this.client.inboxes.messages.send(inboxId, {
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        text: message.text,
        html: message.html
      });

      return response.messageId;
    } catch (error) {
      console.error('Failed to send message:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error)
      });
      throw error;
    }
  }

  async replyToMessage(inboxId: string, messageId: string, text: string, html?: string): Promise<string> {
    if (!this.client) throw new Error('API key not set');

    try {
      const response = await this.client.inboxes.messages.reply(inboxId, messageId, {
        text,
        html
      });

      return response.messageId;
    } catch (error) {
      console.error('Failed to reply to message:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error)
      });
      throw error;
    }
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    if (!this.client) throw new Error('API key not set');

    try {
      await this.client.inboxes.messages.delete(inboxId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error)
      });
      throw error;
    }
  }

  async archiveMessages(inboxId: string, messageIds: string[]): Promise<void> {
    if (!this.client) throw new Error('API key not set');
    if (messageIds.length === 0) return;

    const uniqueIds = Array.from(new Set(messageIds));
    const chunkSize = 50;

    try {
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        await this.client.inboxes.messages.batchUpdate(inboxId, {
          messageIds: chunk,
          addLabels: ['archived']
        });
      }
    } catch (error) {
      console.error('Failed to archive messages:', {
        errorName: error instanceof Error ? error.name : typeof error,
        statusCode: error instanceof AgentMailError ? error.statusCode : undefined,
        message: safeErrorMessage(error),
        count: uniqueIds.length
      });
      throw error;
    }
  }
}
