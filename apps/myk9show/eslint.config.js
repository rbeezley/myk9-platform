import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Ignore unused variables that start with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Prevent use of 'any' type (Sprint 25: Type Safety)
      '@typescript-eslint/no-explicit-any': 'error',
      // Ban hand-paired dark: status color classes — use semantic tokens instead.
      // Allowed exception: teal (brand accent color, not a status semantic).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/dark:(text|bg|border)-(red|blue|amber|orange|yellow|green|emerald)-\\d+/]',
          message:
            'Hand-paired dark: status classes are banned. Use semantic tokens: text-destructive / text-info / text-warning / text-success (and bg-*/10, border-*/30 variants).',
        },
        {
          selector:
            'TemplateElement[value.raw=/dark:(text|bg|border)-(red|blue|amber|orange|yellow|green|emerald)-\\d+/]',
          message:
            'Hand-paired dark: status classes are banned. Use semantic tokens: text-destructive / text-info / text-warning / text-success (and bg-*/10, border-*/30 variants).',
        },
        // MYK9-787: Vitest registers a function returned from a hook as that
        // test's cleanup and calls it. `mockReset()`/`mockClear()` return the
        // mock, so `beforeEach(() => load.mockReset())` re-invokes `load` after
        // every test and fails any test that made it reject. Braced bodies only.
        {
          selector:
            'CallExpression[callee.name=/^(beforeEach|afterEach|beforeAll|afterAll)$/] > ArrowFunctionExpression.arguments:first-child[body.type!="BlockStatement"]',
          message:
            'Give test hooks a braced body: `beforeEach(() => { x(); })`. Vitest calls a function returned from a hook as cleanup, and mock setters return the mock (MYK9-787).',
        },
      ],
    },
  }
);
