const { contextBridge, ipcRenderer } = require('electron');

// Requests the page may send to the main process. Must match the keys of the vault service's
// `api` (shared/vaultService.js); tests/unit checks that the two lists stay identical.
const API_METHODS = [
    'getAppVersion',
    'checkForUpdates',
    'openReleasePage',
    'checkUser',
    'getUsers',
    'checkLockout',
    'register',
    'login',
    'verify2FALogin',
    'cancel2FALogin',
    'get2FAStatus',
    'setup2FA',
    'enable2FA',
    'disable2FA',
    'savePasswords',
    'changePassword',
    'logout',
    'checkPwnedPassword',
    'autoLock',
    'getQuickUnlockState',
    'quickUnlock',
    'getQuickPinStatus',
    'setQuickPin',
    'disableQuickPin',
    'selectKeyFile',
    'getKeyFileStatus',
    'enableKeyFile',
    'disableKeyFile',
    'exportEncryptedBackup',
    'listAutoBackups',
    'openBackup',
    'unlockBackup',
    'cancelBackup',
    'copyToClipboard',
    'setClipboardClearSeconds',
    'getSyncStatus',
    'getSyncTargets',
    'enableSync',
    'joinSyncedAccount',
    'syncNow',
    'reconnectSync',
    'disableSync'
];

const api = {};
for (const method of API_METHODS) {
    api[method] = (...args) => ipcRenderer.invoke(method, ...args);
}

api.onVaultLocked = (callback) => {
    const listener = () => callback();
    ipcRenderer.on('vault-locked', listener);
    return () => ipcRenderer.removeListener('vault-locked', listener);
};

// Entries changed without the page asking (another device's changes were merged in)
api.onVaultChanged = (callback) => {
    const listener = (event, change) => callback(change);
    ipcRenderer.on('vault-changed', listener);
    return () => ipcRenderer.removeListener('vault-changed', listener);
};

contextBridge.exposeInMainWorld('electronAPI', api);
