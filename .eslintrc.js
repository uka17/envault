module.exports = {
  "env": {
    "node": true,
    "commonjs": true,
    "es6": true,
  },
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:prettier/recommended",
  ],
  "globals": {
    "Atomics": "readonly",
    "SharedArrayBuffer": "readonly",
  },
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module",
  },
  "plugins": ["@typescript-eslint", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "indent": ["warn", 2],
    "linebreak-style": ["error", "unix", "windows"],
    "semi": ["warn", "always"],
    "@typescript-eslint/no-var-requires": 0,
  },
};
