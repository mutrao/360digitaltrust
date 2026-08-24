module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-restricted-properties': [
      'error',
      { object: 'localStorage', property: 'setItem',
        message: 'Ne stockez jamais de jeton dans localStorage. Voir docs/SECURITY.md.' },
    ],
  },
};
