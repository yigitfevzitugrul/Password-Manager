import React, { useState, useEffect, useRef } from 'react';
import { exportToCSV, exportToJSON, triggerDownload, parseCSV, parseJSON } from '../utils/csvHelper';
import { v4 as uuidv4 } from 'uuid';

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const PaletteIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
        <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
);

const GlobeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

const DatabaseIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
);

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const UploadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

function AccountSettings({ currentUser, passwords = [], onSave, theme, toggleTheme, lang, setLang, texts }) {
    // Password Change State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [loading, setLoading] = useState(false);
    const [appVersion, setAppVersion] = useState('');

    // 2FA State
    const [is2FAActive, setIs2FAActive] = useState(false);
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const [twoFAStatusMsg, setTwoFAStatusMsg] = useState({ type: '', msg: '' });
    const [showDisablePrompt, setShowDisablePrompt] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');

    // Key File State
    const [keyFileStatus, setKeyFileStatus] = useState({ enabled: false, path: null });
    const [showKeyFilePrompt, setShowKeyFilePrompt] = useState(false);
    const [keyFilePassword, setKeyFilePassword] = useState('');
    const [keyFileMsg, setKeyFileMsg] = useState({ type: '', msg: '' });
    const [keyFileBusy, setKeyFileBusy] = useState(false);

    // Quick Unlock PIN State
    const [quickPinEnabled, setQuickPinEnabled] = useState(false);
    const [showQuickPinForm, setShowQuickPinForm] = useState(false);
    const [quickPinPassword, setQuickPinPassword] = useState('');
    const [quickPinValue, setQuickPinValue] = useState('');
    const [quickPinConfirm, setQuickPinConfirm] = useState('');
    const [quickPinMsg, setQuickPinMsg] = useState({ type: '', msg: '' });
    const [quickPinBusy, setQuickPinBusy] = useState(false);

    // Import State
    const fileInputRef = useRef(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importMsg, setImportMsg] = useState({ type: '', msg: '' });

    // Encrypted Backup State
    const [autoBackups, setAutoBackups] = useState([]);
    const [backupPreview, setBackupPreview] = useState(null);
    const [backupNeedsPassword, setBackupNeedsPassword] = useState(false);
    const [backupPassword, setBackupPassword] = useState('');
    const [backupError, setBackupError] = useState('');
    const [backupBusy, setBackupBusy] = useState(false);
    const backupDialogRef = useRef(null);

    // The backup dialogs open below the cards: bring them into view
    useEffect(() => {
        if ((backupPreview || backupNeedsPassword) && backupDialogRef.current) {
            backupDialogRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [backupPreview, backupNeedsPassword]);

    const refreshKeyFileStatus = () => {
        if (window.electronAPI && window.electronAPI.getKeyFileStatus) {
            window.electronAPI.getKeyFileStatus().then(res => setKeyFileStatus(res)).catch(() => {});
        }
    };

    const refreshAutoBackups = () => {
        if (window.electronAPI && window.electronAPI.listAutoBackups) {
            window.electronAPI.listAutoBackups().then(list => setAutoBackups(list || [])).catch(() => {});
        }
    };

    useEffect(() => {
        if (window.electronAPI) {
            if (window.electronAPI.getAppVersion) {
                window.electronAPI.getAppVersion().then(v => setAppVersion(v)).catch(() => {});
            }
            if (window.electronAPI.get2FAStatus) {
                window.electronAPI.get2FAStatus().then(res => {
                    setIs2FAActive(res.enabled);
                }).catch(() => {});
            }
        }
        refreshAutoBackups();
        refreshKeyFileStatus();
        if (window.electronAPI && window.electronAPI.getQuickPinStatus) {
            window.electronAPI.getQuickPinStatus().then(res => setQuickPinEnabled(res.enabled)).catch(() => {});
        }
    }, []);

    // Change Master Password
    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', msg: texts.msgPassMismatch });
            return;
        }
        if (newPassword.length < 8) {
            setStatus({ type: 'error', msg: texts.msgShortPass });
            return;
        }

        setLoading(true);
        setStatus({ type: '', msg: '' });

        try {
            const res = await window.electronAPI.changePassword(oldPassword, newPassword);
            if (res.success) {
                setStatus({ type: 'success', msg: texts.msgPassSuccess });
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setStatus({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: err.message });
        } finally {
            setLoading(false);
        }
    };

    // 2FA: Start Setup
    const handleStart2FASetup = async () => {
        setTwoFAStatusMsg({ type: '', msg: '' });
        setTwoFACode('');
        try {
            const res = await window.electronAPI.setup2FA();
            if (res.success) {
                setQrCodeUrl(res.qrCodeDataUrl);
                setSecretKey(res.secret);
                setShow2FASetup(true);
            } else {
                setTwoFAStatusMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setTwoFAStatusMsg({ type: 'error', msg: err.message });
        }
    };

    // 2FA: Enable
    const handleConfirm2FA = async (e) => {
        e.preventDefault();
        if (!twoFACode || twoFACode.length < 6) return;

        try {
            const res = await window.electronAPI.enable2FA(twoFACode);
            if (res.success) {
                setIs2FAActive(true);
                setShow2FASetup(false);
                setTwoFAStatusMsg({ type: 'success', msg: texts.twoFactorSuccess });
            } else {
                setTwoFAStatusMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setTwoFAStatusMsg({ type: 'error', msg: err.message });
        }
    };

    // 2FA: Disable
    const handleDisable2FA = async (e) => {
        e.preventDefault();
        try {
            const res = await window.electronAPI.disable2FA(disablePassword);
            if (res.success) {
                setIs2FAActive(false);
                setShowDisablePrompt(false);
                setDisablePassword('');
                setTwoFAStatusMsg({ type: 'success', msg: texts.twoFactorDisabledSuccess });
            } else {
                setTwoFAStatusMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setTwoFAStatusMsg({ type: 'error', msg: err.message });
        }
    };

    // Key File: Enable / Disable (both re-encrypt the vault, so the master password is required)
    const handleToggleKeyFile = async (e) => {
        e.preventDefault();
        setKeyFileBusy(true);
        setKeyFileMsg({ type: '', msg: '' });
        try {
            const res = keyFileStatus.enabled
                ? await window.electronAPI.disableKeyFile(keyFilePassword)
                : await window.electronAPI.enableKeyFile(keyFilePassword);
            if (res.success) {
                setKeyFileMsg({
                    type: 'success',
                    msg: keyFileStatus.enabled ? texts.keyFileDisabledSuccess : texts.keyFileEnabledSuccess
                });
                setShowKeyFilePrompt(false);
                setKeyFilePassword('');
                refreshKeyFileStatus();
            } else if (!res.canceled) {
                setKeyFileMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setKeyFileMsg({ type: 'error', msg: err.message });
        } finally {
            setKeyFileBusy(false);
        }
    };

    // Quick Unlock PIN: Set
    const handleSetQuickPin = async (e) => {
        e.preventDefault();
        if (quickPinValue.length < 4) {
            setQuickPinMsg({ type: 'error', msg: texts.quickPinTooShort });
            return;
        }
        if (quickPinValue !== quickPinConfirm) {
            setQuickPinMsg({ type: 'error', msg: texts.quickPinMismatch });
            return;
        }

        setQuickPinBusy(true);
        setQuickPinMsg({ type: '', msg: '' });
        try {
            const res = await window.electronAPI.setQuickPin(quickPinPassword, quickPinValue);
            if (res.success) {
                setQuickPinEnabled(true);
                setShowQuickPinForm(false);
                setQuickPinPassword('');
                setQuickPinValue('');
                setQuickPinConfirm('');
                setQuickPinMsg({ type: 'success', msg: texts.quickPinEnabledSuccess });
            } else {
                setQuickPinMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setQuickPinMsg({ type: 'error', msg: err.message });
        } finally {
            setQuickPinBusy(false);
        }
    };

    // Quick Unlock PIN: Remove
    const handleDisableQuickPin = async () => {
        try {
            const res = await window.electronAPI.disableQuickPin();
            if (res.success) {
                setQuickPinEnabled(false);
                setQuickPinMsg({ type: 'success', msg: texts.quickPinDisabledSuccess });
            } else {
                setQuickPinMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setQuickPinMsg({ type: 'error', msg: err.message });
        }
    };

    // Option 9: Export Handlers
    const handleExportJSON = () => {
        const json = exportToJSON(passwords);
        const dateStr = new Date().toISOString().slice(0, 10);
        triggerDownload(json, `sifre-kasa-${dateStr}.json`, 'application/json');
    };

    const handleExportCSV = () => {
        const csv = exportToCSV(passwords);
        const dateStr = new Date().toISOString().slice(0, 10);
        triggerDownload(csv, `sifre-kasa-${dateStr}.csv`, 'text/csv;charset=utf-8');
    };

    // Option 9: Import Handlers
    const handleFileSelected = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        setImportMsg({ type: '', msg: '' });
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            let parsedItems = [];

            if (file.name.endsWith('.json')) {
                parsedItems = parseJSON(content);
            } else {
                parsedItems = parseCSV(content);
            }

            if (parsedItems.length === 0) {
                setImportMsg({ type: 'error', msg: texts.importInvalidFile });
                return;
            }

            setImportPreview(parsedItems);
        };
        reader.readAsText(file);
        // Reset input value so same file can be selected again
        e.target.value = '';
    };

    const handleConfirmImport = () => {
        if (!importPreview || importPreview.length === 0) return;

        const newItems = importPreview.map(item => ({
            ...item,
            id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        }));

        const merged = [...passwords, ...newItems];
        if (onSave) {
            onSave(merged);
        }

        setImportMsg({
            type: 'success',
            msg: `${newItems.length} ${texts.importSuccess}`
        });
        setImportPreview(null);
    };

    // Encrypted Backup: Export
    const handleExportEncrypted = async () => {
        setImportMsg({ type: '', msg: '' });
        setBackupBusy(true);
        try {
            const res = await window.electronAPI.exportEncryptedBackup();
            if (res.success) {
                setImportMsg({ type: 'success', msg: texts.backupExportSuccess });
            } else if (!res.canceled) {
                setImportMsg({ type: 'error', msg: res.error });
            }
        } catch (err) {
            setImportMsg({ type: 'error', msg: err.message });
        } finally {
            setBackupBusy(false);
        }
    };

    const handleBackupResult = (res) => {
        if (res.success) {
            setBackupNeedsPassword(false);
            setBackupPassword('');
            setBackupError('');
            if (res.items.length === 0) {
                setImportMsg({ type: 'error', msg: texts.backupEmpty });
            } else {
                setBackupPreview(res.items);
            }
            refreshAutoBackups();
        } else if (res.needsPassword) {
            setBackupNeedsPassword(true);
            setBackupError(res.error || '');
        } else if (!res.canceled) {
            setBackupNeedsPassword(false);
            setImportMsg({ type: 'error', msg: res.error });
        }
    };

    // Encrypted Backup: Open (file picked in the main process, or an automatic backup)
    const handleOpenBackup = async (autoBackupName) => {
        setImportMsg({ type: '', msg: '' });
        setBackupError('');
        setBackupPassword('');
        setBackupBusy(true);
        try {
            handleBackupResult(await window.electronAPI.openBackup(autoBackupName));
        } catch (err) {
            setImportMsg({ type: 'error', msg: err.message });
        } finally {
            setBackupBusy(false);
        }
    };

    const handleUnlockBackup = async (e) => {
        e.preventDefault();
        setBackupBusy(true);
        try {
            handleBackupResult(await window.electronAPI.unlockBackup(backupPassword));
        } catch (err) {
            setBackupError(err.message);
        } finally {
            setBackupBusy(false);
        }
    };

    const handleCancelBackup = () => {
        if (window.electronAPI.cancelBackup) window.electronAPI.cancelBackup();
        setBackupNeedsPassword(false);
        setBackupPassword('');
        setBackupError('');
        setBackupPreview(null);
    };

    // Encrypted Backup: Restore (replace the vault, or add the entries to it)
    const handleRestoreBackup = (replace) => {
        if (!backupPreview || backupPreview.length === 0) return;

        const restored = replace
            ? backupPreview.map(item => ({ ...item, id: item.id || uuidv4() }))
            : [...passwords, ...backupPreview.map(item => ({ ...item, id: uuidv4() }))];
        if (onSave) {
            onSave(restored);
        }

        setImportMsg({
            type: 'success',
            msg: `${backupPreview.length} ${replace ? texts.backupRestoreSuccess : texts.importSuccess}`
        });
        setBackupPreview(null);
    };

    const formatBackupDate = (timestamp) =>
        new Date(timestamp).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <div className="account-settings">
            <h2>{texts.settingsTitle}</h2>

            {currentUser && (
                <div className="settings-user-card">
                    <div className="settings-user-avatar">
                        {currentUser.username ? currentUser.username.charAt(0).toUpperCase() : '👤'}
                    </div>
                    <div className="settings-user-details">
                        <div className="settings-user-title">{currentUser.username}</div>
                        <div className="settings-user-subtitle">
                            {texts.currentUserBadge || 'Aktif Hesap'}
                        </div>
                    </div>
                </div>
            )}

            {/* 2FA ACCOUNT SECURITY SECTION */}
            <div className="settings-section">
                <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3><ShieldIcon /> {texts.twoFactorTitle}</h3>
                    <span className={`badge ${is2FAActive ? 'badge-success' : 'badge-muted'}`}>
                        {is2FAActive ? texts.twoFactorEnabledBadge : texts.twoFactorDisabledBadge}
                    </span>
                </div>
                <p className="section-subtitle">{texts.twoFactorDesc}</p>

                {twoFAStatusMsg.msg && (
                    <div className={`status-message ${twoFAStatusMsg.type}`}>
                        {twoFAStatusMsg.msg}
                    </div>
                )}

                {!is2FAActive ? (
                    <div>
                        {!show2FASetup ? (
                            <button className="btn-primary" onClick={handleStart2FASetup} style={{ width: 'auto', marginTop: '0.5rem' }}>
                                <ShieldIcon /> {texts.twoFactorEnableBtn}
                            </button>
                        ) : (
                            <div className="twofa-setup-box">
                                <p className="twofa-instruction">{texts.twoFactorScanQR}</p>
                                <div className="twofa-qr-container">
                                    {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="twofa-qr-image" />}
                                </div>
                                <div className="twofa-manual-key">
                                    <span>{texts.twoFactorManualKey}</span>
                                    <code>{secretKey}</code>
                                    <button
                                        type="button"
                                        className="btn-icon"
                                        onClick={() => {
                                            window.electronAPI.copyToClipboard(secretKey);
                                        }}
                                        title={texts.genCopy}
                                    >
                                        <CopyIcon />
                                    </button>
                                </div>

                                <form onSubmit={handleConfirm2FA} className="twofa-verify-form">
                                    <label className="input-label">{texts.twoFactorEnterCode}</label>
                                    <div className="input-with-action">
                                        <input
                                            type="text"
                                            maxLength="6"
                                            placeholder="123456"
                                            value={twoFACode}
                                            onChange={e => setTwoFACode(e.target.value.replace(/[^0-9]/g, ''))}
                                            className="twofa-code-input"
                                            autoFocus
                                            required
                                        />
                                        <button type="submit" className="btn-primary" style={{ width: 'auto' }}>
                                            {texts.twoFactorConfirmBtn}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => setShow2FASetup(false)}
                                        >
                                            {texts.btnCancel}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        {!showDisablePrompt ? (
                            <button
                                className="btn-danger"
                                onClick={() => setShowDisablePrompt(true)}
                                style={{ width: 'auto', marginTop: '0.5rem' }}
                            >
                                {texts.twoFactorDisableBtn}
                            </button>
                        ) : (
                            <form onSubmit={handleDisable2FA} className="disable-2fa-form">
                                <label className="input-label">{texts.twoFactorDisableConfirm}</label>
                                <div className="input-with-action">
                                    <input
                                        type="password"
                                        placeholder={texts.masterPassword}
                                        value={disablePassword}
                                        onChange={e => setDisablePassword(e.target.value)}
                                        required
                                    />
                                    <button type="submit" className="btn-danger" style={{ width: 'auto' }}>
                                        {texts.twoFactorDisableBtn}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => {
                                            setShowDisablePrompt(false);
                                            setDisablePassword('');
                                        }}
                                    >
                                        {texts.btnCancel}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>

            {/* KEY FILE SECTION */}
            <div className="settings-section">
                <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3><ShieldIcon /> {texts.keyFileTitle}</h3>
                    <span className={`badge ${keyFileStatus.enabled ? 'badge-success' : 'badge-muted'}`}>
                        {keyFileStatus.enabled ? texts.keyFileEnabledBadge : texts.keyFileDisabledBadge}
                    </span>
                </div>
                <p className="section-subtitle">{texts.keyFileDesc}</p>
                <p className="warning-text">{texts.keyFileWarning}</p>

                {keyFileStatus.enabled && keyFileStatus.path && (
                    <p className="section-subtitle">{texts.keyFileLocation} <code>{keyFileStatus.path}</code></p>
                )}

                {keyFileMsg.msg && (
                    <div className={`status-message ${keyFileMsg.type}`}>
                        {keyFileMsg.msg}
                    </div>
                )}

                {!showKeyFilePrompt ? (
                    <button
                        className={keyFileStatus.enabled ? 'btn-danger' : 'btn-primary'}
                        onClick={() => {
                            setShowKeyFilePrompt(true);
                            setKeyFileMsg({ type: '', msg: '' });
                        }}
                        style={{ width: 'auto', marginTop: '0.5rem' }}
                    >
                        {keyFileStatus.enabled ? texts.keyFileDisableBtn : texts.keyFileEnableBtn}
                    </button>
                ) : (
                    <form onSubmit={handleToggleKeyFile} className="disable-2fa-form">
                        <label className="input-label">
                            {keyFileStatus.enabled ? texts.keyFileDisableConfirm : texts.keyFileEnableConfirm}
                        </label>
                        <div className="input-with-action">
                            <input
                                type="password"
                                placeholder={texts.masterPassword}
                                value={keyFilePassword}
                                onChange={e => setKeyFilePassword(e.target.value)}
                                autoFocus
                                required
                            />
                            <button
                                type="submit"
                                className={keyFileStatus.enabled ? 'btn-danger' : 'btn-primary'}
                                disabled={keyFileBusy}
                                style={{ width: 'auto' }}
                            >
                                {keyFileBusy
                                    ? texts.updating
                                    : (keyFileStatus.enabled ? texts.keyFileDisableBtn : texts.keyFileCreateBtn)}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setShowKeyFilePrompt(false);
                                    setKeyFilePassword('');
                                }}
                            >
                                {texts.btnCancel}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* QUICK UNLOCK PIN SECTION */}
            <div className="settings-section">
                <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3><LockIcon /> {texts.quickPinTitle}</h3>
                    <span className={`badge ${quickPinEnabled ? 'badge-success' : 'badge-muted'}`}>
                        {quickPinEnabled ? texts.keyFileEnabledBadge : texts.keyFileDisabledBadge}
                    </span>
                </div>
                <p className="section-subtitle">{texts.quickPinDesc}</p>

                {quickPinMsg.msg && (
                    <div className={`status-message ${quickPinMsg.type}`}>
                        {quickPinMsg.msg}
                    </div>
                )}

                {!showQuickPinForm ? (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <button
                            className="btn-primary"
                            onClick={() => {
                                setShowQuickPinForm(true);
                                setQuickPinMsg({ type: '', msg: '' });
                            }}
                            style={{ width: 'auto' }}
                        >
                            {quickPinEnabled ? texts.quickPinChangeBtn : texts.quickPinEnableBtn}
                        </button>
                        {quickPinEnabled && (
                            <button className="btn-danger" onClick={handleDisableQuickPin} style={{ width: 'auto' }}>
                                {texts.quickPinDisableBtn}
                            </button>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleSetQuickPin}>
                        <div className="input-group">
                            <label className="input-label">{texts.masterPassword}</label>
                            <input
                                type="password"
                                value={quickPinPassword}
                                onChange={e => setQuickPinPassword(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.quickPinLabel}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength="12"
                                value={quickPinValue}
                                onChange={e => setQuickPinValue(e.target.value.replace(/[^0-9]/g, ''))}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.quickPinConfirmLabel}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength="12"
                                value={quickPinConfirm}
                                onChange={e => setQuickPinConfirm(e.target.value.replace(/[^0-9]/g, ''))}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
                            <button type="submit" className="btn-primary" disabled={quickPinBusy} style={{ width: 'auto' }}>
                                {quickPinBusy ? texts.updating : texts.quickPinSaveBtn}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setShowQuickPinForm(false);
                                    setQuickPinPassword('');
                                    setQuickPinValue('');
                                    setQuickPinConfirm('');
                                }}
                            >
                                {texts.btnCancel}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* OPTION 9: DATA MANAGEMENT & BACKUP SECTION (IMPORT / EXPORT) */}
            <div className="settings-section">
                <h3><DatabaseIcon /> {texts.dataManagement}</h3>
                <p className="warning-text">{texts.exportWarning}</p>

                {importMsg.msg && (
                    <div className={`status-message ${importMsg.type}`}>
                        {importMsg.msg}
                    </div>
                )}

                <div className="data-management-grid">
                    {/* Encrypted Backup Card */}
                    <div className="data-card">
                        <div className="data-card-body">
                            <h4>{texts.backupTitle}</h4>
                            <p>{texts.backupDesc}</p>
                        </div>
                        <div className="data-actions-row">
                            <button
                                type="button"
                                className="btn-data-action btn-data-primary"
                                onClick={handleExportEncrypted}
                                disabled={backupBusy}
                            >
                                <DownloadIcon /> {texts.backupExportBtn}
                            </button>
                            <button
                                type="button"
                                className="btn-data-action btn-data-secondary"
                                onClick={() => handleOpenBackup()}
                                disabled={backupBusy}
                            >
                                <UploadIcon /> {texts.backupRestoreBtn}
                            </button>
                        </div>
                    </div>

                    {/* Automatic Backups Card */}
                    <div className="data-card">
                        <div className="data-card-body">
                            <h4>{texts.autoBackupTitle}</h4>
                            <p>{texts.autoBackupDesc}</p>
                        </div>
                        {autoBackups.length === 0 ? (
                            <p className="auto-backup-empty">{texts.autoBackupEmpty}</p>
                        ) : (
                            <div className="auto-backup-list">
                                {autoBackups.map(backup => (
                                    <div key={backup.name} className="auto-backup-row">
                                        <span>{formatBackupDate(backup.createdAt)}</span>
                                        <button
                                            type="button"
                                            className="btn-data-action btn-data-secondary"
                                            onClick={() => handleOpenBackup(backup.name)}
                                            disabled={backupBusy}
                                        >
                                            {texts.autoBackupRestoreBtn}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Export Card */}
                    <div className="data-card">
                        <div className="data-card-body">
                            <h4>{texts.exportTitle}</h4>
                            <p>{texts.exportDesc}</p>
                        </div>
                        <div className="data-actions-row">
                            <button
                                type="button"
                                className="btn-data-action btn-data-secondary"
                                onClick={handleExportJSON}
                                disabled={passwords.length === 0}
                                title="JSON"
                            >
                                <DownloadIcon /> {texts.exportJsonBtn}
                            </button>
                            <button
                                type="button"
                                className="btn-data-action btn-data-secondary"
                                onClick={handleExportCSV}
                                disabled={passwords.length === 0}
                                title="CSV"
                            >
                                <DownloadIcon /> {texts.exportCsvBtn}
                            </button>
                        </div>
                    </div>

                    {/* Import Card */}
                    <div className="data-card">
                        <div className="data-card-body">
                            <h4>{texts.importTitle}</h4>
                            <p>{texts.importDesc}</p>
                        </div>
                        <div className="data-actions-row">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelected}
                                accept=".json,.csv"
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                className="btn-data-action btn-data-primary"
                                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            >
                                <UploadIcon /> {texts.importSelectBtn}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Backup Password Prompt (backup encrypted with a different master password) */}
                {backupNeedsPassword && (
                    <div className="import-preview-modal" ref={backupDialogRef}>
                        <form className="import-preview-card" onSubmit={handleUnlockBackup}>
                            <h4>{texts.backupPasswordTitle}</h4>
                            <p>{texts.backupPasswordDesc}</p>
                            <div className="input-group">
                                <input
                                    type="password"
                                    placeholder={texts.masterPassword}
                                    value={backupPassword}
                                    onChange={e => setBackupPassword(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>
                            {backupError && <div className="status-message error">{backupError}</div>}
                            <div className="import-preview-actions">
                                <button type="submit" className="btn-data-action btn-data-primary" disabled={backupBusy}>
                                    {backupBusy ? texts.updating : texts.backupUnlockBtn}
                                </button>
                                <button type="button" className="btn-data-action btn-data-secondary" onClick={handleCancelBackup}>
                                    {texts.btnCancel}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Backup Restore Confirmation Dialog */}
                {backupPreview && (
                    <div className="import-preview-modal" ref={backupDialogRef}>
                        <div className="import-preview-card">
                            <h4>{texts.backupRestoreTitle}</h4>
                            <p>
                                <strong>{backupPreview.length}</strong> {texts.backupRestoreMsg}
                            </p>
                            <div className="import-items-preview">
                                {backupPreview.slice(0, 5).map((item, idx) => (
                                    <div key={idx} className="import-preview-row">
                                        <span>• {item.title || 'İsimsiz'}</span>
                                        <span className="sub">{item.username || '-'}</span>
                                    </div>
                                ))}
                                {backupPreview.length > 5 && (
                                    <div className="import-preview-more">
                                        + {backupPreview.length - 5} kayıt daha...
                                    </div>
                                )}
                            </div>
                            <p className="warning-text">{texts.backupReplaceWarning.replace('{count}', passwords.length)}</p>
                            <div className="import-preview-actions">
                                <button className="btn-data-action btn-data-primary" onClick={() => handleRestoreBackup(true)}>
                                    {texts.backupReplaceBtn}
                                </button>
                                <button className="btn-data-action btn-data-secondary" onClick={() => handleRestoreBackup(false)}>
                                    {texts.backupMergeBtn}
                                </button>
                                <button className="btn-data-action btn-data-secondary" onClick={handleCancelBackup}>
                                    {texts.btnCancel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Import Preview Confirmation Dialog */}
                {importPreview && (
                    <div className="import-preview-modal">
                        <div className="import-preview-card">
                            <h4>{texts.importConfirmTitle}</h4>
                            <p>
                                <strong>{importPreview.length}</strong> {texts.importConfirmMsg}
                            </p>
                            <div className="import-items-preview">
                                {importPreview.slice(0, 5).map((item, idx) => (
                                    <div key={idx} className="import-preview-row">
                                        <span>• {item.title || 'İsimsiz'}</span>
                                        <span className="sub">{item.username || '-'}</span>
                                    </div>
                                ))}
                                {importPreview.length > 5 && (
                                    <div className="import-preview-more">
                                        + {importPreview.length - 5} kayıt daha...
                                    </div>
                                )}
                            </div>
                            <div className="import-preview-actions">
                                <button className="btn-data-action btn-data-primary" onClick={handleConfirmImport}>
                                    {texts.importBtnConfirm}
                                </button>
                                <button className="btn-data-action btn-data-secondary" onClick={() => setImportPreview(null)}>
                                    {texts.btnCancel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CHANGE MASTER PASSWORD */}
            <div className="settings-section">
                <h3><LockIcon /> {texts.settingsChangeMaster}</h3>
                <p className="warning-text">{texts.settingsWarning}</p>

                <form onSubmit={handleChangePassword}>
                    <div className="input-group">
                        <label className="input-label">{texts.labelCurrentPass}</label>
                        <input
                            type="password"
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">{texts.labelNewPass}</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">{texts.labelConfirmPass}</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    {status.msg && (
                        <div className={`status-message ${status.type}`}>
                            {status.msg}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.75rem', width: 'auto' }}>
                        {loading ? texts.updating : texts.btnUpdatePass}
                    </button>
                </form>
            </div>

            {/* APPEARANCE */}
            <div className="settings-section">
                <h3><PaletteIcon /> {texts.settingsAppearance}</h3>
                <div className="settings-row">
                    <span>{texts.settingsLightMode}</span>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={theme === 'light'}
                            onChange={toggleTheme}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
            </div>

            {/* LANGUAGE */}
            <div className="settings-section">
                <h3><GlobeIcon /> {texts.settingsLanguage}</h3>
                <div className="lang-btn-group">
                    <button
                        className={`lang-btn ${lang === 'tr' ? 'active' : ''}`}
                        onClick={() => setLang('tr')}
                    >
                        🇹🇷 Türkçe
                    </button>
                    <button
                        className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                        onClick={() => setLang('en')}
                    >
                        🇬🇧 English
                    </button>
                </div>
            </div>

            {appVersion && (
                <div className="version-info">v{appVersion}</div>
            )}
        </div>
    );
}

export default AccountSettings;
