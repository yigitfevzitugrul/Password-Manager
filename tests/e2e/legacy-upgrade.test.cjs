// Upgrade path: a vault written by the very first version (old format, 8-char password, TOTP on)
// must still open and be upgraded in place.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const assert = require('assert');
const { encryptLegacy } = require('../fixtures/legacyEncrypt.cjs');
const projectDir = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-'));
app.setPath('userData', dir);
const { totpCode } = require('./_helpers.cjs')(projectDir);
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const totp = () => totpCode(SECRET);

(async () => {
  const PW = 'eski1234'; // 8 characters: allowed for existing vaults
  fs.writeFileSync(path.join(dir, 'passwords.enc'), await encryptLegacy('[{"id":"1","title":"Eski","password":"p"}]', PW));
  fs.writeFileSync(path.join(dir, '2fa_config.json'), '{"enabled":true}');
  fs.writeFileSync(path.join(dir, '2fa_secret.enc'), await encryptLegacy(SECRET, PW));

  require(path.join(projectDir, 'electron/main.cjs'));
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const magic = f => fs.readFileSync(path.join(dir, f)).subarray(0, 4).toString();
  await new Promise(r => setTimeout(r, 800));

  assert.equal((await run(`return api.getUsers()`)).users[0].username, 'Ana Hesap');
  let r = await run(`return api.login('default','${PW}')`);
  assert.equal(r.require2FA, true);
  assert.equal(magic('passwords.enc'), 'OPV2'); assert.equal(magic('2fa_secret.enc'), 'OPV2');
  r = await run(`return api.verify2FALogin('${totp()}')`);
  assert.equal(r.success, true); assert.equal(r.data[0].title, 'Eski');
  assert.equal((await run(`return api.listAutoBackups()`)).length, 1);
  assert.equal((await run(`return api.setQuickPin('${PW}','246813')`)).success, true);
  assert.equal((await run(`return api.changePassword('${PW}','kisa1234')`)).success, false, 'new passwords need 12 characters');
  await run(`return api.logout()`);
  r = await run(`return api.login('default','${PW}')`);
  assert.equal(r.require2FA, true);
  assert.equal((await run(`return api.verify2FALogin('${totp()}')`)).success, true);
  console.log('LEGACY TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
