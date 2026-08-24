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
    // `a?.b.c` ne protège que `a` : si `b` est absent, l'accès à `c` lève une
    // exception et fait tomber toute la page. Ce piège a provoqué trois pannes
    // en production ; il est désormais détecté à la compilation.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[optional=false] > MemberExpression[optional=true].object',
        message:
          "Chaînage optionnel incomplet : « a?.b.c » plante si b est absent. " +
          'Écrivez « a?.b?.c ».',
      },
    ],
  },
};
