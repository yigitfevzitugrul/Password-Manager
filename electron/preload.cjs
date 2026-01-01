const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkUser: () => ipcRenderer.invoke('check-user'),
    register: (password) => ipcRenderer.invoke('register', password),
    login: (password) => ipcRenderer.invoke('login', password),
    savePasswords: (data) => ipcRenderer.invoke('save-passwords', data),
    changePassword: (oldPw, newPw) => ipcRenderer.invoke('change-password', oldPw, newPw),
    logout: () => ipcRenderer.invoke('logout'),
});
