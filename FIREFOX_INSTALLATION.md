# Firefox Installation Guide for RoValra

## Installation Steps

### Method 1: Temporary Installation (Recommended for Testing)

1. **Download the Extension**
   - Download the extension files as a ZIP archive
   - Extract the ZIP file to a folder on your computer

2. **Open Firefox**
   - Launch Firefox browser

3. **Access about:debugging**
   - Type `about:debugging` in the Firefox address bar
   - Press Enter

4. **Load Temporary Add-on**
   - Click on "This Firefox" tab
   - Click "Load Temporary Add-on..."
   - Navigate to the extracted extension folder
   - Select the `manifest.json` file
   - Click "Open"

5. **Verify Installation**
   - The extension should now appear in the list
   - You should see "RoValra - Roblox Improved" in the add-ons list

### Method 2: Permanent Installation (Advanced Users)

1. **Create Extension Directory**
   - Navigate to your Firefox profile directory:
     - Windows: `%APPDATA%\Mozilla\Firefox\Profiles\[profile].default\extensions\`
     - macOS: `~/Library/Application Support/Firefox/Profiles/[profile].default/extensions/`
     - Linux: `~/.mozilla/firefox/[profile].default/extensions/`

2. **Copy Extension Files**
   - Create a folder named `rovalra@extension.com`
   - Copy all extension files into this folder

3. **Restart Firefox**
   - Close Firefox completely
   - Restart Firefox
   - The extension should be permanently installed

## Troubleshooting

### Extension Not Loading

1. **Check Firefox Version**
   - Ensure you're using Firefox 109.0 or later
   - Go to `about:about` to check your version

2. **Check Console for Errors**
   - Press F12 to open Developer Tools
   - Go to Console tab
   - Look for any error messages related to the extension

3. **Verify Manifest File**
   - Ensure `manifest.json` is properly formatted
   - Check that all referenced files exist

### Extension Not Working on Roblox

1. **Check Permissions**
   - Go to `about:addons`
   - Find RoValra in the list
   - Click "Permissions" and ensure it has access to Roblox sites

2. **Clear Browser Cache**
   - Go to `about:preferences#privacy`
   - Click "Clear Data" under Cookies and Site Data

3. **Disable Other Extensions**
   - Temporarily disable other Roblox-related extensions
   - Test if RoValra works without conflicts

### Common Issues

1. **"Extension not compatible" Error**
   - This usually means Firefox version is too old
   - Update Firefox to the latest version

2. **Extension Disappears After Restart**
   - This happens with temporary installations
   - Use Method 2 for permanent installation

3. **Features Not Working**
   - Check the browser console for JavaScript errors
   - Ensure you're on a Roblox page
   - Try refreshing the page

## Browser Compatibility

This extension has been tested with:
- Firefox 109.0+
- Chrome 88.0+
- Edge 88.0+

## Testing the Installation

To verify that the extension is working correctly:

1. **Open Developer Tools**
   - Press F12 or right-click and select "Inspect Element"
   - Go to the Console tab

2. **Check for Extension Messages**
   - Look for messages starting with "RoValra" or "Firefox compatibility"
   - You should see initialization messages from the extension

3. **Test on Roblox**
   - Go to any Roblox page (e.g., https://www.roblox.com)
   - Check if extension features are working
   - Look for any error messages in the console

4. **Run Compatibility Test**
   - Open the browser console
   - Type: `chrome.runtime.getURL('firefox-compatibility.js')`
   - If this returns a URL, the extension is loaded correctly

## Support

If you encounter issues:

1. Check the browser console for error messages
2. Ensure you're using a supported Firefox version
3. Try disabling other extensions temporarily
4. Report issues with specific error messages and steps to reproduce

## Features

All features available in the Chrome version should work in Firefox:
- Hidden catalog items
- Item sales tracking
- Group games
- User games
- Universal sniper
- Region selector
- And more!

## Notes

- The extension uses a browser compatibility layer to ensure cross-browser functionality
- Some features may behave slightly differently due to browser-specific implementations
- Performance may vary between browsers 