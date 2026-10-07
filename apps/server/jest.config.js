'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js', '<rootDir>/demo/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-after.js'],
  /** One worker: test files share the Express app singleton; parallel workers caused flaky hangs when another file loaded `app` first with a different mocked `session.service`. */
  maxWorkers: 1,
  clearMocks: true,         // Reset mock.calls/mock.results between tests
  restoreMocks: true,       // Restore mock implementations after each test to prevent pollution
  collectCoverageFrom: [
    'controllers/**/*.js',
    'routes/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'websocket/**/*.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/migrations/',
    '/jobs/',
    '/tests/',
    '/config/',
    'lib/logger.js',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html'],
  verbose: true,
  forceExit: true,
};
