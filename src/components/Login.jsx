import React, { useState, useEffect, useRef } from 'react';

const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const KeyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
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

    // Lockout state
    const [isLocked, setIsLocked] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const [attemptsRemaining, setAttemptsRemaining] = useState(null);
    const lockoutTimerRef = useRef(null);

    // 2FA Verification Step on Login
    const [is2FAStep, setIs2FAStep] = useState(false);
    const [twoFACode, setTwoFACode] = useState('');

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

                // Check for any existing lockout
                if (exists && window.electronAPI.checkLockout) {
                    const lockStatus = await window.electronAPI.checkLockout();
                    if (lockStatus.locked) {
                        startLockoutCountdown(lockStatus.remainingSeconds);
                    } else if (lockStatus.attemptsRemaining !== undefined && lockStatus.attempts > 0) {
                        setAttemptsRemaining(lockStatus.attemptsRemaining);
                    }
                }
            } catch (e) {
                console.error(e);
                setError("Bağlantı hatası: " + e.message);
            }
        }
        check();

        return () => {
            if (lockoutTimerRef.current) {
                clearInterval(lockoutTimerRef.current);
            }
        };
    }, []);

    const startLockoutCountdown = (seconds) => {
        setIsLocked(true);
        setLockoutSeconds(seconds);
        setAttemptsRemaining(null);

        if (lockoutTimerRef.current) {
            clearInterval(lockoutTimerRef.current);
        }

        lockoutTimerRef.current = setInterval(() => {
            setLockoutSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(lockoutTimerRef.current);
                    lockoutTimerRef.current = null;
                    setIsLocked(false);
                    setError('');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

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
        if (isLocked) return;

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.login(password);
            if (res.success) {
                if (res.require2FA) {
                    // Account requires 2FA! Switch to step 2
                    setIs2FAStep(true);
                    setTwoFACode('');
                    setError('');
                } else {
                    onLogin(res.data);
                }
            } else {
                setError(res.error || (texts ? texts.errorWrongPass : 'Giriş başarısız.'));
                setPassword('');

                if (res.locked) {
                    startLockoutCountdown(res.remainingSeconds);
                } else if (res.attemptsRemaining !== undefined) {
                    setAttemptsRemaining(res.attemptsRemaining);
                }
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2FALogin = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) return;
        if (!twoFACode || twoFACode.length < 6) return;

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.verify2FALogin(twoFACode);
            if (res.success) {
                onLogin(res.data);
            } else {
                setError(res.error || 'Doğrulama kodu geçersiz.');
                setTwoFACode('');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel2FA = async () => {
        if (window.electronAPI && window.electronAPI.cancel2FALogin) {
            await window.electronAPI.cancel2FALogin();
        }
        setIs2FAStep(false);
        setTwoFACode('');
        setPassword('');
        setError('');
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

    if (!texts) return null;

    if (hasUser === null) return <div className="loading">{texts.updating}</div>;

    const strength = !hasUser ? getPasswordStrength(password) : null;

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-icon">
                    {isLocked ? <LockIcon /> : (is2FAStep ? <KeyIcon /> : <ShieldIcon />)}
                </div>

                {/* 2FA PROMPT SCREEN */}
                {is2FAStep ? (
                    <div>
                        <h2>{texts.twoFactorPromptTitle}</h2>
                        <p>{texts.twoFactorPromptDesc}</p>

                        <form onSubmit={handleVerify2FALogin}>
                            <div className="input-group">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength="6"
                                    placeholder="123456"
                                    value={twoFACode}
                                    onChange={e => setTwoFACode(e.target.value.replace(/[^0-9]/g, ''))}
                                    autoFocus
                                    className="twofa-login-input"
                                    required
                                />
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button type="submit" disabled={loading || twoFACode.length < 6} className="btn-primary">
                                {loading ? texts.updating : texts.twoFactorVerifyBtn}
                            </button>

                            <button
                                type="button"
                                onClick={handleCancel2FA}
                                className="btn-secondary"
                                style={{ marginTop: '0.75rem', width: '100%' }}
                            >
                                {texts.twoFactorBackBtn}
                            </button>
                        </form>
                    </div>
                ) : (
                    /* NORMAL LOGIN / SETUP SCREEN */
                    <div>
                        <h2>{hasUser ? texts.welcome : texts.setup}</h2>
                        <p>{hasUser ? texts.enterMasterPass : texts.setMasterPass}</p>

                        {isLocked && (
                            <div className="lockout-banner">
                                <div className="lockout-icon">
                                    <LockIcon />
                                </div>
                                <div className="lockout-text">
                                    <span className="lockout-title">{texts.lockoutMessage}</span>
                                    <span className="lockout-countdown">
                                        <span className="lockout-seconds">{lockoutSeconds}</span>
                                        {' '}{texts.lockoutWait}
                                    </span>
                                </div>
                                <div className="lockout-progress">
                                    <div
                                        className="lockout-progress-bar"
                                        style={{
                                            animation: `lockoutShrink ${lockoutSeconds}s linear forwards`
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        <form onSubmit={hasUser ? handleLogin : handleRegister}>
                            <div className="input-group">
                                <div className="input-with-icon">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder={texts.masterPassword}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoFocus
                                        disabled={isLocked}
                                    />
                                    <button
                                        type="button"
                                        className="input-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                        disabled={isLocked}
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

                            {error && !isLocked && <div className="error-message">{error}</div>}

                            {!isLocked && attemptsRemaining !== null && attemptsRemaining > 0 && hasUser && (
                                <div className="attempts-warning">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>{attemptsRemaining} {texts.attemptsWarning}</span>
                                </div>
                            )}

                            <button type="submit" disabled={loading || isLocked} className="btn-primary">
                                {loading ? texts.updating : (hasUser ? texts.login : texts.createDb)}
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Login;
