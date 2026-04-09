const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
let sass = null;
try {
    sass = require('sass');
} catch (e) {
    console.warn('Sass not found, skipping SCSS compilation.');
}
const dracoPath = path.join(
    __dirname,
    'node_modules',
    'roavatar-renderer',
    'dist',
    'draco_decoder.js',
);

const manifestPath = path.join(__dirname, 'manifest.json');
const packagePath = path.join(__dirname, 'package.json');
let pkg;

try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    if (pkg.version !== manifest.version) {
        pkg.version = manifest.version;
        fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
        console.log(`Updated package.json version to ${manifest.version}`);
    }
} catch (e) {
    console.error(
        'Failed to sync version from manifest.json to package.json',
        e,
    );
    process.exit(1);
}
//E why the hell did i make this comment?
const bannerText = `/*!
 * ${pkg.name} v${pkg.version}
 * License: GPL-3.0
 * Repository: https://github.com/NotValra/RoValra
 * This extension is provided AS-IS without warranty.
 */`;

const commonConfig = {
    minify: false,

    minifyWhitespace: false,
    minifySyntax: true,
    minifyIdentifiers: false,

    keepNames: true,

    logLevel: 'info',

    legalComments: 'none',

    banner: {
        js: bannerText,
        css: bannerText,
    },
};

function compileScssFile(inputFile, outputFile) {
    if (!sass) return;
    try {
        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const result = sass.compile(inputFile, { style: 'compressed' });
        fs.writeFileSync(outputFile, bannerText + '\n' + result.css);
        console.log(`Compiled SCSS: ${inputFile} -> ${outputFile}`);
    } catch (e) {
        console.error(`SCSS Compilation Failed for ${inputFile}:`, e.message);
    }
}

esbuild
    .build({
        ...commonConfig,
        entryPoints: ['src/background/background.js'],
        outfile: 'dist/background.js',
        bundle: true,
    })
    .catch(() => process.exit(1));

esbuild
    .build({
        ...commonConfig,
        entryPoints: ['src/content/core/xhr/intercept.js'],
        outfile: 'dist/intercept.js',
        bundle: false,
    })
    .catch(() => process.exit(1));

const cssDir = path.join(__dirname, 'src', 'css');

if (sass && fs.existsSync(cssDir)) {
    const mainScss = path.join(cssDir, 'main.scss');
    if (fs.existsSync(mainScss)) {
        try {
            const result = sass.compile(mainScss, { style: 'compressed' });
            if (!fs.existsSync('dist/css'))
                fs.mkdirSync('dist/css', { recursive: true });
            fs.writeFileSync(
                'dist/css/rovalra.css',
                bannerText + '\n' + result.css,
            );
            console.log(
                'Compiled SCSS: src/css/main.scss -> dist/css/rovalra.css',
            );
        } catch (e) {
            console.error('SCSS Compilation Failed:', e.message);
        }
    }

    const independentCssDir = path.join(cssDir, 'independent');
    if (fs.existsSync(independentCssDir)) {
        const walkSync = (dir, callback) => {
            fs.readdirSync(dir).forEach((file) => {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    walkSync(filePath, callback);
                } else if (file.endsWith('.scss')) {
                    callback(filePath);
                }
            });
        };

        walkSync(independentCssDir, (filePath) => {
            const relativePath = path.relative(independentCssDir, filePath);
            const outputName = relativePath
                .replace(/\\|\//g, '-')
                .replace('.scss', '.css');
            compileScssFile(filePath, path.join('dist', 'css', outputName));
        });
    }
}

if (!fs.existsSync(dracoPath)) {
    console.error(`Error: draco_decoder.js not found at ${dracoPath}`);
    process.exit(1);
}
const dracoSource = fs.readFileSync(dracoPath, 'utf8');

esbuild
    .build({
        ...commonConfig,
        entryPoints: ['src/content/index.js'],
        outfile: 'dist/content.js',
        bundle: true,
        // This injects Draco directly into the content script context for roavatar-renderer
        banner: {
            js: bannerText + '\n' + dracoSource,
        },
    })
    .catch(() => process.exit(1));
if (fs.existsSync(cssDir)) {
    const cssFiles = fs
        .readdirSync(cssDir)
        .filter((file) => file.endsWith('.css'))
        .map((file) => path.join(cssDir, file));

    if (cssFiles.length > 0) {
        esbuild
            .build({
                ...commonConfig,
                entryPoints: cssFiles,
                outdir: 'dist/css',
            })
            .catch(() => process.exit(1));
    }
}

function processDirectory(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            processDirectory(srcPath, destPath);
        } else {
            const ext = path.extname(entry.name).toLowerCase();

            if (ext === '.js' || ext === '.css') {
                try {
                    const content = fs.readFileSync(srcPath, 'utf8');

                    const result = esbuild.transformSync(content, {
                        loader: ext.slice(1),
                        minifyWhitespace: false,
                        minifySyntax: true,
                        minifyIdentifiers: false,
                        keepNames: true,
                        legalComments: 'none',
                        banner: bannerText,
                    });

                    fs.writeFileSync(destPath, result.code);
                    console.log(`Copied, Compressed & Bannered: ${entry.name}`);
                } catch (err) {
                    console.error(
                        `Error processing ${entry.name}, copying raw instead.`,
                        err,
                    );
                    fs.copyFileSync(srcPath, destPath);
                }
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

if (fs.existsSync('public')) {
    processDirectory('public', path.join('dist', 'public'));
}
if (fs.existsSync('assets')) {
    processDirectory('assets', path.join('dist', 'assets'));
}

if (fs.existsSync('manifest.json')) {
    try {
        const manifestContent = fs.readFileSync('manifest.json', 'utf8');
        const manifestJson = JSON.parse(manifestContent);
        fs.writeFileSync('dist/manifest.json', JSON.stringify(manifestJson));
    } catch (e) {
        console.log(e);
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
    }
}
