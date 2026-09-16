import { AgentMailClient } from 'agentmail';
import { InboxInfo, Message, ComposeMessage, FolderType } from '../shared/types';

export class AgentMailAPI {
  private client: AgentMailClient | null = null;

  setApiKey(apiKey: string): void {
    this.client = new AgentMailClient({ apiKey });
  }

  async validateApiKey(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.inboxes.list({ limit: 1 });
      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }

  async listInboxes(): Promise<InboxInfo[]> {
    if (!this.client) throw new Error('API key not set');
    
    try {
      const response = await this.client.inboxes.list({ limit: 10 });
      return response.data.map(inbox => ({
        id: inbox.id,
        email: inbox.email,
        name: inbox.name
      }));
    } catch (error) {
      console.error('Failed to list inboxes:', error);
      throw error;
    }
  }

  async listMessages(inboxId: string, limit: number = 100): Promise<Message[]> {
    if (!this.client) throw new Error('API key not set');

    try {
      const response = await this.client.inboxes.messages.list(inboxId, { limit });
      
      return response.data.map(msg => {
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
          id: msg.id,
          inboxId: inboxId,
          threadId: msg.threadId,
          from: msg.from?.email || '',
          to: msg.to?.map(t => t.email) || [],
          cc: msg.cc?.map(c => c.email),
          subject: msg.subject || '(No Subject)',
          text: msg.text || '',
          html: msg.html || '',
          date: new Date(msg.date).getTime(),
          labels: labels,
          folder: folder,
          unread: labels.includes('unread')
        };
      });
    } catch (error) {
      console.error('Failed to list messages:', error);
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
      console.error('Failed to send message:', error);
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
      console.error('Failed to reply to message:', error);
      throw error;
    }
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    if (!this.client) throw new Error('API key not set');

    try {
      await this.client.inboxes.messages.delete(inboxId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
      throw error;
    }
  }
}
