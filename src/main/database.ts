import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import { Message, AppConfig } from '../shared/types';

export class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'agentmail.db');
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_addresses TEXT NOT NULL,
        cc_addresses TEXT,
        subject TEXT,
        text_body TEXT,
        html_body TEXT,
        date INTEGER NOT NULL,
        labels TEXT NOT NULL,
        folder TEXT NOT NULL,
        unread INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(inbox_id);
      CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder);
      CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inboxes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT
      );
    `);
  }

  getConfig(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM config WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setConfig(key: string, value: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  saveInbox(id: string, email: string, name?: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO inboxes (id, email, name) VALUES (?, ?, ?)');
    stmt.run(id, email, name || null);
  }

  getInboxes(): Array<{ id: string; email: string; name: string | null }> {
    const stmt = this.db.prepare('SELECT id, email, name FROM inboxes');
    return stmt.all() as Array<{ id: string; email: string; name: string | null }>;
  }

  saveMessage(message: Message): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages 
      (id, inbox_id, thread_id, from_address, to_addresses, cc_addresses, subject, text_body, html_body, date, labels, folder, unread)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      message.id,
      message.inboxId,
      message.threadId,
      message.from,
      JSON.stringify(message.to),
      message.cc ? JSON.stringify(message.cc) : null,
      message.subject,
      message.text,
      message.html,
      message.date,
      JSON.stringify(message.labels),
      message.folder,
      message.unread ? 1 : 0
    );
  }

  getMessages(inboxId: string, folder: string, limit: number = 100, offset: number = 0): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE inbox_id = ? AND folder = ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(inboxId, folder, limit, offset) as any[];
    return rows.map(this.rowToMessage);
  }

  getMessage(messageId: string): Message | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(messageId) as any;
    return row ? this.rowToMessage(row) : null;
  }

  deleteMessage(messageId: string): void {
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
    stmt.run(messageId);
  }

  markAsRead(messageId: string): void {
    const stmt = this.db.prepare('UPDATE messages SET unread = 0 WHERE id = ?');
    stmt.run(messageId);
  }

  getUnreadCount(inboxId: string, folder: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE inbox_id = ? AND folder = ? AND unread = 1');
    const row = stmt.get(inboxId, folder) as { count: number };
    return row.count;
  }

  private rowToMessage(row: any): Message {
    return {
      id: row.id,
      inboxId: row.inbox_id,
      threadId: row.thread_id,
      from: row.from_address,
      to: JSON.parse(row.to_addresses),
      cc: row.cc_addresses ? JSON.parse(row.cc_addresses) : undefined,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
      date: row.date,
      labels: JSON.parse(row.labels),
      folder: row.folder,
      unread: row.unread === 1
    };
  }

  close(): void {
    this.db.close();
  }
}
