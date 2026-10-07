const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openReleasePage: () => ipcRenderer.invoke('open-release-page'),
    checkUser: () => ipcRenderer.invoke('check-user'),
    getUsers: () => ipcRenderer.invoke('get-users'),
    checkLockout: () => ipcRenderer.invoke('check-lockout'),
    register: (payload) => ipcRenderer.invoke('register', payload),
    login: (userId, password) => ipcRenderer.invoke('login', userId, password),
    verify2FALogin: (code) => ipcRenderer.invoke('verify-2fa-login', code),
    cancel2FALogin: () => ipcRenderer.invoke('cancel-2fa-login'),
    get2FAStatus: () => ipcRenderer.invoke('get-2fa-status'),
    setup2FA: () => ipcRenderer.invoke('setup-2fa'),
    enable2FA: (code) => ipcRenderer.invoke('enable-2fa', code),
    disable2FA: (masterPassword) => ipcRenderer.invoke('disable-2fa', masterPassword),
    savePasswords: (data) => ipcRenderer.invoke('save-passwords', data),
    changePassword: (oldPw, newPw) => ipcRenderer.invoke('change-password', oldPw, newPw),
    logout: () => ipcRenderer.invoke('logout'),
    checkPwnedPassword: (password) => ipcRenderer.invoke('check-pwned-password', password),
    autoLock: () => ipcRenderer.invoke('auto-lock'),
    getQuickUnlockState: () => ipcRenderer.invoke('get-quick-unlock-state'),
    quickUnlock: (pin) => ipcRenderer.invoke('quick-unlock', pin),
    getQuickPinStatus: () => ipcRenderer.invoke('get-quick-pin-status'),
    setQuickPin: (masterPassword, pin) => ipcRenderer.invoke('set-quick-pin', masterPassword, pin),
    disableQuickPin: () => ipcRenderer.invoke('disable-quick-pin'),
    selectKeyFile: (userId) => ipcRenderer.invoke('select-key-file', userId),
    getKeyFileStatus: () => ipcRenderer.invoke('get-key-file-status'),
    enableKeyFile: (masterPassword) => ipcRenderer.invoke('enable-key-file', masterPassword),
    disableKeyFile: (masterPassword) => ipcRenderer.invoke('disable-key-file', masterPassword),
    exportEncryptedBackup: () => ipcRenderer.invoke('export-encrypted-backup'),
    listAutoBackups: () => ipcRenderer.invoke('list-auto-backups'),
    openBackup: (autoBackupName) => ipcRenderer.invoke('open-backup', autoBackupName),
    unlockBackup: (password) => ipcRenderer.invoke('unlock-backup', password),
    cancelBackup: () => ipcRenderer.invoke('cancel-backup'),
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
    setClipboardClearSeconds: (seconds) => ipcRenderer.invoke('set-clipboard-clear-seconds', seconds),
    onVaultLocked: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('vault-locked', listener);
        return () => ipcRenderer.removeListener('vault-locked', listener);
    },
});
