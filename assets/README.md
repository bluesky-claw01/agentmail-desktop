# Assets

This directory should contain the application icon for Windows builds.

## Required Files

- `icon.ico` - Windows application icon (256x256 recommended)

You can generate an `.ico` file from a PNG using online tools or ImageMagick:

```bash
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

For now, electron-builder will use a default icon if this file is missing.
