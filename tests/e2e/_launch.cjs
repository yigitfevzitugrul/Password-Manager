// Starts one end-to-end test inside Electron, with the app running the way an installed copy does:
// the built page is loaded from disk (no dev server) under the production security settings.
// usage: electron tests/e2e/_launch.cjs <test file> <app directory or app.asar> [screenshot directory]
const { app } = require('electron');
const path = require('path');

Object.defineProperty(app, 'isPackaged', { value: true });

const [test, appDir, screenshots] = process.argv.slice(2);
process.argv = [process.argv[0], test, appDir, screenshots];
require(path.resolve(test));
