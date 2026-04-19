import { execSync } from 'child_process';

function run(cmd) {
    execSync(cmd, { stdio: 'inherit', stderr: 'inherit' });
}

const isProd = process.argv.find(arg => arg === "prod");
const passes = isProd ? "--passes=10" : "--passes=1";

run("node ./scripts/preBuild.mjs");
run(`npx vite build --config vite/vite.content.config.js -- ${passes}`);
run(`npx vite build --config vite/vite.background.config.js -- ${passes}`);
run(`npx vite build --config vite/vite.intercept.config.js -- ${passes}`);
run(`npx vite build --config vite/vite.css.config.js`);
run("node ./scripts/postBuild.mjs");
