export default [
  {
    ignores: ["node_modules/**", "dist/**", "data/**"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { process: "readonly", Buffer: "readonly", console: "readonly", setTimeout: "readonly", URL: "readonly" } },
    rules: { "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }], "no-undef": "error", "no-constant-binary-expression": "error" }
  },
  {
    files: ["client/**/*.js"],
    languageOptions: { globals: { window: "readonly", document: "readonly", location: "readonly", matchMedia: "readonly", localStorage: "readonly", fetch: "readonly", URLSearchParams: "readonly", history: "readonly", CustomEvent: "readonly", navigator: "readonly", confirm: "readonly", alert: "readonly", FormData: "readonly", HTMLElement: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } }
  }
];
