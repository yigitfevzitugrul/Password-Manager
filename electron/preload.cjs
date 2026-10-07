const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkUser: () => ipcRenderer.invoke('check-user'),
    getUsers: () => ipcRenderer.invoke('get-users'),
    checkLockout: () => ipcRenderer.invoke('check-lockout'),
    sendEmailCode: (data) => ipcRenderer.invoke('send-email-code', data),
    verifyEmailCode: (data) => ipcRenderer.invoke('verify-email-code', data),
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
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
    onVaultLocked: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('vault-locked', listener);
        return () => ipcRenderer.removeListener('vault-locked', listener);
    },
});
