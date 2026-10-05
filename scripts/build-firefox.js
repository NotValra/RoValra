// Creates a Firefox build in dist-firefox/ from the Chrome build in dist/.
// Firefox supports the chrome.* namespace; runtime differences are handled by
// src/content/core/firefoxCompat.js and src/firefox/. This adjusts the manifest, adds
// the background and MAIN world shims, the permission request page,
// and Firefox equivalents of ::-webkit-scrollbar CSS.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'dist');
const outDir = path.join(root, 'dist-firefox');

if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
    console.error('dist/manifest.json not found, run the Chrome build first.');
    process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(srcDir, outDir, { recursive: true });

const manifestPath = path.join(outDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const copyFirefoxFile = (source, target) =>
    fs.copyFileSync(
        path.join(root, 'src', 'firefox', source),
        path.join(outDir, target),
    );

const BACKGROUND_COMPAT_FILE = 'firefox-background-compat.js';
copyFirefoxFile('backgroundCompat.js', BACKGROUND_COMPAT_FILE);
if (manifest.background?.service_worker) {
    manifest.background = {
        scripts: [BACKGROUND_COMPAT_FILE, manifest.background.service_worker],
    };
}

copyFirefoxFile('permissionRequest.html', 'firefox-permission-request.html');
copyFirefoxFile('permissionRequest.js', 'firefox-permission-request.js');

for (const permission of ['contextMenus', 'webNavigation']) {
    if (!manifest.optional_permissions?.includes(permission)) continue;
    manifest.optional_permissions = manifest.optional_permissions.filter(
        (optionalPermission) => optionalPermission !== permission,
    );
    if (!manifest.permissions.includes(permission)) {
        manifest.permissions.push(permission);
    }
}

const EVENT_REPLAY_FILE = 'firefox-event-replay.js';
copyFirefoxFile('eventReplay.js', EVENT_REPLAY_FILE);
manifest.content_scripts.unshift({
    matches: ['*://*.roblox.com/*'],
    js: [EVENT_REPLAY_FILE],
    run_at: 'document_start',
    world: 'MAIN',
    all_frames: false,
});

async function addFirefoxScrollbarCss() {
    const { convertWebkitScrollbarCss } = await import(
        pathToFileURL(path.join(root, 'src', 'firefox', 'scrollbarCss.mjs'))
            .href
    );
    const cssDir = path.join(outDir, 'css');
    if (!fs.existsSync(cssDir)) return;
    for (const file of fs.readdirSync(cssDir)) {
        if (!file.endsWith('.css')) continue;
        const filePath = path.join(cssDir, file);
        const css = fs.readFileSync(filePath, 'utf8');
        const firefoxCss = convertWebkitScrollbarCss(css);
        if (firefoxCss) fs.writeFileSync(filePath, `${css}\n${firefoxCss}`);
    }
}

// rovalra.com: RoValra's own APIs. rbxcdn.com: Roblox's CDN (avatar meshes and
// textures from fts.rbxcdn.com, thumbnails). Without host permission, Firefox makes
// content script requests there as CORS requests, which fail with "CORS header
// 'Origin' cannot be added".
for (const hostPermission of ['*://*.rovalra.com/*', '*://*.rbxcdn.com/*']) {
    if (!manifest.host_permissions.includes(hostPermission)) {
        manifest.host_permissions.push(hostPermission);
    }
}

// addons.mozilla.org's linter can't parse files over 5MB, and content.js is bigger
// unminified. So for Firefox the Draco decoder build.js prepends to content.js is
// moved into its own content script (loaded right before it, so it shares the same
// sandbox), and content.js is minified. keepNames keeps function/class names.
function splitAndMinifyContentScript() {
    const contentPath = path.join(outDir, 'content.js');
    const dracoSource = fs.readFileSync(
        path.join(
            root,
            'node_modules',
            'roavatar-renderer',
            'dist',
            'draco_decoder.js',
        ),
        'utf8',
    );
    let content = fs.readFileSync(contentPath, 'utf8');

    const DRACO_FILE = 'draco_decoder.js';
    if (content.includes(dracoSource)) {
        content = content.replace(dracoSource, '');
        fs.writeFileSync(
            path.join(outDir, DRACO_FILE),
            esbuild.transformSync(dracoSource, {
                minify: true,
                legalComments: 'inline',
                charset: 'utf8',
            }).code,
        );
        const contentScript = manifest.content_scripts.find((script) =>
            script.js?.includes('content.js'),
        );
        contentScript.js.splice(
            contentScript.js.indexOf('content.js'),
            0,
            DRACO_FILE,
        );
    }

    fs.writeFileSync(
        contentPath,
        esbuild.transformSync(content, {
            minify: true,
            keepNames: true,
            legalComments: 'inline',
            charset: 'utf8',
        }).code,
    );
}
splitAndMinifyContentScript();

manifest.browser_specific_settings = {
    gecko: {
        id: '{7f4e2a91-6c83-4d15-9b72-a0e5f3c8146d}',
        // 140 is the first Firefox that supports data_collection_permissions (also
        // needed for world: "MAIN" content scripts, which need 128+)
        strict_min_version: '140.0',
        // Required by addons.mozilla.org for new add-ons; must match the privacy
        // policy (https://www.rovalra.com/privacy/). Data sent to RoValra's servers
        // by default: OAuth tokens (authenticationInfo), Roblox user ID and username
        // (personallyIdentifyingInfo) and place/server IDs read from Roblox pages
        // (websiteContent). Playtime tracking is off by default and locked remotely,
        // so websiteActivity isn't declared; add it back if playtime is re-enabled.
        data_collection_permissions: {
            required: [
                'authenticationInfo',
                'personallyIdentifyingInfo',
                'websiteContent',
            ],
        },
    },
    // Firefox for Android supports data_collection_permissions from 142
    gecko_android: {
        strict_min_version: '142.0',
    },
};

// Pretty-printed so the Firefox manifest is easy to read and diff
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

addFirefoxScrollbarCss()
    .then(() => console.log('Built Firefox extension: dist -> dist-firefox'))
    .catch((error) => {
        console.error('Failed to build Firefox extension', error);
        process.exit(1);
    });
