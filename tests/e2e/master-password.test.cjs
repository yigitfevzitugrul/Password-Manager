// UI-driven E2E test for the master password strength rules and the configurable timers.
const { app, BrowserWindow, clipboard } = require('electron');
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
  const shot = async name => { win.webContents.invalidate(); await sleep(600); if (out) fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); };
  const prevClip = await clipboard.readText();
  await sleep(1000);

  // main process refuses short new master passwords on its own
  let r = await run(`return api.register({firstName:'A',lastName:'B',password:'elevenchars'})`);
  assert.equal(r.success, false);

  // --- register form ---
  const fill = pw => run(`${SET}
    const ins=[...document.querySelectorAll('form input')].filter(i=>i.type!=='checkbox');
    ['Ayse','Kara','${pw}','${pw}'].forEach((v,i)=>set(ins[i],v));
    const cb=document.querySelector('input[type=checkbox]'); if(!cb.checked) cb.click();
    await new Promise(r=>setTimeout(r,250));`);
  const submit = async () => { await run(`document.querySelector('form button[type=submit]').click()`); await sleep(1500); };
  const state = () => run(`return { dash: !!document.querySelector('.dashboard'), err: document.querySelector('.error-message')?.textContent || '', label: document.querySelector('.strength-label')?.textContent || '', hint: document.querySelector('.master-password-hint')?.textContent || '' }`);

  await fill('kisa1234');                 // 8 chars: too short
  await submit(); r = await state();
  assert.equal(r.dash, false); assert.match(r.err, /12/);

  await fill('password1234');             // 12 chars but trivially guessable
  r = await state(); assert.equal(r.label, 'Zayıf'); assert.match(r.hint, /bir dakikadan az/);
  await submit(); r = await state();
  assert.equal(r.dash, false); assert.match(r.err, /tahmin/);

  await fill('AyseKara2026');             // built from the user's own name
  await submit(); r = await state();
  assert.equal(r.dash, false, 'name-based password refused');

  await fill('kavun-Masa-71-deniz');      // passphrase
  r = await state(); assert.equal(r.label, 'Çok Güçlü'); assert.match(r.hint, /yüzyıllar/);
  await shot('register_strength.png');
  await submit(); r = await state();
  assert.equal(r.dash, true, 'strong passphrase accepted: ' + r.err);

  // --- change password rules ---
  assert.equal((await run(`return api.changePassword('kavun-Masa-71-deniz','short')`)).success, false);
  await run(`[...document.querySelectorAll('.menu-item')].pop().click()`);
  await sleep(600);

  // --- timers ---
  const selects = `[...document.querySelectorAll('.settings-row select')]`;
  assert.equal(await run(`return ${selects}.map(s=>s.value).join(',')`), '5,30', 'defaults');
  assert.equal(await run(`return api.setClipboardClearSeconds(5)`), false, 'value outside the list refused');
  await run(`const setSel=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}));};
    const [a,c]=${selects}; setSel(a,'15'); setSel(c,'10');`);
  await sleep(500);
  assert.equal(await run(`return localStorage.getItem('auto_lock_minutes')+','+localStorage.getItem('clipboard_clear_seconds')`), '15,10');
  await run(`document.querySelector('.settings-row select').closest('.settings-section').scrollIntoView({block:'center'})`);
  await sleep(800);
  await shot('settings_timers.png');

  await run(`return api.copyToClipboard('timer-secret')`);
  await sleep(7000);
  assert.equal(await clipboard.readText(), 'timer-secret', 'still there after 7s');
  await sleep(4500);
  assert.notEqual(await clipboard.readText(), 'timer-secret', 'cleared after the chosen 10s');

  // choices survive a restart of the page
  win.webContents.reload();
  await new Promise(res => win.webContents.once('did-finish-load', res));
  await sleep(1200);
  await run(`return api.copyToClipboard('timer-secret-2')`).catch(() => {});
  assert.equal(await run(`return localStorage.getItem('auto_lock_minutes')+','+localStorage.getItem('clipboard_clear_seconds')`), '15,10');

  await clipboard.writeText(prevClip);
  console.log('STRENGTH+TIMERS TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
