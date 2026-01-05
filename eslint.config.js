import globals from 'globals';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseRestrictedSyntax = [
    {
        // Block raw MutationObserver
        selector: "NewExpression[callee.name='MutationObserver']",
        message:
            "⚠️ Do not use raw MutationObserver. Please use the 'observeElement' utility from 'core/observer.js' to ensure proper lifecycle management.",
    },
    {
        // Block innerHTML assignments that aren't wrapped in sanitize() or safeHtml``
        selector:
            "AssignmentExpression[left.property.name='innerHTML']:not([right.type='Literal']):not([right.type='TemplateLiteral'][right.expressions.length=0]):not([right.callee.property.name='sanitize']):not([right.callee.name='sanitize']):not([right.tag.name='safeHtml'])",
        message:
            '⚠️ Unsafe innerHTML assignment detected. You must wrap the value with DOMPurify.sanitize() or use the safeHtml helper.',
    },
];

const apiRestrictedSyntax = [
    // Block raw api calls
    {
        selector: "CallExpression[callee.name='fetch']",
        message:
            "⚠️ Do not use raw fetch(). Use 'callRobloxApi' or 'callRobloxApiJson' from 'core/api.js' instead to handle auth and errors consistently.",
    },
    {
        selector: "NewExpression[callee.name='XMLHttpRequest']",
        message:
            "⚠️ Do not use XMLHttpRequest. Use 'callRobloxApi' or 'callRobloxApiJson' from 'core/api.js' instead.",
    },
    {
        // Block raw CSS injection via style.textContent or cssText
        selector:
            "AssignmentExpression[left.property.name='textContent'][right.type='TemplateLiteral'][right.quasis.0.value.raw.length>50], AssignmentExpression[left.property.name='cssText']",
        message:
            "⚠️ Avoid writing raw CSS in JavaScript. Please define styles in 'src/css/' (SCSS) and use class names instead to promote reuse and maintainability.",
    },
    {
        // Block style tag creation for injection
        selector:
            "CallExpression[callee.property.name='createElement'][arguments.0.value='style']",
        message:
            "⚠️ Do not create <style> tags dynamically. Use the centralized SCSS files in 'src/css/'.",
    },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.join(__dirname, 'src/css/sitewide.css');
const allowedCssVars = new Set();
try {
    if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const matches = cssContent.match(/--[a-zA-Z0-9-_]+(?=\s*:)/g);
        if (matches) {
            matches.forEach((v) => allowedCssVars.add(v.trim()));
        }
    }
} catch (e) {}

const customPlugin = {
    rules: {
        // Detects none rovalra variables
        'check-css-vars': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Ensure used CSS variables are defined in sitewide.css',
                },
            },
            create(context) {
                const check = (node, value) => {
                    if (!value) return;
                    const regex = /var\((--[a-zA-Z0-9-_]+)\)/g;
                    let match;
                    while ((match = regex.exec(value)) !== null) {
                        const varName = match[1];
                        if (
                            allowedCssVars.size > 0 &&
                            !allowedCssVars.has(varName)
                        ) {
                            context.report({
                                node,
                                message: `⚠️ CSS variable '${varName}' is not defined in sitewide.css.`,
                            });
                        }
                    }
                };
                return {
                    Literal: (node) =>
                        typeof node.value === 'string' &&
                        check(node, node.value),
                    TemplateElement: (node) => check(node, node.value.raw),
                };
            },
        },
        // detects a "Verified" comment and removes the errors, since we assume this has been verified as working as expected
        'restricted-syntax-verified': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Disallow specified syntax unless verified',
                },
                schema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string' },
                            message: { type: 'string' },
                        },
                        required: ['selector'],
                        additionalProperties: false,
                    },
                    minItems: 0,
                },
            },
            create(context) {
                const sourceCode = context.sourceCode;
                const isVerified = (node) => {
                    const normalize = (str) => str.trim().toLowerCase();
                    let token = sourceCode.getTokenBefore(node, {
                        includeComments: true,
                    });
                    while (
                        token &&
                        (token.type === 'Line' || token.type === 'Block')
                    ) {
                        if (normalize(token.value) === 'verified') return true;
                        token = sourceCode.getTokenBefore(token, {
                            includeComments: true,
                        });
                    }
                    token = sourceCode.getTokenAfter(node, {
                        includeComments: true,
                    });
                    while (
                        token &&
                        token.loc.start.line === node.loc.end.line
                    ) {
                        if (token.type === 'Line' || token.type === 'Block') {
                            if (normalize(token.value) === 'verified')
                                return true;
                        }
                        token = sourceCode.getTokenAfter(token, {
                            includeComments: true,
                        });
                    }
                    return false;
                };
                const visitors = {};
                for (const { selector, message } of context.options) {
                    visitors[selector] = (node) => {
                        if (!isVerified(node))
                            context.report({ node, message });
                    };
                }
                return visitors;
            },
        },
    },
};

export default [
    {
        ignores: ['dist/', 'node_modules/'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.webextensions,
                angular: 'readonly',
            },
        },
        plugins: {
            rovalra: customPlugin,
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'rovalra/restricted-syntax-verified': [
                'error',
                ...baseRestrictedSyntax,
                ...apiRestrictedSyntax,
            ],
            'rovalra/check-css-vars': 'warn',
        },
    },
    {
        files: ['**/core/api.js', '**/core/xhr/intercept.js'],
        rules: {
            'rovalra/restricted-syntax-verified': [
                'error',
                ...baseRestrictedSyntax,
            ],
        },
    },
    prettierConfig,
];
