// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Browser globals used across the app (avoids depending on the `globals` package). */
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  matchMedia: 'readonly',
  addEventListener: 'readonly',
  removeEventListener: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  AudioContext: 'readonly',
  requestFullscreen: 'readonly',
  Image: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  globalThis: 'readonly',
};

/** Test globals provided by Vitest (`globals: true` in vitest.config). */
const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.log', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...browserGlobals, ...testGlobals },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['*.config.ts', 'vite.config.ts', 'vitest.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
