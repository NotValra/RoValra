#!/bin/bash

echo "Building Firefox extension locally..."

# Create Firefox build directory
FIREFOX_DIR="firefox-extension"
if [ -d "$FIREFOX_DIR" ]; then
    rm -rf "$FIREFOX_DIR"
fi
mkdir "$FIREFOX_DIR"

# Copy all extension files
echo "Copying files..."
cp -r Assets Avatar catalog data Games HiddenGames misc Rules "$FIREFOX_DIR/"
cp background.js browser-polyfill.js content.js settings.js "$FIREFOX_DIR/"
cp manifest-firefox.json "$FIREFOX_DIR/manifest.json"
cp README.md LICENSE FIREFOX_INSTALLATION.md "$FIREFOX_DIR/"

echo "Firefox extension built in: $FIREFOX_DIR/"
echo ""
echo "To install in Firefox:"
echo "1. Open Firefox"
echo "2. Go to about:debugging"
echo "3. Click 'This Firefox'"
echo "4. Click 'Load Temporary Add-on...'"
echo "5. Navigate to the $FIREFOX_DIR folder"
echo "6. Select manifest.json" 