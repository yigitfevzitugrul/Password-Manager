// E2E test: an account that lives on another device is added to a fresh installation from the
// login screen ("Hesabımı Bu Cihaza Ekle"), without registering a second account.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const projectDir = process.argv[2], out = process.argv[3];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-'));
app.setPath('userData', path.join(dir, 'app'));
require(path.join(projectDir, 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PASSWORD = 'kavun-Masa-71-deniz';
const syncFolder = path.join(dir, 'bulut klasörü');
fs.mkdirSync(syncFolder);

// The device the account already lives on: same code, own storage
function createFirstDevice() {
  const { createVaultService } = require(path.join(projectDir, 'shared/vaultService.js'));
  const primitives = require(path.join(projectDir, 'electron/nodePrimitives.cjs'));
  const { createNodeStorage } = require(path.join(projectDir, 'electron/nodeStorage.cjs'));
  const { createDesktopPlatform } = require(path.join(projectDir, 'electron/desktopPlatform.cjs'));
  const platform = createDesktopPlatform(() => null);
  platform.pickFolder = async () => ({ canceled: false, path: syncFolder });
  platform.getDeviceName = () => 'Ev Bilgisayarı';
  const page = { items: [], revision: undefined };
  platform.notifyVaultChanged = (change) => { page.items = change.items; page.revision = change.revision; };
  const service = createVaultService({ primitives, storage: createNodeStorage(path.join(dir, 'first')), platform });
  page.save = async (items) => {
    page.items = items;
    const res = await service.api.savePasswords(items, page.revision);
    if (!(page.revision >= res.revision)) page.revision = res.revision;
  };
  return { api: service.api, lock: service.lock, page };
}

(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(res => win.webContents.once('did-finish-load', res));

  // --- on the first device: account, two entries, sync turned on ---
  const first = createFirstDevice();
  let r = await first.api.register({ firstName: 'Yiğit', lastName: 'Tuğrul', password: PASSWORD });
  first.page.items = r.data; first.page.revision = r.revision;
  await first.page.save([
    { id: 'e1', title: 'GitHub', username: 'yigit', password: 'gh-parola' },
    { id: 'e2', title: 'Gmail', username: 'y@x.co', password: 'gm-parola' }
  ]);
  assert.equal((await first.api.enableSync(PASSWORD)).success, true);

  // --- the app on the new device: no account yet ---
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const SET = `const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
  const shot = async name => { win.webContents.invalidate(); await sleep(600); if (out) fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); };
  const titles = () => run(`return [...document.querySelectorAll('.password-item h4')].map(h=>h.textContent).sort().join(',')`);
  const joinLink = `[...document.querySelectorAll('.auth-link-btn')].find(b=>/Bu Cihaza Ekle/.test(b.textContent))`;
  const submit = `document.querySelector('form button[type=submit]')`;
  await sleep(1000);
  assert.equal(await run(`return api.checkUser()`), false);

  await run(`${joinLink}.click()`); await sleep(400);
  assert.equal(await run(`return document.querySelector('h2').textContent`), 'Hesabımı Bu Cihaza Ekle');
  await shot('join_account.png');

  // wrong master password
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [syncFolder] });
  await run(`${SET} set(document.querySelector('form input[type=password]'),'yanlis-sifre-123'); await new Promise(r=>setTimeout(r,100)); ${submit}.click();`);
  await sleep(2000);
  assert.equal(await run(`return document.querySelector('.error-message')?.textContent`), 'Ana şifre hatalı.');
  assert.equal(await run(`return api.checkUser()`), false, 'nothing was created');

  // folder dialog canceled: stays on the screen without an error
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  await run(`${SET} set(document.querySelector('form input[type=password]'),'${PASSWORD}'); await new Promise(r=>setTimeout(r,100)); ${submit}.click();`);
  await sleep(800);
  assert.ok(await run(`return !document.querySelector('.dashboard') && !document.querySelector('.error-message')`));

  // correct master password and folder
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [syncFolder] });
  await run(`${submit}.click()`);
  await sleep(3500);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`), 'signed in after adding the account');
  assert.equal(await titles(), 'GitHub,Gmail', 'the entries of the other device are here');
  assert.equal(await run(`return document.querySelector('.sidebar-user-name').textContent`), 'Yiğit Tuğrul', 'same account name');
  const users = (await run(`return api.getUsers()`)).users;
  assert.deepEqual(users.map(u => u.username), ['Yiğit Tuğrul'], 'exactly one account on this device');
  assert.equal((await run(`return api.getSyncStatus()`)).enabled, true);

  // --- one vault from now on: a change on either device shows up on the other ---
  await first.page.save([...first.page.items, { id: 'e3', title: 'İlk cihazda eklendi', username: 'u', password: 'p' }]);
  await first.api.syncNow();
  await run(`return api.syncNow()`); await sleep(800);
  assert.equal(await titles(), 'GitHub,Gmail,İlk cihazda eklendi');

  const row = `[...document.querySelectorAll('.password-item')].find(el=>el.querySelector('h4').textContent==='Gmail')`;
  await run(`${row}.querySelector('.star-btn').click()`); await sleep(500);
  await run(`return api.syncNow()`);
  await first.api.syncNow();
  assert.equal(first.page.items.find(i => i.title === 'Gmail').isFavorite, true, 'a change made here reached the first device');

  // --- it is an ordinary account here: lock and log in again through the form ---
  await run(`return api.logout()`);
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await sleep(1000);
  await run(`${SET} set(document.querySelector('input[type=password]'),'${PASSWORD}'); await new Promise(r=>setTimeout(r,100)); ${submit}.click();`);
  await sleep(2500);
  assert.equal(await titles(), 'GitHub,Gmail,İlk cihazda eklendi');

  first.lock(false);
  console.log('SYNC JOIN TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
