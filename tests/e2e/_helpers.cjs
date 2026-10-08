// Helpers for the end-to-end tests, built from the app's own shared code
// (loaded from the tested app directory, so a packaged app.asar is exercised too).
const path = require('path');

module.exports = function createHelpers(appDir) {
  const primitives = require(path.join(appDir, 'electron/nodePrimitives.cjs'));
  const { createVaultCrypto } = require(path.join(appDir, 'shared/vaultCrypto.js'));
  const { createTotp } = require(path.join(appDir, 'shared/totp.js'));
  const { generateKeyFile } = require(path.join(appDir, 'shared/keyFile.js'));
  const totp = createTotp(primitives);

  return {
    // Decrypts vault files the way the app does, to inspect what was really written to disk
    vaultCrypto: createVaultCrypto(primitives),
    // The code an authenticator app would show right now
    totpCode: (secret) => totp.generateTOTP(secret),
    generateKeyFile: () => generateKeyFile(primitives)
  };
};
