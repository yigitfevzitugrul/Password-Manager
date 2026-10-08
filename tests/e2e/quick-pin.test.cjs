// E2E test for the quick unlock PIN, against a throwaway userData dir.
const { app, BrowserWindow, powerMonitor } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const projectDir = process.argv[2], out = process.argv[3];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-'));
app.setPath('userData', dir);
require(path.join(projectDir, 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const SET = `const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
  await sleep(800);

  let r = await run(`return api.register({firstName:'P',lastName:'N',password:'kavun-Masa-71-deniz'})`);
  const uid = r.user.id, pinFile = path.join(dir, `quickpin_${uid}.enc`);
  await run(`return api.savePasswords([{id:'1',title:'a',password:'x'}])`);

  // without a PIN an automatic lock is a full lock
  assert.deepEqual(await run(`return api.autoLock()`), { quickUnlock: false });
  assert.deepEqual(await run(`return api.getQuickUnlockState()`), { available: false });
  assert.equal((await run(`return api.quickUnlock('1234')`)).expired, true);
  await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);

  // --- set PIN ---
  assert.equal((await run(`return api.setQuickPin('wrong-password','482913')`)).success, false);
  assert.equal((await run(`return api.setQuickPin('kavun-Masa-71-deniz','12')`)).success, false);
  assert.equal((await run(`return api.setQuickPin('kavun-Masa-71-deniz','12ab56')`)).success, false);
  assert.ok(!fs.existsSync(pinFile));
  assert.equal((await run(`return api.setQuickPin('kavun-Masa-71-deniz','482913')`)).success, true);
  assert.equal(fs.readFileSync(pinFile).subarray(0, 4).toString(), 'OPV2');
  assert.ok(!fs.readFileSync(pinFile).includes('482913'), 'PIN is not stored in plain text');
  assert.deepEqual(await run(`return api.getQuickPinStatus()`), { enabled: true });

  // --- soft lock + unlock ---
  assert.deepEqual(await run(`return api.autoLock()`), { quickUnlock: true });
  await assert.rejects(run(`return api.savePasswords([])`), /Oturum/, 'vault is locked while suspended');
  assert.deepEqual(await run(`return api.getQuickPinStatus()`), { enabled: false });
  assert.equal((await run(`return api.exportEncryptedBackup()`)).success, false);
  r = await run(`return api.getQuickUnlockState()`);
  assert.deepEqual([r.available, r.userId, r.username], [true, uid, 'P N']);
  r = await run(`return api.quickUnlock('000000')`);
  assert.deepEqual([r.success, r.attemptsRemaining], [false, 2]);
  r = await run(`return api.quickUnlock('482913')`);
  assert.equal(r.success, true); assert.equal(r.data[0].title, 'a'); assert.equal(r.user.id, uid);
  assert.equal((await run(`return api.savePasswords([{id:'1',title:'a'},{id:'2',title:'b'}])`)).success, true);
  assert.deepEqual(await run(`return api.getQuickUnlockState()`), { available: false });

  // --- 3 wrong PINs: master password needed ---
  await run(`return api.autoLock()`);
  for (let i = 0; i < 3; i++) r = await run(`return api.quickUnlock('11111${i}')`);
  assert.equal(r.expired, true);
  assert.equal((await run(`return api.quickUnlock('482913')`)).success, false, 'correct PIN no longer works');
  r = await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);
  assert.equal(r.success, true); assert.equal(r.data.length, 2);
  assert.deepEqual(await run(`return api.getQuickPinStatus()`), { enabled: true }, 'PIN loaded again after master password login');

  // --- manual logout is a full lock ---
  await run(`return api.logout()`);
  assert.deepEqual(await run(`return api.getQuickUnlockState()`), { available: false });
  await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);

  // --- master password login while suspended drops the suspended session ---
  await run(`return api.autoLock()`);
  assert.equal((await run(`return api.login('${uid}','kavun-Masa-71-deniz')`)).success, true);
  assert.deepEqual(await run(`return api.getQuickUnlockState()`), { available: false });

  // --- PIN survives a master password change ---
  assert.equal((await run(`return api.changePassword('kavun-Masa-71-deniz','limon-Kapi-48-bulut')`)).success, true);
  await run(`return api.logout()`);
  await run(`return api.login('${uid}','limon-Kapi-48-bulut')`);
  assert.deepEqual(await run(`return api.getQuickPinStatus()`), { enabled: true });
  await run(`return api.logout()`);
  console.log('PIN TEST OK');

  // --- UI: log in, screen lock event, unlock with PIN ---
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await sleep(800);
  await run(`${SET} set(document.querySelector('input[type=password]'),'limon-Kapi-48-bulut'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
  await sleep(1800);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`));
  powerMonitor.emit('lock-screen');
  await sleep(1200);
  assert.ok(await run(`return !document.querySelector('.dashboard') && !!document.querySelector('.twofa-login-input')`), 'quick unlock screen shown');
  win.webContents.invalidate(); await sleep(600);
  if (out) fs.writeFileSync(path.join(out, 'quick_unlock.png'), (await win.webContents.capturePage()).toPNG());
  await run(`${SET} set(document.querySelector('.twofa-login-input'),'482913'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
  await sleep(1200);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`), 'dashboard back after PIN');
  assert.equal(await run(`return document.querySelector('.menu-badge').textContent`), '2');

  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`);
  await sleep(600);
  await run(`[...document.querySelectorAll('.settings-section')][2].scrollIntoView({block:'center'})`);
  await sleep(1200); win.webContents.invalidate(); await sleep(600);
  if (out) fs.writeFileSync(path.join(out, 'settings_pin.png'), (await win.webContents.capturePage()).toPNG());

  // remove PIN through the API: next automatic lock is a full lock again
  assert.equal((await run(`return api.disableQuickPin()`)).success, true);
  assert.ok(!fs.existsSync(pinFile));
  assert.deepEqual(await run(`return api.autoLock()`), { quickUnlock: false });
  console.log('PIN UI OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
