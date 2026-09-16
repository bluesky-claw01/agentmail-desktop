# AgentMail Desktop — Architecture

This document describes the technical architecture of the AgentMail Desktop client.

## Overview

AgentMail Desktop is an Electron-based application that provides a native cross-platform mail client for the AgentMail API, supporting **Windows 11** and **macOS** (Apple Silicon + Intel). It uses:

- **Electron** for cross-platform desktop functionality
- **React** for the UI layer
- **TypeScript** for type safety
- **better-sqlite3** for local message caching
- **agentmail** official SDK for API communication
- **Webpack** for building and bundling

## Process Architecture

### Main Process (`src/main/`)

The Electron main process handles:
- Window management
- IPC (Inter-Process Communication) handlers
- Secure storage via `safeStorage`
- Database operations
- API calls to AgentMail
- Auto-sync scheduling

**Key Files:**

- **`main.ts`**: Entry point, window creation, IPC setup, auto-sync orchestration
- **`preload.ts`**: Context bridge exposing safe APIs to renderer
- **`database.ts`**: SQLite operations (messages, config, inboxes)
- **`agentmail-api.ts`**: Wrapper around the official `agentmail` SDK

### Renderer Process (`src/renderer/`)

The React-based UI runs in the renderer process with:
- `contextIsolation: true` for security
- Communication with main process via `window.electronAPI` (exposed in preload)

**Key Components:**

- **`App.tsx`**: Root component, manages auth state
- **`SetupPage.tsx`**: API key onboarding + inbox selection
- **`MainApp.tsx`**: Main mail interface orchestrator
- **`Sidebar.tsx`**: Inbox switcher + folder navigation
- **`MessageList.tsx`**: List of messages in current folder
- **`MessageDetail.tsx`**: Full message viewer
- **`ComposeWindow.tsx`**: Compose/reply modal

## Data Flow

### Initialization (First Launch)

```
User opens app
  ↓
App.tsx checks hasApiKey()
  ↓ (false)
SetupPage renders
  ↓
User enters API key
  ↓
Main process:
  1. Validates key via AgentMailAPI.validateApiKey()
  2. Encrypts key with safeStorage.encryptString()
  3. Stores encrypted key in DB config table
  ↓
SetupPage lists inboxes via AgentMailAPI.listInboxes()
  ↓
User selects ≤3 inboxes
  ↓
Main process:
  1. Saves selected inbox IDs to DB
  2. Triggers initial sync
  ↓
MainApp renders
```

### Message Sync Flow

```
User clicks "Sync" OR auto-sync timer fires
  ↓
MainApp calls syncMessages() via IPC
  ↓
Main process (main.ts):
  for each selected inbox:
    1. Call AgentMailAPI.listMessages(inboxId)
    2. For each message:
       - Map labels to folder (inbox/sent/archive)
       - Save to DB via DatabaseManager.saveMessage()
  ↓
Renderer re-fetches messages via getMessages(inboxId, folder)
  ↓
MessageList re-renders with updated data
```

### Delete Flow

```
User clicks "Delete" on a message
  ↓
Confirmation dialog
  ↓ (confirmed)
MainApp calls deleteMessage(inboxId, messageId) via IPC
  ↓
Main process:
  1. Call AgentMailAPI.deleteMessage(inboxId, messageId)
     → DELETE /v0/inboxes/{inbox_id}/messages/{message_id}
  2. If API call succeeds:
     DatabaseManager.deleteMessage(messageId)
  ↓
MainApp filters message from local state
MessageList re-renders
```

## Database Schema

### `messages` Table

Stores cached email messages.

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,           -- AgentMail message ID
  inbox_id TEXT NOT NULL,        -- Which inbox this belongs to
  thread_id TEXT NOT NULL,       -- Thread identifier
  from_address TEXT NOT NULL,    -- Sender email
  to_addresses TEXT NOT NULL,    -- JSON array of recipients
  cc_addresses TEXT,             -- JSON array (optional)
  subject TEXT,
  text_body TEXT,                -- Plain text content
  html_body TEXT,                -- HTML content
  date INTEGER NOT NULL,         -- Unix timestamp (ms)
  labels TEXT NOT NULL,          -- JSON array of label strings
  folder TEXT NOT NULL,          -- 'inbox' | 'sent' | 'archive'
  unread INTEGER NOT NULL,       -- 1 = unread, 0 = read
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_messages_inbox ON messages(inbox_id);
CREATE INDEX idx_messages_folder ON messages(folder);
CREATE INDEX idx_messages_date ON messages(date DESC);
```

### `config` Table

Key-value store for app configuration.

```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Key Values:**

- `api_key_encrypted`: Base64-encoded encrypted API key
- `selected_inboxes`: JSON array of inbox IDs
- `last_sync`: Timestamp of last successful sync

### `inboxes` Table

Metadata for selected inboxes.

```sql
CREATE TABLE inboxes (
  id TEXT PRIMARY KEY,      -- AgentMail inbox ID
  email TEXT NOT NULL,      -- Inbox email address
  name TEXT                 -- Display name (optional)
);
```

