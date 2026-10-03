const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkUser: () => ipcRenderer.invoke('check-user'),
    checkLockout: () => ipcRenderer.invoke('check-lockout'),
    register: (password) => ipcRenderer.invoke('register', password),
    login: (password) => ipcRenderer.invoke('login', password),
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
});
