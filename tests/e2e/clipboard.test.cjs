// Clipboard clearing on lock, logout, re-copy and quit (Electron 44 async clipboard API)
const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'orenda-test-')));
require(path.join(process.argv[2], 'electron/main.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const run = js => win.webContents.executeJavaScript(`(async()=>{ const api = window.electronAPI; ${js} })()`);
  const prev = await clipboard.readText();
  await sleep(800);
  await run(`return api.register({firstName:'C',lastName:'L',password:'kavun-Masa-71-deniz'})`);
  await run(`return api.setClipboardClearSeconds(10)`);

  await run(`return api.copyToClipboard('secret-A')`);
  assert.equal(await clipboard.readText(), 'secret-A');
  await run(`return api.copyToClipboard('secret-A')`);            // same text again must survive
  assert.equal(await clipboard.readText(), 'secret-A');
  await run(`return api.copyToClipboard('secret-B')`);
  assert.equal(await clipboard.readText(), 'secret-B');
  await run(`return api.logout()`); await sleep(300);
  assert.equal(await clipboard.readText(), '', 'cleared on logout');

  await run(`return api.login((await api.getUsers()).users[0].id,'kavun-Masa-71-deniz')`);
  await run(`return api.copyToClipboard('secret-C')`);
  await clipboard.writeText('user copied something else');
  await sleep(11000);
  assert.equal(await clipboard.readText(), 'user copied something else', "someone else's clipboard content is left alone");

  await run(`return api.copyToClipboard('secret-D')`);
  await sleep(11000);
  assert.equal(await clipboard.readText(), '', 'cleared by the timer');

  await run(`return api.copyToClipboard('secret-E')`);
  // The clipboard must be empty once the app has quit: checked from outside the app
  app.on('will-quit', () => {
    const left = require('child_process')
      .spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' }).stdout || '';
    require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value $env:PREV_CLIP'],
      { env: { ...process.env, PREV_CLIP: prev || ' ' } });
    if (left.trim() === 'secret-E') {
      console.error('TEST FAIL: clipboard still holds the secret after quitting');
      process.exitCode = 1;
    } else {
      console.log('CLIPBOARD TEST OK');
    }
  });
  app.quit();
})().catch(e => { console.error('TEST FAIL', e); app.exit(1); });
