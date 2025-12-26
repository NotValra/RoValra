const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');


const bannerText = `/*!
 * ${pkg.name} v${pkg.version}
 * License: GPL-3.0
 * Repository: https://github.com/NotValra/RoValra
 * This extension is provided AS-IS without warranty.
 */`;

const commonConfig = {
  minify: false,            
  
  minifyWhitespace: true,   
  minifySyntax: true,       
  minifyIdentifiers: false, 
                            
  
  keepNames: true,          
  
  logLevel: 'info',
  
  legalComments: 'none', 
  
  banner: {
    js: bannerText,
    css: bannerText
  },
};


esbuild.build({
  ...commonConfig,
  entryPoints: ['src/content/index.js'],
  outfile: 'dist/content.js',
  bundle: true,
}).catch(() => process.exit(1));

esbuild.build({
  ...commonConfig,
  entryPoints: ['src/background/background.js'],
  outfile: 'dist/background.js',
  bundle: true,
}).catch(() => process.exit(1));

esbuild.build({
  ...commonConfig,
  entryPoints: ['src/content/core/xhr/intercept.js'],
  outfile: 'dist/intercept.js',
  bundle: false, 
}).catch(() => process.exit(1));

esbuild.build({
  ...commonConfig,
  entryPoints: ['YappDollar.js'],
  outfile: 'dist/YappDollar.js',
  bundle: false,
}).catch(() => process.exit(1));



const cssDir = path.join(__dirname, 'src', 'css');
if (fs.existsSync(cssDir)) {
    const cssFiles = fs.readdirSync(cssDir)
        .filter(file => file.endsWith('.css'))
        .map(file => path.join(cssDir, file));

    if (cssFiles.length > 0) {
        esbuild.build({
            ...commonConfig,
            entryPoints: cssFiles,
            outdir: 'dist/css',
        }).catch(() => process.exit(1));
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
                        minifyWhitespace: true,
                        minifySyntax: true,
                        minifyIdentifiers: false,
                        keepNames: true,
                        legalComments: 'none',
                        banner: bannerText
                    });
                    
                    fs.writeFileSync(destPath, result.code);
                    console.log(`Copied, Compressed & Bannered: ${entry.name}`);
                } catch (err) {
                    console.error(`Error processing ${entry.name}, copying raw instead.`);
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

if (fs.existsSync('manifest.json')) {
    try {
        const manifestContent = fs.readFileSync('manifest.json', 'utf8');
        const manifestJson = JSON.parse(manifestContent);
        fs.writeFileSync('dist/manifest.json', JSON.stringify(manifestJson)); 
    } catch (e) {
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
    }
}
