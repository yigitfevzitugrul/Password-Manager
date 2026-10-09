<div align="center">

  <strong>English</strong> | <a href="README_TR.md">Türkçe</a>

  <img src="Image/icon.png" alt="Orenda Pass Logo" width="110" height="110" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(37,99,235,0.3);" />

  # Orenda Pass
  ### Secure, Encrypted & Zero-Knowledge Local Password Manager

  <p align="center">
    Take complete control over your credentials. No server of ours, military-grade <strong>AES-256</strong> encryption, isolated multi-user vaults, for Windows and Android.
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Electron-44.6-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Android-Capacitor_8-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android" />
    <img src="https://img.shields.io/badge/Security-AES--256--GCM-success?style=for-the-badge&logo=shield" alt="AES-256" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  </p>

  <p align="center">
    <a href="#-key-features">Key Features</a> •
    <a href="#-screenshots">Screenshots</a> •
    <a href="#-security-architecture">Security</a> •
    <a href="#-download">Download</a> •
    <a href="#-installation--usage">Build from Source</a> •
    <a href="README_TR.md">Türkçe Dokümantasyon</a>
  </p>

</div>

---

## 🌟 Overview

**Orenda Pass** is an open-source application for Windows and Android engineered to safeguard your sensitive login credentials, two-factor authentication tokens (TOTP/2FA), and confidential notes with the highest security standards.

Unlike conventional cloud-based password managers, **Orenda Pass** operates under a strict **Zero-Knowledge** architecture and has no server of its own. Your master password never leaves your device and all cryptographic operations are performed on-device. Your vault stays on your device too, unless you turn on sync between your devices — and then only encrypted files are written, to a folder you choose or to your own Google Drive.

---

## 📥 Download

