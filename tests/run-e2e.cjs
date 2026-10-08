// Runs the end-to-end tests: each one starts the real app in Electron with a throwaway data
// directory and drives it through the same API and screens a user would.
//
//   node tests/run-e2e.cjs                         test the project directory (needs `vite build` first)
//   node tests/run-e2e.cjs --app <dir|app.asar>    test another copy, e.g. the packaged app.asar
//   node tests/run-e2e.cjs --offline               skip tests that need the internet
//   node tests/run-e2e.cjs --screenshots <dir>     keep the screenshots the tests take
//   node tests/run-e2e.cjs backup trash            run only the named tests
//
// The tests use the system clipboard and may show the app window while they run.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electronPath = require('electron');

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args.splice(index, 2)[1];
}
const appDir = path.resolve(option('--app') || path.join(__dirname, '..'));
const screenshots = option('--screenshots');
const offline = args.includes('--offline');
const only = args.filter(arg => !arg.startsWith('--'));

if (screenshots) fs.mkdirSync(screenshots, { recursive: true });

const testDir = path.join(__dirname, 'e2e');
const tests = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.cjs'))
  .filter(file => !(offline && file.includes('.network.')))
  .filter(file => only.length === 0 || only.some(name => file.startsWith(name)));

function removeTestData() {
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (entry.startsWith('orenda-test-')) {
      fs.rmSync(path.join(os.tmpdir(), entry), { recursive: true, force: true });
    }
  }
}

let failed = 0;
for (const file of tests) {
  const started = Date.now();
  const launchArgs = [path.join(testDir, '_launch.cjs'), path.join(testDir, file), appDir];
  if (screenshots) launchArgs.push(path.resolve(screenshots));

  const result = spawnSync(electronPath, launchArgs, { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  if (result.status === 0) {
    console.log(`ok    ${file} (${seconds}s)`);
  } else {
    failed++;
    console.log(`FAIL  ${file} (${seconds}s)`);
    console.log(`${result.stdout || ''}${result.stderr || ''}`.trim().split('\n').slice(-25).join('\n'));
  }
  removeTestData();
}

console.log(`\n${tests.length - failed} of ${tests.length} end-to-end tests passed (${appDir})`);
process.exit(failed === 0 ? 0 : 1);
