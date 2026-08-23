import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: ["main.js", "node_modules/**", "tmp/**"],
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            obsidianmd,
        },
        rules: {
            "obsidianmd/no-unsupported-api": "error",
        },
    },
];