**[⬇️ Download the latest release](https://github.com/yigitfevzitugrul/Password-Manager/releases/latest)**

### Windows

1. Download `Orenda.Pass-Setup-x.y.z.exe` from the **Assets** section of the latest release.
2. Run the installer. It is not code-signed, so Windows SmartScreen may show a warning — choose **More info → Run anyway**.
3. Launch **Orenda Pass**, create an account and choose a master password. **The master password cannot be reset** — if you forget it, your vault cannot be opened.

Requires Windows 10/11 (64-bit).

### Android

1. On your phone, download `Orenda.Pass-x.y.z.apk` from the **Assets** section of the latest release.
2. Open the file. Android asks you to allow installing from the app you opened it with (your browser or file manager) — allow it for this install.
3. Open **Orenda Pass**. To use the account you already have on your computer, turn on sync there first (Settings → Sync Between Devices → Google Drive), then choose **Add My Account to This Device** on the phone.

Requires Android 7.0 or newer. The app is not on Google Play; updates are installed the same way, over the existing app.

Each release lists the SHA-256 checksums of its files so you can verify your download.

---

## 🛡️ Key Features

- 🔒 **End-to-End Local Encryption (AES-256):** Vault items are encrypted using industry-standard AES-256 cipher alongside scrypt key derivation.
- 👥 **Multi-User Account Architecture:** Complete isolation between multiple users on the same computer, each with their own encrypted vault.
- 🔐 **Two-Factor Authentication (2FA / TOTP):**
  - **Vault Entry 2FA:** Protect your master vault login using Google Authenticator, Microsoft Authenticator, or any compatible TOTP app.
  - **Account TOTP Tokens:** Built-in TOTP token generation with live countdown timers for stored accounts.
- 🔍 **Have I Been Pwned (HIBP) Breach Scanner:** Check if any of your saved passwords have been compromised in known global breaches using secure *k-Anonymity*.
- 📊 **Vault Health & Security Score:** Real-time analytics analyzing weak, reused, or compromised passwords alongside an overall security score.
- 🎲 **Cryptographic Password Generator:** Color-coded character breakdown (numbers, symbols, letters), entropy bit calculation, and one-click presets (*Balanced, Strong, Maximum, PIN*).
- 📱 **Windows and Android:** The same vault, the same features and the same file format on your computer and your phone.
- 🔄 **Serverless Sync Between Devices:** Keep your vault in sync with your other devices through your own Google Drive, or on the desktop through any folder you choose (for example inside another cloud drive). Only files encrypted on your device are written there; a change made on one device shows up on the others within seconds. If the same entry is changed on two devices, the later change wins and the other password is kept in the entry's history.
- 📦 **Data Management & Backups:** Seamless export and import with support for Chrome, Bitwarden, CSV, and JSON formats.
- ⏱️ **Brute-Force Attack Prevention:** Exponential lockout penalty and countdown timers triggered on consecutive failed login attempts.
- 🌗 **Dark & Light Themes:** Polished Obsidian Black and Clean Slate visual themes.
- 🌍 **Multi-Language Support:** Instant one-click toggle between English and Turkish.

---

## 📷 Screenshots

### 1. Login & Multi-Account Selection
Sleek authentication screen with multi-user profiles and zero-knowledge security protection.
<p align="center">
  <img src="Image/1.png" alt="Login Screen" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 2. Main Vault & Password Management
Categorized credentials, real-time search, sorting, strength badges, favorites, and quick copy utilities.
<p align="center">
  <img src="Image/2.png" alt="Main Dashboard" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 3. Vault Health Report & Breach Analysis
Interactive vault security score gauge, Have I Been Pwned breach scanner, and reused password detection.
<p align="center">
  <img src="Image/3.png" alt="Vault Health Report" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 4. Advanced Password Generator
Color-coded character distinction, bit entropy meter, and fine-tuned preset options.
<p align="center">
  <img src="Image/4.png" alt="Password Generator" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 5. Account Settings, 2FA & Data Management
Two-factor authentication configuration, streamlined JSON & CSV backup actions, and theme preferences.
<p align="center">
  <img src="Image/5.png" alt="Account Settings and Data Management" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

### 6. Android App & Sync Through Google Drive
The same vault on your phone: entries, the navigation menu, and turning on sync through your own Google Drive.
<p align="center">
  <img src="Image/6.png" alt="Android app: vault, menu and sync settings" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

---

## 🔒 Security Architecture

```
+-------------------------------------------------------------------+
|                        User Master Password                       |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|          scrypt Key Derivation (memory-hard, N = 2^17)            |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                     AES-256-GCM Encryption                        |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|       Local Storage Filesystem (vault_[userId].enc & users.json)  |
+-------------------------------------------------------------------+
```

- **Zero-Knowledge Principle:** Your master password is never stored anywhere in plain text. Neither developers nor third parties can recover your vault if you lose your password.
- **k-Anonymity Leak Verification:** When querying the Have I Been Pwned API, only the first 5 characters of the SHA-1 password hash are sent. Your full password or hash is never exposed.
- **Session Protection:** Only the derived key is kept in memory while the vault is unlocked. The vault locks automatically after a configurable period of inactivity (5 minutes by default), on screen lock and on sleep, and copied passwords are cleared from the clipboard after a configurable delay (30 seconds by default).
- **Local Storage Isolation:** Each user's encrypted vault is stored in the operating system's designated app data directory (`%APPDATA%/sifreyonetici`) as an isolated file. On Android it lives in the app's private storage, is excluded from Android's own backups, and the app blocks screenshots and screen recording.
- **Sync Without Trusting the Storage:** Sync files are encrypted on the device with a random key; that key is stored next to them encrypted with your master password (and key file, if you use one). With Google Drive the app asks only for access to its own hidden application folder (`drive.appdata`): it cannot see your other files, and Google sees only encrypted files, their sizes and when they change. Whoever can read the sync files still has to guess your master password, so use a strong one.

---

## 🚀 Installation & Usage

> Just want to use the app? See [Download](#-download). The steps below are for building from source.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yigitfevzitugrul/Password-Manager.git
   cd Password-Manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start in development mode:**
   ```bash
   npm run dev
   ```
   *(Launches the Vite dev server and the Electron application concurrently.)*

4. **Build production installer (Windows NSIS Setup):**
   ```bash
   npm run build
   ```
   *(Generates a stand-alone `.exe` installer inside the `dist-electron/` directory.)*

5. **Run the tests:**
   ```bash
   npm test
   npm run test:e2e
   ```
   *(`npm test` checks the vault format and logic on every platform's crypto implementation. `npm run test:e2e` starts the real app with a throwaway data folder and drives it end to end; it uses the system clipboard while it runs.)*

### Building the Android App

Needs JDK 21 and the Android SDK (platform 36, build-tools 36) in addition to the above; `android/local.properties` must point to the SDK (`sdk.dir=...`).

```bash
npm run android:sync
cd android
./gradlew assembleRelease
```

*(`npm run android:sync` builds the web app for mobile and copies it into the Android project. The APK ends up in `android/app/build/outputs/apk/release/`. Without `android/keystore.properties` the build is signed with Android's debug key; see `android/app/build.gradle`.)*

### Google Drive Sync in Your Own Build

The official releases carry the project's Google client. A build of your own needs its own (free) one, from a Google Cloud project with the Drive API enabled and the `drive.appdata` scope:

- **Desktop:** create a "Desktop app" OAuth client and save the file Google offers for download as `electron/google-oauth.json`. Without that file the desktop app simply offers folder sync only.
- **Android:** create an "Android" OAuth client for the package name `com.yigit.orendapass` and the SHA-1 fingerprint of the key your build is signed with.

### Code Layout

- `shared/` — vault format, encryption, sync and all vault logic. Platform independent, so the desktop and mobile apps read and write exactly the same files.
- `electron/` — the desktop shell: window, security settings and the Node-based crypto, storage, dialogs and Google sign-in the shared code runs on.
- `src/` — the React user interface. `src/host/` runs the shared code inside the page where there is no Electron (the mobile app), with pure-JavaScript crypto.
- `android/` — the Android project (Capacitor) that wraps the web app, plus the native Google sign-in plugin.
- `tests/` — unit tests (`tests/unit`) and end-to-end tests (`tests/e2e`).

---

## 🛠️ Technology Stack

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Runtime** | [Electron 44](https://www.electronjs.org/) | Cross-platform desktop shell & IPC |
| **Mobile Runtime** | [Capacitor 8](https://capacitorjs.com/) | Android app around the same web UI |
| **UI Framework** | [React 19](https://react.dev/) | Component architecture & reactivity |
| **Build Tool** | [Vite 7](https://vitejs.dev/) | Fast HMR dev server & asset bundler |
| **Packaging** | [electron-builder](https://www.electron.build/) | NSIS Windows installer generation |
| **Cryptography** | Node.js `crypto` (desktop), [@noble](https://paulmillr.com/noble/) (mobile) | AES-256, scrypt, SHA-256 / SHA-1 |
| **Sync** | Google Drive API or a local folder | Encrypted files only, no server of our own |
| **Design & Typography**| Space Grotesk & Inter | Modern dark-mode aesthetic |

---

## 📄 License

Released under the MIT License. See [`LICENSE`](LICENSE) for details.
