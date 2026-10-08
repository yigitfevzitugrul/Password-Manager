// E2E test for sync between devices: the real app syncs through a real folder with a second
// "device" (the same shared vault code running in this test with its own data directory).
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

// The other device: same code, own storage, same folder
function createOtherDevice() {
  const { createVaultService } = require(path.join(projectDir, 'shared/vaultService.js'));
  const primitives = require(path.join(projectDir, 'electron/nodePrimitives.cjs'));
  const { createNodeStorage } = require(path.join(projectDir, 'electron/nodeStorage.cjs'));
  const { createDesktopPlatform } = require(path.join(projectDir, 'electron/desktopPlatform.cjs'));
  const platform = createDesktopPlatform(() => null);
  platform.pickFolder = async () => ({ canceled: false, path: syncFolder });
  platform.getDeviceName = () => 'Telefon';
  const page = { items: [], revision: undefined };
  platform.notifyVaultChanged = (change) => { page.items = change.items; page.revision = change.revision; };
  const service = createVaultService({ primitives, storage: createNodeStorage(path.join(dir, 'phone')), platform });
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
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const SET = `const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
  const shot = async name => { win.webContents.invalidate(); await sleep(600); if (out) fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); };
  const titles = () => run(`return [...document.querySelectorAll('.password-item h4')].map(h=>h.textContent).sort().join(',')`);
  const syncSection = `[...document.querySelectorAll('.settings-section')].find(s=>s.querySelector('.sync-details') || /Eşitleme/.test(s.querySelector('h3')?.textContent||''))`;
  await sleep(1000);

  // --- the app: register through the form, add two entries ---
  await run(`${SET}
    const ins=[...document.querySelectorAll('form input')].filter(i=>i.type!=='checkbox');
    ['Masa','Üstü','${PASSWORD}','${PASSWORD}'].forEach((v,i)=>set(ins[i],v));
    document.querySelector('input[type=checkbox]').click(); await new Promise(r=>setTimeout(r,250));
    document.querySelector('form button[type=submit]').click();`);
  await sleep(2000);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`));
  const addEntry = async (title, password) => {
    await run(`document.querySelector('.top-bar .btn-primary').click()`); await sleep(400);
    await run(`${SET} const f=document.querySelector('.modal-content form, form');
      const inputs=[...document.querySelectorAll('form input[type=text], form input[type=password]')];
      set(inputs[0],'${title}'); set(document.querySelector('form input[type=password]'),'${password}');
      await new Promise(r=>setTimeout(r,150)); [...document.querySelectorAll('form button[type=submit]')].pop().click();`);
    await sleep(600);
  };
  await addEntry('GitHub', 'gh-parola-1');
  await addEntry('Gmail', 'gm-parola-1');
  assert.equal(await titles(), 'GitHub,Gmail');

  // --- turn sync on in Settings ---
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`); await sleep(600);
  await run(`${syncSection}.scrollIntoView({block:'center'})`); await sleep(300);
  await run(`${syncSection}.querySelector('.btn-primary').click()`); await sleep(300);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [syncFolder] });
  await run(`${SET} set(${syncSection}.querySelector('input[type=password]'),'${PASSWORD}'); await new Promise(r=>setTimeout(r,100)); ${syncSection}.querySelector('button[type=submit]').click();`);
  await sleep(3000);
  let status = await run(`return api.getSyncStatus()`);
  assert.deepEqual([status.enabled, status.folder, status.error], [true, syncFolder, null]);
  const files = () => fs.readdirSync(syncFolder).sort();
  assert.deepEqual(files().map(f => f.split('.').pop()).sort(), ['opkeyring', 'opsync']);
  for (const file of files()) {
    assert.ok(!fs.readFileSync(path.join(syncFolder, file)).includes('gh-parola-1'), 'only encrypted files in the folder');
  }

  // --- the other device joins with the same master password and brings its own entry ---
  const phone = createOtherDevice();
  let r = await phone.api.register({ firstName: 'Tele', lastName: 'Fon', password: PASSWORD });
  phone.page.items = r.data; phone.page.revision = r.revision;
  await phone.page.save([{ id: 'p1', title: 'Telefonda eklendi', username: 'u', password: 'tel-parola' }]);
  r = await phone.api.enableSync(PASSWORD);
  assert.deepEqual([r.success, r.joined], [true, true]);
  assert.deepEqual(phone.page.items.map(i => i.title).sort(), ['GitHub', 'Gmail', 'Telefonda eklendi']);
  assert.equal(files().length, 3);

  // --- the app picks it up (Sync Now button) and the list on screen updates by itself ---
  await run(`[...${syncSection}.querySelectorAll('button')].find(b=>b.classList.contains('btn-primary')).click()`);
  await sleep(2500);
  status = await run(`return api.getSyncStatus()`);
  assert.deepEqual(status.devices.map(d => d.name), ['Telefon']);
  await run(`${syncSection}.scrollIntoView({block:'center'})`); await sleep(400);
  await shot('settings_sync.png');
  await run(`document.querySelectorAll('.menu-item')[0].click()`); await sleep(500);
  assert.equal(await titles(), 'GitHub,Gmail,Telefonda eklendi');

  // --- a change on the phone arrives without touching the app (background sync after it is written) ---
  await phone.page.save(phone.page.items.map(i => i.title === 'Gmail' ? { ...i, title: 'Gmail (iş)' } : i));
  assert.equal((await phone.api.syncNow()).success, true);
  await run(`return api.syncNow()`);
  await sleep(800);
  assert.equal(await titles(), 'GitHub,Gmail (iş),Telefonda eklendi', 'the open list was refreshed');

  // --- deleting in the app (trash, then for good) reaches the phone ---
  const row = `[...document.querySelectorAll('.password-item')].find(el=>el.querySelector('h4').textContent==='GitHub')`;
  await run(`${row}.querySelector('.btn-icon-danger').click()`); await sleep(300);
  await run(`document.querySelector('.modal-actions .btn-danger').click()`); await sleep(500);
  await run(`return api.syncNow()`);
  await phone.api.syncNow();
  assert.ok(phone.page.items.find(i => i.title === 'GitHub').deletedAt, 'the entry is in the trash on the phone too');
  await run(`document.querySelectorAll('.menu-item')[2].click()`); await sleep(400);
  await run(`document.querySelector('.password-item .btn-icon-danger').click()`); await sleep(300);
  await run(`document.querySelector('.modal-actions .btn-danger').click()`); await sleep(500);
  await run(`return api.syncNow()`);
  await phone.api.syncNow();
  assert.deepEqual(phone.page.items.map(i => i.title).sort(), ['Gmail (iş)', 'Telefonda eklendi']);

  // --- sync survives a restart of the session and stops when turned off ---
  await run(`return api.logout()`);
  assert.deepEqual(await run(`return api.getSyncStatus()`), { enabled: false });
  const uid = (await run(`return api.getUsers()`)).users[0].id;
  r = await run(`return api.login('${uid}','${PASSWORD}')`);
  assert.equal(r.data.length, 2);
  assert.equal((await run(`return api.getSyncStatus()`)).enabled, true);
  assert.equal((await run(`return api.disableSync()`)).success, true);
  assert.equal(files().length, 2, "the app's own file was removed from the folder");
  assert.equal((await run(`return api.login('${uid}','${PASSWORD}')`)).data.length, 2, 'the vault stays on the device');

  phone.lock(false);
  console.log('SYNC TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
