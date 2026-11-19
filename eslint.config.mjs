import js from "@eslint/js";
import globals from "globals";
import esx from "eslint-plugin-es-x";
import noStaticInlineStyles from "./scripts/eslint/no-static-inline-styles.mjs";

// The Steam client runs Chromium 87 (Electron 11.5): game-side and UI code may only use what it supports.
// That is ES2021 plus the class fields and private methods Chromium 87 already has. "aggressive" also flags
// methods like .at() or .findLastIndex() when the object's type is unknown; the iterator-helper rules are off
// because in that mode they flag every array .map().
const chromium87 = {
    plugins: { "es-x": esx },
    settings: { "es-x": { aggressive: true } },
    rules: {
        ...esx.configs["flat/restrict-to-es2021"].rules,
        "es-x/no-class-instance-fields": "off",
        "es-x/no-class-private-fields": "off",
        "es-x/no-class-private-methods": "off",
        "es-x/no-class-static-fields": "off",
        ...Object.fromEntries(
            Object.keys(esx.rules)
                .filter((name) => name.startsWith("no-iterator-prototype-"))
                .map((name) => [`es-x/${name}`, "off"])
        ),
    },
};

const commonRules = {
    // Possible errors
    "no-unused-vars": [
        "warn",
        {
            argsIgnorePattern: "^_|^params$",
            varsIgnorePattern: "^_",
        },
    ],
    "no-undef": "error",
    "no-prototype-builtins": "off", // Safe to use in controlled environments

    // Best practices
    "dot-notation": "warn",
    eqeqeq: "warn",
    "no-var": "warn",
    "prefer-const": "warn",
};

export default [
    {
        ignores: [
            "node_modules/**",
            "zips/**",
            ".scratch/**",
            "idleon-web-profile/**",
            "logs/**",
            "cheats.js",
            "config.custom.js",
            "src/ui/vendor/van-*.js",
            "src/ui/vendor/van-x-*.js",
        ],
    },
    js.configs.recommended,
    {
        files: ["**/*.{js,mjs}"],
        rules: commonRules,
    },
    {
        files: ["src/cheats/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ["src/ui/**/*.js"],
        plugins: { ui: { rules: { "no-static-inline-styles": noStaticInlineStyles } } },
        rules: { "ui/no-static-inline-styles": "error" },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ["src/cheats/**/*.js", "src/ui/**/*.js"],
        ignores: ["src/ui/vendor/**"],
        ...chromium87,
    },
    {
        files: ["src/modules/**/*.js", "src/main.js", "config.js", ".agents/skills/idleon-live-cdp/scripts/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ["config.js"],
        rules: {
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_|^params$|^t$",
                    varsIgnorePattern: "^_",
                },
            ],
        },
    },
    {
        files: ["*.mjs", "scripts/**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
    },
];
