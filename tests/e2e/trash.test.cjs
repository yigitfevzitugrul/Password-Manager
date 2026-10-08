// UI-driven E2E test for the trash and password history, against a throwaway userData dir.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const projectDir = process.argv[2], out = process.argv[3];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-'));
app.setPath('userData', dir);
require(path.join(projectDir, 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 24 * 60 * 60 * 1000;

(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const SET = `const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
  const shot = async name => { win.webContents.invalidate(); await sleep(600); if (out) fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); };
  const badges = () => run(`return [...document.querySelectorAll('.menu-badge')].map(b=>b.textContent).join(',')`); // passwords, favorites, trash
  const uiLogin = async () => {
    win.webContents.reload();
    await new Promise(res => win.webContents.once('did-finish-load', res));
    await sleep(800);
    await run(`${SET} set(document.querySelector('input[type=password]'),'kavun-Masa-71-deniz'); await new Promise(r=>setTimeout(r,100)); document.querySelector('form button[type=submit]').click();`);
    await sleep(1800);
    assert.ok(await run(`return !!document.querySelector('.dashboard')`));
  };
  await sleep(800);

  let r = await run(`return api.register({firstName:'T',lastName:'R',password:'kavun-Masa-71-deniz'})`);
  const uid = r.user.id;
  const now = Date.now();
  await run(`return api.savePasswords(${JSON.stringify([
    { id: '1', title: 'GitHub', username: 'yigit', password: 'old-pass-1', isFavorite: true },
    { id: '2', title: 'Gmail', username: 'y@x.co', password: 'mail-pass' },
    { id: '3', title: 'Eski Forum', username: 'u', password: 'p', deletedAt: now - 31 * DAY },
    { id: '4', title: 'Eski Banka', username: 'u', password: 'p', deletedAt: now - 10 * DAY }
  ])})`);
  await run(`return api.logout()`);

  // --- expired trash is purged at login, fresh trash is kept and hidden ---
  await uiLogin();
  assert.equal(await badges(), '2,1,1', 'active 2, favorites 1, trash 1 (31-day-old entry purged)');
  assert.equal(await run(`return document.querySelectorAll('.password-item').length`), 2);

  // --- password history: edit GitHub's password twice ---
  for (const pw of ['new-pass-2', 'new-pass-3']) {
    await run(`document.querySelector('.password-item .item-actions .btn-icon:nth-child(3)').click()`);
    await sleep(400);
    await run(`${SET} set(document.querySelector('.modal-content input[type=password], .modal input[type=password], form input[type=password]'),'${pw}'); await new Promise(r=>setTimeout(r,100)); [...document.querySelectorAll('form button[type=submit]')].pop().click();`);
    await sleep(600);
  }
  // favorite toggle and reload must keep history + trash
  await run(`document.querySelector('.password-item .star-btn').click()`);
  await sleep(400);
  await uiLogin();
  assert.equal(await badges(), '2,0,1', 'trash survived edits and favorite toggle');
  await run(`document.querySelector('.password-item .clickable-area').click()`);
  await sleep(400);
  const historyBtn = `[...document.querySelectorAll('form .btn-ghost')].find(b=>/\\(2\\)/.test(b.textContent))`;
  assert.ok(await run(`return !!${historyBtn}`), 'history button shows 2 old passwords');
  await run(`${historyBtn}.click()`);
  await sleep(300);
  assert.equal(await run(`return document.querySelectorAll('.password-history-row').length`), 2);
  assert.equal(await run(`return document.querySelector('.password-history-row code').textContent`), '••••••••••', 'history masked by default');
  await run(`document.querySelector('form .input-toggle-btn').click()`);
  await sleep(300);
  assert.equal(await run(`return [...document.querySelectorAll('.password-history-row code')].map(c=>c.textContent).join(',')`), 'new-pass-2,old-pass-1');
  await run(`document.querySelector('.password-history-list').scrollIntoView({block:'center'})`);
  await sleep(500);
  await shot('history.png');
  await run(`[...document.querySelectorAll('.modal-actions button')].pop().click()`);
  await sleep(300);

  // --- delete moves to trash ---
  await run(`document.querySelectorAll('.password-item')[1].querySelector('.btn-icon-danger').click()`);
  await sleep(300);
  assert.ok(await run(`return /30/.test(document.querySelector('.modal-delete-warning').textContent)`), 'delete dialog mentions the 30 days');
  await run(`document.querySelector('.modal-actions .btn-danger').click()`);
  await sleep(500);
  assert.equal(await badges(), '1,0,2');

  // --- trash tab ---
  await run(`document.querySelectorAll('.menu-item')[2].click()`);
  await sleep(500);
  assert.equal(await run(`return [...document.querySelectorAll('.password-item h4')].map(h=>h.textContent).join(',')`), 'Gmail,Eski Banka', 'newest deletion first');
  await shot('trash.png');
  // restore Gmail
  await run(`document.querySelector('.password-item .btn-icon').click()`);
  await sleep(500);
  assert.equal(await badges(), '2,0,1');
  // delete Eski Banka for good
  await run(`document.querySelector('.password-item .btn-icon-danger').click()`);
  await sleep(300);
  await run(`document.querySelector('.modal-actions .btn-danger').click()`);
  await sleep(500);
  assert.equal(await badges(), '2,0,0');
  assert.ok(await run(`return document.querySelector('.top-bar .btn-danger').disabled`), 'empty-trash button disabled when empty');

  // --- empty trash ---
  await run(`document.querySelectorAll('.menu-item')[0].click()`);
  await sleep(300);
  for (let i = 0; i < 2; i++) {
    await run(`document.querySelector('.password-item .btn-icon-danger').click()`); await sleep(300);
    await run(`document.querySelector('.modal-actions .btn-danger').click()`); await sleep(500);
  }
  assert.equal(await badges(), '0,0,2');
  await run(`document.querySelectorAll('.menu-item')[2].click()`); await sleep(300);
  await run(`document.querySelector('.top-bar .btn-danger').click()`); await sleep(300);
  await run(`document.querySelector('.modal-actions .btn-danger').click()`); await sleep(500);
  assert.equal(await badges(), '0,0,0');

  // persisted
  await uiLogin();
  assert.equal(await badges(), '0,0,0');
  console.log('TRASH TEST OK');
  app.exit(0);
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
