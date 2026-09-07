export default {
  testEnvironment: "node",
  transform: {}, // desativa Babel
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setup/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.lifecycle.js"],
};