## Security Model

### API Key Storage

1. User enters key in plaintext (in memory only)
2. Main process validates key via API call
3. If valid, key is encrypted:
   ```typescript
   const buffer = safeStorage.encryptString(apiKey);
   const encrypted = buffer.toString('base64');
   db.setConfig('api_key_encrypted', encrypted);
   ```
4. On app restart:
   ```typescript
   const encryptedKey = db.getConfig('api_key_encrypted');
   const buffer = Buffer.from(encryptedKey, 'base64');
   const apiKey = safeStorage.decryptString(buffer);
   api.setApiKey(apiKey);
   ```

**Platform Integration:**

Electron's `safeStorage` automatically uses the most secure storage available on each platform:

- **Windows**: DPAPI (Data Protection API), keys are protected per-user account via Windows Credential Manager
- **macOS**: Keychain (macOS system-level secure storage), requires user authentication
- **Linux**: libsecret (GNOME Keyring or KDE Wallet if available)

**No code changes required** — the same TypeScript code works across all platforms. The OS-level integration is handled by Electron's native modules.

### Context Isolation

The renderer process cannot directly access Node.js APIs. All privileged operations go through the preload script's `contextBridge`:

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  setApiKey: (apiKey: string) => ipcRenderer.invoke('set-api-key', apiKey),
  deleteMessage: (inboxId: string, messageId: string) =>
    ipcRenderer.invoke('delete-message', inboxId, messageId),
  // ...
});
```

The renderer can only call explicitly exposed methods.

## Folder Mapping Logic

AgentMail uses a **label-based** system. This client maps labels to folders:

```typescript
// src/main/agentmail-api.ts
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
```

**Priority**: `sent` > `archived` > default (inbox)

## Auto-Sync

Auto-sync runs every 60 seconds **only when the app window is focused**.

```typescript
// src/main/main.ts
syncInterval = setInterval(async () => {
  if (!mainWindow || !mainWindow.isFocused()) return;
  
  await syncAllInboxes();
  mainWindow?.webContents.send('sync-completed');
}, syncIntervalMs);
```

This prevents unnecessary API calls when the app is minimized.

## Build Pipeline

### Development

```bash
npm run dev
```

Runs three concurrent webpack processes:

1. **Main**: `webpack --config webpack.main.config.js --watch`
2. **Preload**: `webpack --config webpack.preload.config.js --watch`
3. **Renderer**: `webpack serve --config webpack.renderer.config.js` (port 3000)

Then run `npm start` to launch Electron pointing to `http://localhost:3000`.

### Production

**Windows:**
```bash
npm run build:win
```

**macOS:**
```bash
npm run build:mac          # Universal binary (Apple Silicon + Intel)
npm run build:mac:arm64    # Apple Silicon only
npm run build:mac:x64      # Intel only
```

Steps:

1. **Compile main**: `webpack --config webpack.main.config.js --mode production`
   - Output: `dist/main/main.js`
2. **Compile preload**: `webpack --config webpack.preload.config.js --mode production`
   - Output: `dist/main/preload.js`
3. **Compile renderer**: `webpack --config webpack.renderer.config.js --mode production`
   - Output: `dist/renderer/` (HTML + JS + CSS)
4. **electron-builder**: Packages `dist/` into platform-specific installers
   - Windows: `release/AgentMail Desktop Setup X.X.X.exe` (NSIS) + portable .exe
   - macOS: `release/AgentMail Desktop-X.X.X-universal.dmg` + .zip

## Platform-Specific Build Configuration

### Windows

- **Targets**: NSIS installer (x64) + portable .exe (x64)
- **Icon**: `assets/icon.ico`
- **Installer Options**: User-selectable install directory, desktop/start menu shortcuts
- **Security**: DPAPI for key storage (automatic via `safeStorage`)

### macOS

- **Targets**: DMG (universal) + ZIP (universal)
- **Icon**: `assets/icon.icns`
- **Architectures**: 
  - Universal binary (default): Runs natively on both Apple Silicon (arm64) and Intel (x64)
  - Or build separate arm64/x64 binaries
- **Security**: Keychain for key storage (automatic via `safeStorage`)
- **Hardened Runtime**: Enabled (required for macOS 10.15+)
- **Entitlements**: `assets/entitlements.mac.plist`
  - JIT compilation allowed (for Electron/Chromium)
  - Network client access
  - Disable library validation (for native modules like better-sqlite3)

#### macOS Code Signing (Optional for v1)

For distribution outside development:

1. **Ad-hoc signing** (free, local development only):
   ```bash
   codesign --deep --force --sign - /Applications/AgentMail\ Desktop.app
   ```

2. **Developer ID signing** (requires paid Apple Developer account):
   - Set environment variables before building:
     ```bash
     export CSC_LINK=/path/to/certificate.p12
     export CSC_KEY_PASSWORD=cert-password
     npm run build:mac
     ```

