/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testRunner: 'jest-circus/runner',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 15000,
  verbose: true,
};
