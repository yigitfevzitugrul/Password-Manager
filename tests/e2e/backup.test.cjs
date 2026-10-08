// E2E test for registration without email + encrypted backups, against a throwaway userData dir.
const { app, BrowserWindow, dialog } = require('electron');
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
  await sleep(1000);

  // --- register through the real form (no email step any more) ---
  assert.equal(await run(`return document.querySelectorAll('form input').length`), 5, 'first, last, pass, confirm, checkbox');
  assert.equal(await run(`return typeof api.sendEmailCode`), 'undefined');
  await run(`${SET}
    const ins=[...document.querySelectorAll('form input')].filter(i=>i.type!=='checkbox');
    ['Test','User','kavun-Masa-71-deniz','kavun-Masa-71-deniz'].forEach((v,i)=>set(ins[i],v));
    document.querySelector('input[type=checkbox]').click();
    await new Promise(r=>setTimeout(r,200));
    document.querySelector('form button[type=submit]').click();`);
  await sleep(2000);
  assert.ok(await run(`return !!document.querySelector('.dashboard')`), 'dashboard shown after register');
  const users = (await run(`return api.getUsers()`)).users;
  assert.equal(users.length, 1);
  const uid = users[0].id;
  assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')).users[0].email, 'no email stored');
  const backupDir = path.join(dir, 'backups', uid);

  // --- automatic backups ---
  assert.deepEqual(await run(`return api.listAutoBackups()`), []);
  await run(`return api.savePasswords([{id:'1',title:'a',password:'x'},{id:'2',title:'b',password:'y'}])`);
  await run(`return api.logout()`);
  assert.deepEqual(await run(`return api.listAutoBackups()`), [], 'no listing when locked');
  let r = await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);
  assert.equal(r.success, true);
  let list = await run(`return api.listAutoBackups()`);
  assert.equal(list.length, 1);
  await run(`return api.logout()`);
  await sleep(1100);
  await run(`return api.login('${uid}','kavun-Masa-71-deniz')`);
  assert.equal((await run(`return api.listAutoBackups()`)).length, 1, 'unchanged vault is not backed up twice');

  // --- export ---
  const exportFile = path.join(dir, 'export.opbackup');
  await run(`return api.savePasswords([{id:'1',title:'a',password:'x'},{id:'2',title:'b',password:'y'},{id:'3',title:'c',password:'z'}])`);
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.equal((await run(`return api.exportEncryptedBackup()`)).canceled, true);
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportFile });
  r = await run(`return api.exportEncryptedBackup()`);
  assert.deepEqual([r.success, r.count], [true, 3]);
  const exported = fs.readFileSync(exportFile);
  assert.equal(exported.subarray(0, 4).toString(), 'OPV2');
  assert.ok(!exported.includes('title'), 'export is not plaintext');

  // same password: opens without a prompt
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportFile] });
  r = await run(`return api.openBackup()`);
  assert.equal(r.success, true); assert.equal(r.items.length, 3); assert.ok(r.exportedAt);

  // --- change password: auto backups stay readable, exported file needs the old password ---
  assert.equal((await run(`return api.changePassword('kavun-Masa-71-deniz','limon-Kapi-48-bulut')`)).success, true);
  list = await run(`return api.listAutoBackups()`);
  r = await run(`return api.openBackup('${list[list.length - 1].name}')`);
  assert.equal(r.success, true, 'auto backup re-encrypted for the new password'); assert.equal(r.items.length, 2);
  r = await run(`return api.openBackup('../../users.json')`);
  assert.equal(r.success, false); assert.ok(!r.needsPassword, 'bad backup name rejected');

  r = await run(`return api.openBackup()`);
  assert.equal(r.needsPassword, true);
  r = await run(`return api.unlockBackup('wrong-password')`);
  assert.deepEqual([r.success, r.needsPassword], [false, true]);
  r = await run(`return api.unlockBackup('kavun-Masa-71-deniz')`);
  assert.equal(r.success, true); assert.equal(r.items.length, 3);
  assert.equal((await run(`return api.unlockBackup('kavun-Masa-71-deniz')`)).success, false, 'pending backup consumed');

  // garbage file
  fs.writeFileSync(exportFile + '.bad', 'not a backup');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportFile + '.bad'] });
  r = await run(`return api.openBackup()`);
  assert.equal(r.needsPassword, true);
  assert.equal((await run(`return api.unlockBackup('limon-Kapi-48-bulut')`)).success, false);
  await run(`return api.cancelBackup()`);

  // --- pruning: never more than 5 ---
  for (let i = 0; i < 7; i++) {
    await run(`return api.savePasswords([{id:'n${i}',title:'t${i}'}])`);
    await run(`return api.logout()`);
    await sleep(1100);
    assert.equal((await run(`return api.login('${uid}','limon-Kapi-48-bulut')`)).success, true);
  }
  list = await run(`return api.listAutoBackups()`);
  assert.equal(list.length, 5);
  assert.equal(fs.readdirSync(backupDir).length, 5);
  r = await run(`return api.openBackup('${list[0].name}')`);
  assert.equal(r.items[0].id, 'n6', 'newest backup holds the latest state');
  await run(`return api.logout()`);
  console.log('BACKUP TEST OK');

  // --- UI: log in through the form, open settings, restore dialog ---
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await sleep(1000);
  await run(`${SET} set(document.querySelector('input[type=password]'),'limon-Kapi-48-bulut'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
  await sleep(2000);
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`);
  await sleep(600);
  await run(`document.querySelector('.data-management-grid').scrollIntoView({block:'start'})`);
  await sleep(400);
  if (out) fs.writeFileSync(path.join(out, 'settings_backup.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.auto-backup-row button').click()`);
  await sleep(1200);
  await sleep(900);
  await sleep(300);
  if (out) fs.writeFileSync(path.join(out, 'settings_restore.png'), (await win.webContents.capturePage()).toPNG());
  const before = await run(`return document.querySelector('.menu-badge').textContent`);
  await run(`document.querySelector('.import-preview-actions button').click()`);
  await sleep(800);
  console.log('UI OK: entries before/after replace:', before, await run(`return document.querySelector('.menu-badge').textContent`),
    '| msg:', await run(`return document.querySelector('.status-message')?.textContent`));
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
