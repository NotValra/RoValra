import * as fs from 'fs';

fs.copyFileSync("manifest.json", "dist/manifest.json");
if (fs.existsSync("dist/Assets")) {
    fs.rmSync("dist/Assets", {recursive: true});
}
fs.cpSync("public", "dist/public", {recursive: true});
fs.cpSync("public/Assets", "dist/assets", {recursive: true});
