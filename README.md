# AgentMail Desktop

A Windows 11–compatible desktop mail client for [AgentMail](https://www.agentmail.to/), built with Electron, React, and TypeScript.

## Features

- **Secure API Key Storage**: API keys are encrypted using Electron's `safeStorage` API (Windows Credential Manager / DPAPI)
- **Multi-Inbox Support**: Manage up to 3 inboxes from a single API key
- **Local SQLite Archive**: Messages are cached locally for offline access
- **Folder Management**: Inbox, Sent, and Archive folders with automatic label mapping
- **Message Operations**: Compose, send, reply, and delete messages with cloud synchronization
- **Auto-Sync**: Automatic message polling (60s interval) when the app is focused
- **Modern UI**: Clean, responsive interface optimized for Windows 11

## Prerequisites

- Node.js 18+ and npm
- Windows 11 (for building the installer)
- AgentMail API Key (get one at [agentmail.to](https://www.agentmail.to/))

## Development Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd agentmail-desktop
   npm install
   ```

2. **Run in development mode**:
   ```bash
   npm run dev
   ```
   This will start three concurrent processes:
   - Main process compilation (webpack)
   - Preload script compilation (webpack)
   - Renderer process dev server (port 3000)

3. **Start the Electron app**:
   ```bash
   npm start
   ```

## Building for Windows 11

### On Windows

To build a production-ready installer and portable executable for Windows 11:

```bash
npm run build:win
```

This will create two artifacts in the `release/` directory:
- **NSIS Installer**: `AgentMail Desktop Setup X.X.X.exe` (installable .exe)
- **Portable**: `AgentMail Desktop X.X.X.exe` (standalone, no installation required)

### On Linux/macOS

The project is configured for Windows builds, but you can compile the source code on any platform:

```bash
npm run build
```

To create the Windows installer from Linux/macOS, you'll need:
- Wine (for NSIS)
- Or use a Windows CI environment (GitHub Actions, etc.)

For detailed electron-builder configuration, see `package.json` under the `build` section.

## Project Structure

```
agentmail-desktop/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry point, IPC handlers
│   │   ├── preload.ts     # Preload script (context bridge)
│   │   ├── database.ts    # SQLite database manager
│   │   └── agentmail-api.ts # AgentMail SDK wrapper
│   ├── renderer/          # React frontend
│   │   ├── components/    # UI components
│   │   ├── App.tsx        # Root component
│   │   ├── index.tsx      # React entry point
│   │   └── styles.css     # Global styles
│   ├── shared/            # Shared types and constants
│   │   └── types.ts
│   └── tests/             # Unit tests
├── dist/                  # Compiled output
├── release/               # Built installers (after npm run build:win)
├── package.json
├── tsconfig.json
├── webpack.*.config.js    # Webpack configurations
└── README.md
```

## How It Works

### Secure Key Storage

- API keys are encrypted using Electron's `safeStorage` module
- On Windows, this uses DPAPI (Data Protection API) integrated with Windows Credential Manager
- Keys are stored in `userData/config` table as encrypted base64 strings
- **Never logged or stored in plain text**

### Folder Mapping

AgentMail uses **labels** to categorize messages. This client maps them to traditional folders:

| AgentMail Labels | Local Folder |
|------------------|--------------|
| `sent`           | **Sent**     |
| `archived`       | **Archive**  |
| _(none of above)_| **Inbox**    |

The mapping logic is in `src/main/agentmail-api.ts` (see `listMessages` method).

### Delete Behavior

When you delete a message in the UI:
1. A confirmation dialog appears
2. On confirmation, the message is **permanently deleted** from AgentMail cloud via `DELETE /v0/inboxes/{inbox_id}/messages/{message_id}`
3. The message is also removed from the local SQLite database

**This is irreversible** — there is no trash/recovery mechanism.

## Configuration

### Sync Interval

Auto-sync runs every **60 seconds** while the app window is focused. To change this:

Edit `src/main/main.ts`:
```typescript
const syncIntervalMs = 60000; // Change to desired interval in milliseconds
```

### Inbox Limit

The app supports **up to 3 inboxes** per API key. To change this limit:

Edit `src/renderer/components/SetupPage.tsx`:
```typescript
} else if (prev.length < 3) {  // Change 3 to your desired limit
```

## Testing

Run unit tests:

```bash
npm test
```

Tests cover:
- Database operations (save/retrieve/delete messages)
- API integration (mocked AgentMail SDK calls)
- Folder mapping logic

Test files are located in `src/tests/`.

## Troubleshooting

### "Encryption not available"

If you see this error, `safeStorage` is not available on your system. This can happen if:
- You're running on an unsupported platform
- The app is running in an insecure context

**Solution**: Ensure you're running on Windows 10/11 or macOS with appropriate permissions.

### Messages not syncing

1. Check your internet connection
2. Verify your API key is still valid (try re-entering it)
3. Check the Electron dev console for errors (View → Toggle Developer Tools)

### Build fails on Linux

electron-builder needs Wine to create Windows installers on Linux. Install it:

```bash
# Ubuntu/Debian
sudo apt install wine64

# Arch
sudo pacman -S wine
```

Or build on a Windows machine/VM.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

## License

MIT

## Support

For AgentMail API issues, see [docs.agentmail.to](https://docs.agentmail.to/)  
For this client, open an issue in the repository.
