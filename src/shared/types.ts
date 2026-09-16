export interface AppConfig {
  selectedInboxes: string[];
  syncInterval: number;
  lastSync?: number;
}

export interface InboxInfo {
  id: string;
  email: string;
  name?: string;
}

export interface Message {
  id: string;
  inboxId: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  date: number;
  labels: string[];
  folder: 'inbox' | 'sent' | 'archive';
  unread: boolean;
}

export interface ComposeMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
}

export enum FolderType {
  INBOX = 'inbox',
  SENT = 'sent',
  ARCHIVE = 'archive'
}
