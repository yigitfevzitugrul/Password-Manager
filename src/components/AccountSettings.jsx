import React, { useState } from 'react';

// Note: I'll target the whole function body to be safe and clean.
function AccountSettings({ theme, toggleTheme, lang, setLang, texts }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [loading, setLoading] = useState(false);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', msg: texts.msgPassMismatch });
            return;
        }
        if (newPassword.length < 6) {
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

            <div className="settings-section glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>{texts.settingsChangeMaster}</h3>
                <p className="warning-text">{texts.settingsWarning}</p>

                <form onSubmit={handleChangePassword}>
                    <div className="input-group">
                        <label>{texts.labelCurrentPass}</label>
                        <input
                            type="password"
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>{texts.labelNewPass}</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>{texts.labelConfirmPass}</label>
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

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? texts.updating : texts.btnUpdatePass}
                    </button>
                </form>
            </div>

            <div className="settings-section glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>{texts.settingsAppearance}</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
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

            <div className="settings-section glass" style={{ padding: '2rem' }}>
                <h3 style={{ marginTop: 0 }}>{texts.settingsLanguage}</h3>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button
                        className="btn-text"
                        onClick={() => setLang('tr')}
                        style={{
                            border: lang === 'tr' ? '1px solid var(--primary-color)' : '1px solid transparent',
                            background: lang === 'tr' ? 'rgba(137, 180, 250, 0.1)' : 'transparent',
                            color: lang === 'tr' ? 'var(--primary-color)' : 'var(--text-color)',
                            flex: 1
                        }}
                    >
                        Türkçe
                    </button>
                    <button
                        className="btn-text"
                        onClick={() => setLang('en')}
                        style={{
                            border: lang === 'en' ? '1px solid var(--primary-color)' : '1px solid transparent',
                            background: lang === 'en' ? 'rgba(137, 180, 250, 0.1)' : 'transparent',
                            color: lang === 'en' ? 'var(--primary-color)' : 'var(--text-color)',
                            flex: 1
                        }}
                    >
                        English
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AccountSettings;
