// E2E test for the update check (talks to the real public GitHub API; latest release is v1.0.0).
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const out = process.argv[3];
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-')));

// Pretend to be an older build so the published v1.0.0 counts as an update
let fakeVersion = '0.9.0';
app.getVersion = () => fakeVersion;
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };

require(path.join(process.argv[2], 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const shot = async name => { win.webContents.invalidate(); await sleep(600); if (out) fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); };
  await sleep(3000);

  // --- older build: banner on the login screen ---
  let r = await run(`return api.checkForUpdates()`);
  assert.equal(r.success, true, r.error);
  assert.equal(r.currentVersion, '0.9.0'); assert.equal(r.updateAvailable, true);
  assert.match(r.latestVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(await run(`return document.querySelector('.update-banner')?.textContent.includes('${r.latestVersion}')`), 'banner shown at startup');
  await shot('update_banner.png');
  await run(`document.querySelector('.update-banner-action').click()`); await sleep(300);
  assert.deepEqual(opened, ['https://github.com/yigitfevzitugrul/Password-Manager/releases/latest']);
  await run(`document.querySelector('.update-banner-close').click()`); await sleep(300);
  assert.ok(await run(`return !document.querySelector('.update-banner')`), 'banner can be dismissed');

  // --- same version as the latest release: nothing to do ---
  fakeVersion = r.latestVersion;
  r = await run(`return api.checkForUpdates()`);
  assert.deepEqual([r.success, r.updateAvailable], [true, false]);
  // --- newer local build than the release: not an update either ---
  fakeVersion = '99.0.0';
  assert.equal((await run(`return api.checkForUpdates()`)).updateAvailable, false);
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res)); await sleep(3000);
  assert.ok(await run(`return !document.querySelector('.update-banner')`), 'no banner when up to date');

  // --- settings: manual check + turning the startup check off ---
  fakeVersion = '0.9.0';
  await run(`const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const ins=[...document.querySelectorAll('form input')].filter(i=>i.type!=='checkbox');
    ['Test','User','kavun-Masa-71-deniz','kavun-Masa-71-deniz'].forEach((v,i)=>set(ins[i],v));
    document.querySelector('input[type=checkbox]').click(); await new Promise(r=>setTimeout(r,250));
    document.querySelector('form button[type=submit]').click();`);
  await sleep(2000);
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`); await sleep(600);
  const section = `[...document.querySelectorAll('.settings-section')].pop()`;
  await run(`${section}.scrollIntoView({block:'center'})`); await sleep(500);
  await run(`${section}.querySelector('.btn-secondary').click()`); await sleep(3000);
  assert.ok(await run(`return ${section}.querySelector('.status-message').textContent.includes('1.')`), 'manual check reports the new version');
  await shot('settings_updates.png');
  await run(`${section}.querySelector('.toggle-switch input').click()`); await sleep(300);
  assert.equal(await run(`return localStorage.getItem('update_check')`), 'false');
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res)); await sleep(3000);
  assert.ok(await run(`return !document.querySelector('.update-banner')`), 'no startup check when turned off');

  console.log('UPDATE TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
