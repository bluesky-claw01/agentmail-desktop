# Assets

This directory contains platform-specific assets for building the application.

## Required Files

### Icons

- `icon.ico` - Windows application icon (256x256 recommended)
- `icon.icns` - macOS application icon (1024x1024 recommended)

You can generate platform icons from a PNG using online tools or ImageMagick:

**Windows (.ico):**
```bash
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

**macOS (.icns):**
```bash
# Create iconset directory
mkdir icon.iconset

# Generate various sizes (macOS requires specific resolutions)
magick convert icon.png -resize 16x16 icon.iconset/icon_16x16.png
magick convert icon.png -resize 32x32 icon.iconset/icon_16x16@2x.png
magick convert icon.png -resize 32x32 icon.iconset/icon_32x32.png
magick convert icon.png -resize 64x64 icon.iconset/icon_32x32@2x.png
magick convert icon.png -resize 128x128 icon.iconset/icon_128x128.png
magick convert icon.png -resize 256x256 icon.iconset/icon_128x128@2x.png
magick convert icon.png -resize 256x256 icon.iconset/icon_256x256.png
magick convert icon.png -resize 512x512 icon.iconset/icon_256x256@2x.png
magick convert icon.png -resize 512x512 icon.iconset/icon_512x512.png
magick convert icon.png -resize 1024x1024 icon.iconset/icon_512x512@2x.png

# Convert to icns
iconutil -c icns icon.iconset -o icon.icns

# Clean up
rm -rf icon.iconset
```

Alternatively, use online converters like [CloudConvert](https://cloudconvert.com/png-to-icns).

### macOS Entitlements

- `entitlements.mac.plist` - Required for macOS hardened runtime (already included)

For now, electron-builder will use default icons if custom icons are missing.
