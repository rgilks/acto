import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/config/(.*)$': '<rootDir>/config/$1',
    '^@/contexts/(.*)$': '<rootDir>/contexts/$1',
    '^@/types/(.*)$': '<rootDir>/types/$1',
  },
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/jest.config.js',
    '<rootDir>/jest.setup.js',
    '<rootDir>/next.config.js',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'contexts/**/*.{js,jsx,ts,tsx}',
    '!**/*.test.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/test/e2e/'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(next|next-auth|jose|openid-client|@panva|oidc-token-hash)/)',
  ],
  resetMocks: true,
  clearMocks: true,
};

export default createJestConfig(customJestConfig);
