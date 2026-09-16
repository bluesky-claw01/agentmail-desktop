import { DatabaseManager } from '../main/database';
import { Message, FolderType } from '../shared/types';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-agentmail'
  }
}));

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  const testDbPath = '/tmp/test-agentmail';

  beforeEach(() => {
    if (!fs.existsSync(testDbPath)) {
      fs.mkdirSync(testDbPath, { recursive: true });
    }
    db = new DatabaseManager();
  });

  afterEach(() => {
    db.close();
    const dbFile = path.join(testDbPath, 'agentmail.db');
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
    }
  });

  test('should save and retrieve config', () => {
    db.setConfig('test_key', 'test_value');
    const value = db.getConfig('test_key');
    expect(value).toBe('test_value');
  });

  test('should save and retrieve inbox', () => {
    db.saveInbox('inbox1', 'test@example.com', 'Test Inbox');
    const inboxes = db.getInboxes();
    
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).toBe('inbox1');
    expect(inboxes[0].email).toBe('test@example.com');
    expect(inboxes[0].name).toBe('Test Inbox');
  });

  test('should save and retrieve messages', () => {
    const message: Message = {
      id: 'msg1',
      inboxId: 'inbox1',
      threadId: 'thread1',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      text: 'Test body',
      date: Date.now(),
      labels: ['unread'],
      folder: FolderType.INBOX,
      unread: true
    };

    db.saveMessage(message);
    const messages = db.getMessages('inbox1', FolderType.INBOX);
    
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('msg1');
    expect(messages[0].subject).toBe('Test Subject');
  });

  test('should delete message', () => {
    const message: Message = {
      id: 'msg1',
      inboxId: 'inbox1',
      threadId: 'thread1',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      text: 'Test body',
      date: Date.now(),
      labels: [],
      folder: FolderType.INBOX,
      unread: false
    };

    db.saveMessage(message);
    db.deleteMessage('msg1');
    
    const retrieved = db.getMessage('msg1');
    expect(retrieved).toBeNull();
  });

  test('should correctly map folder from labels', () => {
    const sentMessage: Message = {
      id: 'msg1',
      inboxId: 'inbox1',
      threadId: 'thread1',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      text: 'Test body',
      date: Date.now(),
      labels: ['sent'],
      folder: FolderType.SENT,
      unread: false
    };

    db.saveMessage(sentMessage);
    const messages = db.getMessages('inbox1', FolderType.SENT);
    
    expect(messages).toHaveLength(1);
    expect(messages[0].folder).toBe(FolderType.SENT);
  });

  test('should mark message as read', () => {
    const message: Message = {
      id: 'msg1',
      inboxId: 'inbox1',
      threadId: 'thread1',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      text: 'Test body',
      date: Date.now(),
      labels: ['unread'],
      folder: FolderType.INBOX,
      unread: true
    };

    db.saveMessage(message);
    db.markAsRead('msg1');
    
    const retrieved = db.getMessage('msg1');
    expect(retrieved?.unread).toBe(false);
  });

  test('should get unread count', () => {
    const message1: Message = {
      id: 'msg1',
      inboxId: 'inbox1',
      threadId: 'thread1',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject 1',
      text: 'Test body',
      date: Date.now(),
      labels: ['unread'],
      folder: FolderType.INBOX,
      unread: true
    };

    const message2: Message = {
      id: 'msg2',
      inboxId: 'inbox1',
      threadId: 'thread2',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test Subject 2',
      text: 'Test body',
      date: Date.now(),
      labels: [],
      folder: FolderType.INBOX,
      unread: false
    };

    db.saveMessage(message1);
    db.saveMessage(message2);
    
    const count = db.getUnreadCount('inbox1', FolderType.INBOX);
    expect(count).toBe(1);
  });
});