3. **Notarization** (recommended for public distribution):
   - After signing, notarize with Apple:
     ```bash
     export APPLE_ID=your-id@example.com
     export APPLE_ID_PASSWORD=app-specific-password
     export APPLE_TEAM_ID=XXXXXXXXXX
     npm run build:mac
     ```
   - electron-builder handles the notarization workflow

**For v1, unsigned builds work fine.** Users can bypass Gatekeeper by right-clicking and selecting "Open."

## Testing Strategy

### Unit Tests

Located in `src/tests/`, using Jest + ts-jest.

**Coverage:**

- **`database.test.ts`**: SQLite operations
  - Save/retrieve config
  - Save/retrieve messages
  - Delete operations
  - Folder mapping
  - Unread counts
  
- **`agentmail-api.test.ts`**: API wrapper (mocked SDK)
  - API key validation
  - List inboxes
  - List messages
  - Send/reply/delete operations

### Manual Testing

Checklist for new builds (test on both Windows and macOS):

1. ✅ First launch: API key prompt
2. ✅ Inbox selection (3 max enforced)
3. ✅ Messages load and display
4. ✅ Compose sends successfully
5. ✅ Reply works
6. ✅ Delete removes from cloud + local
7. ✅ Key survives app restart (encrypted storage via safeStorage)
8. ✅ Auto-sync works (check console logs)
9. ✅ Window focus pauses/resumes sync
10. ✅ **macOS-specific**: Keychain integration works (prompts for access on first launch)

## Limitations & Future Work

### Current Limitations

1. **No attachments**: SDK supports attachments, but UI doesn't yet
2. **No threading UI**: Messages are flat; thread grouping not implemented
3. **No search**: Full-text search on local DB not implemented
4. **No HTML composer**: Only plain text compose
5. **No notifications**: No OS notifications for new mail

### Potential Improvements

- **Attachments**: Add file picker + display logic
- **Rich text editor**: Integrate Quill/TipTap for HTML emails
- **Search**: Add SQLite FTS5 for full-text search
- **Desktop notifications**: Use Electron `Notification` API
- **Threading**: Group messages by `thread_id`
- **Dark mode**: Implement theme switcher
- **Multiple API keys**: Support switching between different AgentMail accounts
- **Webhook receiver**: Run a local server for instant push notifications (instead of polling)

## Dependencies

### Production

- `agentmail` (^0.5.20): Official AgentMail SDK
- `better-sqlite3` (^11.7.0): Native SQLite3 bindings
- `react` (^18.3.1): UI framework
- `react-dom` (^18.3.1): React renderer
- `electron` (^33.2.1): Desktop framework

### Development

- `typescript` (^5.7.2): Language
- `webpack` (^5.97.1): Bundler
- `electron-builder` (^25.1.8): Installer creation
- `jest` + `ts-jest`: Testing
- `concurrently`: Run multiple npm scripts

## Debugging

### Electron DevTools

In development, DevTools open automatically. In production:

```typescript
// src/main/main.ts
mainWindow.webContents.openDevTools();
```

### Logging

- **Main process logs**: Shown in terminal where `npm start` runs
- **Renderer logs**: Shown in Electron DevTools console
- **IPC traffic**: Add logging in `main.ts` IPC handlers:
  ```typescript
  ipcMain.handle('some-action', async (event, ...args) => {
    console.log('[IPC] some-action called with:', args);
    // ...
  });
  ```

### Database Inspection

SQLite database location:

**Windows:**
```
%APPDATA%/agentmail-desktop/agentmail.db
```

**macOS:**
```
~/Library/Application Support/agentmail-desktop/agentmail.db
```

**Linux:**
```
~/.config/agentmail-desktop/agentmail.db
```

Use a tool like [DB Browser for SQLite](https://sqlitebrowser.org/) to inspect.

### Platform-Specific Debugging

**macOS Keychain:**

If key storage fails on macOS, check Keychain Access.app:
- Search for "Electron Safe Storage"
- Verify the app has permission to access the keychain
- Delete the entry and restart the app to re-prompt

**Windows Credential Manager:**

On Windows, stored keys appear in Credential Manager:
- Open Control Panel → Credential Manager
- Look under "Windows Credentials"
- Entry name: "Electron Safe Storage"

## API Reference (AgentMail)

This client uses the official `agentmail` npm SDK. Key methods:

- `client.inboxes.list()`: Get all inboxes
- `client.inboxes.messages.list(inboxId, { limit })`: List messages
- `client.inboxes.messages.send(inboxId, { to, subject, text })`: Send email
- `client.inboxes.messages.reply(inboxId, messageId, { text })`: Reply
- `client.inboxes.messages.delete(inboxId, messageId)`: Permanently delete

Full API docs: [docs.agentmail.to](https://docs.agentmail.to/)

## Contributing

When adding features:

1. Add types to `src/shared/types.ts`
2. Implement backend logic in `src/main/`
3. Add IPC handlers in `main.ts` + expose in `preload.ts`
4. Update UI components in `src/renderer/components/`
5. Write tests in `src/tests/`
6. Update this document and README
