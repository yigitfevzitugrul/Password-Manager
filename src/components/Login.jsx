import React, { useState, useEffect } from 'react';

const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

function Login({ onLogin, texts }) {
    const [hasUser, setHasUser] = useState(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        async function check() {
            if (!window.electronAPI) {
                console.error("Electron API is missing!");
                setHasUser(false);
                setError("Electron Köprüsü Yüklenemedi! Lütfen uygulamayı masaüstü modunda çalıştırın.");
                return;
            }
            try {
                const exists = await window.electronAPI.checkUser();
                setHasUser(exists);
            } catch (e) {
                console.error(e);
                setError("Bağlantı hatası: " + e.message);
            }
        }
        check();
    }, []);

    const getPasswordStrength = (pw) => {
        if (!pw) return { level: 0, label: '', color: 'transparent' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        if (score <= 1) return { level: 20, label: texts.strengthWeak || 'Zayıf', color: 'var(--danger)' };
        if (score <= 2) return { level: 40, label: texts.strengthFair || 'Orta', color: '#f59e0b' };
        if (score <= 3) return { level: 60, label: texts.strengthGood || 'İyi', color: '#3b82f6' };
        if (score <= 4) return { level: 80, label: texts.strengthStrong || 'Güçlü', color: '#10b981' };
        return { level: 100, label: texts.strengthVeryStrong || 'Çok Güçlü', color: '#10b981' };
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) {
            setError("Electron API bulunamadı.");
            return;
        }
        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.login(password);
            if (res.success) {
                onLogin(res.data);
            } else {
                setError(res.error || (texts ? texts.errorWrongPass : 'Giriş başarısız.'));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) {
            setError("Electron API bulunamadı.");
            return;
        }
        if (password !== confirmPassword) {
            setError(texts ? texts.msgPassMismatch : 'Şifreler eşleşmiyor.');
            return;
        }
        if (password.length < 8) {
            setError(texts ? texts.msgShortPass : 'Şifre en az 8 karakter olmalıdır.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.register(password);
            if (res.success) {
                onLogin([]);
            } else {
                setError(res.error || 'Kayıt başarısız.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fallback if texts is not yet available (should not happen if App passes it correctly)
    if (!texts) return null;

    if (hasUser === null) return <div className="loading">{texts.updating}</div>;

    const strength = !hasUser ? getPasswordStrength(password) : null;

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-icon">
                    <ShieldIcon />
                </div>
                <h2>{hasUser ? texts.welcome : texts.setup}</h2>
                <p>{hasUser ? texts.enterMasterPass : texts.setMasterPass}</p>

                <form onSubmit={hasUser ? handleLogin : handleRegister}>
                    <div className="input-group">
                        <div className="input-with-icon">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder={texts.masterPassword}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                            />
                            <button
                                type="button"
                                className="input-toggle-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                )}
                            </button>
                        </div>
                        {!hasUser && strength && password.length > 0 && (
                            <div className="strength-bar-container">
                                <div className="strength-bar">
                                    <div
                                        className="strength-bar-fill"
                                        style={{ width: `${strength.level}%`, background: strength.color }}
                                    />
                                </div>
                                <div className="strength-label" style={{ color: strength.color }}>
                                    {strength.label}
                                </div>
                            </div>
                        )}
                    </div>

                    {!hasUser && (
                        <div className="input-group">
                            <div className="input-with-icon">
                                <input
                                    type={showConfirm ? "text" : "password"}
                                    placeholder={texts.labelConfirmPass}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="input-toggle-btn"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    tabIndex={-1}
                                >
                                    {showConfirm ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? texts.updating : (hasUser ? texts.login : texts.createDb)}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
