// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals'; // Import globals

export default tseslint.config(
  // 1. Global ignores and base rules for all files
  {
    ignores: [
      '.next/**',
      '.next-validation/**',
      'node_modules/**',
      'dist/**',
      'public/**', // Ignore public dir (service workers, etc.)
      'playwright-report/**', // Ignore playwright report dir
      'test-results/**', // Ignore test results dir
      '**/*.config.cjs', // Ignore .cjs config files for now
    ],
  },
  eslint.configs.recommended,

  // 2. TypeScript specific configurations (Type-Aware)
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: true, // Automatically find tsconfig.json
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser, // Add browser globals for TSX files
        ...globals.node, // Add Node globals if needed in TS files
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn', // Downgrade to warn or fix the type
    },
  },

  // 3. JavaScript specific configurations (NO Type-Aware Rules)
  {
    files: ['**/*.js', '**/*.mjs'], // Removed .cjs, handled by ignores for now
    languageOptions: {
      globals: {
        ...globals.node, // Add Node.js globals
        ...globals.browser, // Add Browser globals if needed for some JS
      },
    },
    rules: {
      'no-undef': 'error', // Keep checking for undefined vars
    },
  },

  // 4. Next.js / React specific configurations (Applies to JS/TS/JSX/TSX)
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser, // Ensure browser globals for React components
      },
    },
    rules: {
      '@next/next/no-html-link-for-pages': 'warn', // Or 'error' based on original config
      '@next/next/no-sync-scripts': 'warn', // Or 'error' based on original config
      'react-hooks/exhaustive-deps': 'error',
      'react/no-unescaped-entities': 'error',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // 5. Overrides (Apply after main configs)
  // Test files override
  {
    files: [
      '**/__tests__/**/*.ts?(x)',
      '**/*.test.ts?(x)',
      '**/jest.setup.js',
      '**/jest.config.js',
      '**/playwright.config.js',
    ],
    languageOptions: {
      globals: {
        ...globals.jest, // Add Jest globals
        ...globals.node, // Ensure Node globals for config files
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-undef': 'off', // Allow undefined vars in tests/configs
      'no-unused-vars': 'off', // Allow unused vars in tests/configs
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused TS vars in tests/configs
    },
  },
  // Actions override
  {
    files: ['app/actions/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },

  // 6. Prettier config (Must be LAST)
  {
    rules: prettierConfig.rules,
  }
);
