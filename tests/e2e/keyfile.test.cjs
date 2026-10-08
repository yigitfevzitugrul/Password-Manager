// E2E test for the key file second factor, against a throwaway userData dir.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const assert = require('assert');
const projectDir = process.argv[2], out = process.argv[3];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-'));
app.setPath('userData', dir);
require(path.join(projectDir, 'electron/main.cjs'));
const { vaultCrypto: enc, generateKeyFile, totpCode: totp } = require('./_helpers.cjs')(projectDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const magic = f => fs.readFileSync(path.join(dir, f)).subarray(0, 4).toString();
  const usersJson = () => JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')).users[0];
  await sleep(800);

  let r = await run(`return api.register({firstName:'K',lastName:'F',password:'kavun-Masa-71-deniz'})`);
  const uid = r.user.id, vault = `vault_${uid}.enc`;
  await run(`return api.savePasswords([{id:'1',title:'a',password:'x'}])`);
  await run(`return api.logout()`); await run(`return api.login('${uid}','kavun-Masa-71-deniz')`); // creates an auto backup
  r = await run(`return api.setup2FA()`); const totpSecret = r.secret;
  assert.equal((await run(`return api.enable2FA('${totp(totpSecret)}')`)).success, true);
  assert.deepEqual(await run(`return api.getKeyFileStatus()`), { enabled: false, path: null });

  // --- enable ---
  const keyPath = path.join(dir, 'usb', 'my.opkey'); fs.mkdirSync(path.dirname(keyPath));
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: keyPath });
  assert.equal((await run(`return api.enableKeyFile('wrong-password')`)).success, false);
  assert.ok(!fs.existsSync(keyPath), 'no key file written for a wrong password');
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.equal((await run(`return api.enableKeyFile('kavun-Masa-71-deniz')`)).canceled, true);
  assert.equal(magic(vault), 'OPV2');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: keyPath });
  r = await run(`return api.enableKeyFile('kavun-Masa-71-deniz')`);
  assert.equal(r.success, true, r.error);
  assert.equal(magic(vault), 'OPK2'); assert.equal(magic(`2fa_secret_${uid}.enc`), 'OPK2');
  assert.equal(usersJson().keyFilePath, keyPath);
  assert.deepEqual(await run(`return api.getKeyFileStatus()`), { enabled: true, path: keyPath });
  assert.equal((await run(`return api.enableKeyFile('kavun-Masa-71-deniz')`)).success, false, 'already enabled');

  // the password alone can no longer decrypt the vault file
  const vaultBytes = fs.readFileSync(path.join(dir, vault));
  await assert.rejects(enc.decryptWithPassword(vaultBytes, 'kavun-Masa-71-deniz'), e => e.code === 'KEYFILE_REQUIRED');
  await assert.rejects(enc.decryptWithPassword(vaultBytes, 'kavun-Masa-71-deniz', crypto.randomBytes(32)));
  const realSecret = Buffer.from(JSON.parse(fs.readFileSync(keyPath, 'utf8')).key, 'base64');
  assert.equal((await enc.decryptWithPassword(vaultBytes, 'kavun-Masa-71-deniz', realSecret)).text, '[{"id":"1","title":"a","password":"x"}]');

  // auto backup was re-encrypted with the key file too
  let list = await run(`return api.listAutoBackups()`);
  assert.equal(list.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'backups', uid, list[0].name)).subarray(0, 4).toString(), 'OPK2');
  assert.equal((await run(`return api.openBackup('${list[0].name}')`)).success, true);

  await run(`return api.savePasswords([{id:'1',title:'a',password:'x'},{id:'2',title:'b'}])`);
  const exportFile = path.join(dir, 'kf.opbackup');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportFile });
  assert.equal((await run(`return api.exportEncryptedBackup()`)).success, true);
  await run(`return api.logout()`);

  // --- login: key file found at the remembered path ---
  const login = async pw => {
    const res = await run(`return api.login('${uid}','${pw}')`);
    if (res.require2FA) return run(`return api.verify2FALogin('${totp(totpSecret)}')`);
    return res;
  };
  r = await login('kavun-Masa-71-deniz');
  assert.equal(r.success, true); assert.equal(r.data.length, 2);
  await run(`return api.logout()`);

  // --- key file missing (USB unplugged) ---
  const movedPath = path.join(dir, 'moved.opkey'); fs.renameSync(keyPath, movedPath);
  r = await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);
  assert.deepEqual([r.success, r.needsKeyFile, r.keyFileName], [false, true, 'my.opkey']);
  assert.equal((await run(`return api.checkLockout()`)).attempts, 0, 'missing key file is not a failed attempt');

  fs.writeFileSync(path.join(dir, 'junk.opkey'), 'hello');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(dir, 'junk.opkey')] });
  assert.equal((await run(`return api.selectKeyFile('${uid}')`)).success, false);

  const otherPath = path.join(dir, 'other.opkey'); fs.writeFileSync(otherPath, generateKeyFile().content);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [otherPath] });
  assert.equal((await run(`return api.selectKeyFile('${uid}')`)).success, true);
  r = await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);
  assert.deepEqual([r.success, r.keyFileRequired, r.attemptsRemaining], [false, true, 2], 'wrong key file rejected');

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [movedPath] });
  assert.equal((await run(`return api.selectKeyFile('${uid}')`)).keyFileName, 'moved.opkey');
  r = await login('kavun-Masa-71-deniz');
  assert.equal(r.success, true); assert.equal(r.data.length, 2);
  assert.equal(usersJson().keyFilePath, movedPath, 'new location remembered');

  // --- change password keeps the key file ---
  assert.equal((await run(`return api.changePassword('kavun-Masa-71-deniz','limon-Kapi-48-bulut')`)).success, true);
  assert.equal(magic(vault), 'OPK2');
  await run(`return api.logout()`);
  assert.equal((await run(`return api.login('${uid}','kavun-Masa-71-deniz')`)).success, false);
  r = await login('limon-Kapi-48-bulut');
  assert.equal(r.success, true); assert.equal(r.data.length, 2);

  // --- UI screenshots ---
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await run(`return api.logout()`);
  fs.renameSync(movedPath, keyPath); // "unplug" again so the login screen shows the picker
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await sleep(800);
  const SET = `const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
  await run(`${SET} set(document.querySelector('input[type=password]'),'limon-Kapi-48-bulut'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
  await sleep(1200);
  if (out) fs.writeFileSync(path.join(out, 'login_keyfile.png'), (await win.webContents.capturePage()).toPNG());
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [keyPath] });
  await run(`document.querySelector('.key-file-login-row button').click()`);
  await sleep(500);
  assert.equal(await run(`return document.querySelector('input[type=password]').value`), 'limon-Kapi-48-bulut', 'password kept while picking the key file');
  await run(`document.querySelector('form button[type=submit]').click()`);
  await sleep(1500);
  await run(`${SET} set(document.querySelector('.twofa-login-input'),'${totp(totpSecret)}'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
  await sleep(1500);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`), 'logged in through the UI with key file + TOTP');
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`);
  await sleep(600);
  await run(`[...document.querySelectorAll('.settings-section')][1].scrollIntoView({block:'center'})`);
  await sleep(400);
  if (out) fs.writeFileSync(path.join(out, 'settings_keyfile.png'), (await win.webContents.capturePage()).toPNG());

  // --- disable ---
  assert.equal((await run(`return api.disableKeyFile('nope')`)).success, false);
  assert.equal((await run(`return api.disableKeyFile('limon-Kapi-48-bulut')`)).success, true);
  assert.equal(magic(vault), 'OPV2'); assert.equal(magic(`2fa_secret_${uid}.enc`), 'OPV2');
  assert.equal(usersJson().keyFilePath, undefined);

  // backup exported while the key file was on (and under the old password)
  dialog.showOpenDialog = async (w, opts) => ({ canceled: false, filePaths: [opts.title ? keyPath : exportFile] });
  r = await run(`return api.openBackup()`);
  assert.equal(r.needsPassword, true);
  r = await run(`return api.unlockBackup('kavun-Masa-71-deniz')`);
  assert.equal(r.success, true, r.error); assert.equal(r.items.length, 2);

  await run(`return api.logout()`);
  fs.unlinkSync(keyPath);
  r = await login('limon-Kapi-48-bulut');
  assert.equal(r.success, true, 'no key file needed after disabling');
  console.log('KEYFILE TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
