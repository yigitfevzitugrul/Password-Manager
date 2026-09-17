import React, { useState, useEffect } from 'react';

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

function AccountSettings({ theme, toggleTheme, lang, setLang, texts }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [loading, setLoading] = useState(false);
    const [appVersion, setAppVersion] = useState('');

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            window.electronAPI.getAppVersion().then(v => setAppVersion(v)).catch(() => {});
        }
    }, []);

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

    return (
        <div className="account-settings">
            <h2>{texts.settingsTitle}</h2>

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

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.75rem' }}>
                        {loading ? texts.updating : texts.btnUpdatePass}
                    </button>
                </form>
            </div>

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
