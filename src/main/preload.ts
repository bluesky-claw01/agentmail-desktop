import { contextBridge, ipcRenderer } from 'electron';
import { ComposeMessage, InboxInfo, Message } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  isEncryptionAvailable: () => ipcRenderer.invoke('is-encryption-available'),
  
  hasApiKey: () => ipcRenderer.invoke('has-api-key'),
  
  setApiKey: (apiKey: string) => ipcRenderer.invoke('set-api-key', apiKey),
  
  clearApiKey: () => ipcRenderer.invoke('clear-api-key'),
  
  listInboxes: () => ipcRenderer.invoke('list-inboxes'),
  
  saveSelectedInboxes: (inboxIds: string[], inboxes: InboxInfo[]) => 
    ipcRenderer.invoke('save-selected-inboxes', inboxIds, inboxes),
  
  getSelectedInboxes: () => ipcRenderer.invoke('get-selected-inboxes'),
  
  syncMessages: () => ipcRenderer.invoke('sync-messages'),
  
  getMessages: (inboxId: string, folder: string) => 
    ipcRenderer.invoke('get-messages', inboxId, folder),
  
  getMessage: (messageId: string) => 
    ipcRenderer.invoke('get-message', messageId),
  
  sendMessage: (inboxId: string, message: ComposeMessage) => 
    ipcRenderer.invoke('send-message', inboxId, message),
  
  replyToMessage: (inboxId: string, messageId: string, text: string, html?: string) =>
    ipcRenderer.invoke('reply-to-message', inboxId, messageId, text, html),
  
  deleteMessage: (inboxId: string, messageId: string) => 
    ipcRenderer.invoke('delete-message', inboxId, messageId),
  
  markAsRead: (messageId: string) => 
    ipcRenderer.invoke('mark-as-read', messageId),
  
  getUnreadCount: (inboxId: string, folder: string) => 
    ipcRenderer.invoke('get-unread-count', inboxId, folder),
  
  onSyncCompleted: (callback: () => void) => {
    ipcRenderer.on('sync-completed', callback);
  }
});
