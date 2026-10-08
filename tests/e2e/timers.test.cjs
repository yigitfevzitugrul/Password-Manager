// E2E test for the "never" choice of the auto-lock and clipboard timers.
const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const out = process.argv[3];
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-')));
require(path.join(process.argv[2], 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const stored = () => run(`return localStorage.getItem('auto_lock_minutes')+','+localStorage.getItem('clipboard_clear_seconds')`);
  const prev = await clipboard.readText();
  await sleep(1000);
  assert.equal(await stored(), '5,30', 'fresh install keeps the safe defaults');
  await run(`const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const ins=[...document.querySelectorAll('form input')].filter(i=>i.type!=='checkbox');
    ['Test','User','kavun-Masa-71-deniz','kavun-Masa-71-deniz'].forEach((v,i)=>set(ins[i],v));
    document.querySelector('input[type=checkbox]').click(); await new Promise(r=>setTimeout(r,250));
    document.querySelector('form button[type=submit]').click();`);
  await sleep(2000);
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`); await sleep(600);
  const selects = `[...document.querySelectorAll('.settings-row select')]`;
  assert.equal(await run(`return ${selects}.map(s=>[...s.options].pop().textContent.trim()).join(' | ')`),
    'Hiçbir zaman | Hiçbir zaman');
  await run(`const setSel=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}));};
    const [a,c]=${selects}; setSel(a,'0'); setSel(c,'0');`);
  await sleep(500);
  assert.equal(await stored(), '0,0'); assert.equal(await run(`return document.querySelectorAll('.not-recommended-chip').length`), 2);
  await run(`document.querySelector('.settings-row select').closest('.settings-section').scrollIntoView({block:'center'})`);
  await sleep(800); win.webContents.invalidate(); await sleep(600);
  if (out) fs.writeFileSync(path.join(out, 'settings_never.png'), (await win.webContents.capturePage()).toPNG());

  // never clear: stays through logout
  await run(`return api.copyToClipboard('never-secret')`);
  await run(`return api.logout()`); await sleep(500);
  assert.equal(await clipboard.readText(), 'never-secret', 'not cleared when set to never');

  // reload: choice restored
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res)); await sleep(1200);
  assert.equal(await stored(), '0,0');

  // back to 10s works again
  await run(`return api.login((await api.getUsers()).users[0].id,'kavun-Masa-71-deniz')`);
  assert.equal(await run(`return api.setClipboardClearSeconds(10)`), true);
  await run(`return api.copyToClipboard('timed-secret')`);
  await sleep(11000);
  assert.equal(await clipboard.readText(), '', 'timer works again after leaving never');
  await clipboard.writeText(prev);
  console.log('NEVER TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
