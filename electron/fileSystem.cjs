const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getUserDataPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'passwords.enc');
}

function saveEncryptedData(data) {
    const filePath = getUserDataPath();
    fs.writeFileSync(filePath, data);
}

function readEncryptedData() {
    const filePath = getUserDataPath();
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
    }
    return null;
}

function checkDataExists() {
    const filePath = getUserDataPath();
    return fs.existsSync(filePath);
}

module.exports = { saveEncryptedData, readEncryptedData, checkDataExists };
