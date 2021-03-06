module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 9,
  },
  extends: 'eslint:recommended',
  rules: {
    indent: 0,
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single'],
    semi: ['error', 'never'],
    'no-console': 0,
  },
}
