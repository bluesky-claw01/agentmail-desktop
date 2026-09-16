import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import { DatabaseManager } from './database';
import { AgentMailAPI } from './agentmail-api';
import { ComposeMessage } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseManager;
let api: AgentMailAPI;
let syncInterval: NodeJS.Timeout | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  db = new DatabaseManager();
  api = new AgentMailAPI();
  
  loadApiKeyAndInitialize();
  setupIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

function loadApiKeyAndInitialize() {
  const encryptedKey = db.getConfig('api_key_encrypted');
  if (encryptedKey && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(encryptedKey, 'base64');
      const apiKey = safeStorage.decryptString(buffer);
      api.setApiKey(apiKey);
      startAutoSync();
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
    }
  }
}

function startAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  const syncIntervalMs = 60000;
  
  syncInterval = setInterval(async () => {
    if (!mainWindow || !mainWindow.isFocused()) return;
    
    try {
      await syncAllInboxes();
      mainWindow?.webContents.send('sync-completed');
    } catch (error) {
      console.error('Auto-sync failed:', error);
    }
  }, syncIntervalMs);
}

async function syncAllInboxes() {
  const inboxes = db.getInboxes();
  
  for (const inbox of inboxes) {
    try {
      const messages = await api.listMessages(inbox.id);
      
      for (const message of messages) {
        db.saveMessage(message);
      }
    } catch (error) {
      console.error(`Failed to sync inbox ${inbox.id}:`, error);
    }
  }
  
  db.setConfig('last_sync', Date.now().toString());
}

function setupIpcHandlers() {
  ipcMain.handle('is-encryption-available', () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('has-api-key', () => {
    const encryptedKey = db.getConfig('api_key_encrypted');
    return !!encryptedKey;
  });

  ipcMain.handle('set-api-key', async (event, apiKey: string) => {
    try {
      api.setApiKey(apiKey);
      const isValid = await api.validateApiKey();
      
      if (!isValid) {
        return { success: false, error: 'Invalid API key' };
      }

      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(apiKey);
        const encrypted = buffer.toString('base64');
        db.setConfig('api_key_encrypted', encrypted);
        startAutoSync();
        return { success: true };
      } else {
        return { success: false, error: 'Encryption not available on this system' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-api-key', () => {
    try {
      db.setConfig('api_key_encrypted', '');
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('list-inboxes', async () => {
    try {
      const inboxes = await api.listInboxes();
      return { success: true, data: inboxes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-selected-inboxes', (event, inboxIds: string[], inboxes: any[]) => {
    try {
      db.setConfig('selected_inboxes', JSON.stringify(inboxIds));
      
      for (const inbox of inboxes) {
        if (inboxIds.includes(inbox.id)) {
          db.saveInbox(inbox.id, inbox.email, inbox.name);
        }
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-selected-inboxes', () => {
    try {
      const selectedJson = db.getConfig('selected_inboxes');
      const selectedIds = selectedJson ? JSON.parse(selectedJson) : [];
      const inboxes = db.getInboxes();
      
      return { 
        success: true, 
        data: inboxes.filter(inbox => selectedIds.includes(inbox.id))
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sync-messages', async () => {
    try {
      await syncAllInboxes();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-messages', (event, inboxId: string, folder: string) => {
    try {
      const messages = db.getMessages(inboxId, folder);
      return { success: true, data: messages };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-message', (event, messageId: string) => {
    try {
      const message = db.getMessage(messageId);
      return { success: true, data: message };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('send-message', async (event, inboxId: string, message: ComposeMessage) => {
    try {
      const messageId = await api.sendMessage(inboxId, message);
      await syncAllInboxes();
      return { success: true, data: { messageId } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('reply-to-message', async (event, inboxId: string, messageId: string, text: string, html?: string) => {
    try {
      const replyId = await api.replyToMessage(inboxId, messageId, text, html);
      await syncAllInboxes();
      return { success: true, data: { messageId: replyId } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-message', async (event, inboxId: string, messageId: string) => {
    try {
      await api.deleteMessage(inboxId, messageId);
      db.deleteMessage(messageId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mark-as-read', (event, messageId: string) => {
    try {
      db.markAsRead(messageId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-unread-count', (event, inboxId: string, folder: string) => {
    try {
      const count = db.getUnreadCount(inboxId, folder);
      return { success: true, data: count };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
