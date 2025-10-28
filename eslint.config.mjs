import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import chaiFriendlyPlugin from "eslint-plugin-chai-friendly";

export default [
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
      "chai-friendly": chaiFriendlyPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "chai-friendly/no-unused-expressions": "error",
      indent: ["warn", 2],
      semi: ['error', 'always'],
      quotes: ['error', 'double'],
      curly: ["error", "all"],      
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': ['error', 'never'],
      'space-infix-ops': ['error'],
      'brace-style': ['error', '1tbs'],
      "max-len": ["error", { "code": 120 }],
      "linebreak-style": ["error", "unix"],
      "@typescript-eslint/no-var-requires": "off",
      '@typescript-eslint/no-explicit-any': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    ignores: ["/coverage/**", "**/dist/**", "**/dist/**", "**/node_modules/**"],
  },
];
