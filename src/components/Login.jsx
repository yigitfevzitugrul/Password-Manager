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

const UserPlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
);

const UserIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const MailIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
    </svg>
);

const ShieldAlertIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
);

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

function Login({ onLogin, texts }) {
    const [usersList, setUsersList] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);

    // Mode: Login vs Register
    const [isRegisterMode, setIsRegisterMode] = useState(false);

    // Registration Form Inputs: First name, Last name, Email, Password, Confirm Password
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);

    // Email Verification Step State
    const [isEmailVerifyStep, setIsEmailVerifyStep] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [simulatedCode, setSimulatedCode] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const resendTimerRef = useRef(null);

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

    const loadUsers = async () => {
        if (!window.electronAPI || !window.electronAPI.getUsers) {
            setIsLoadingUsers(false);
            return;
        }

        try {
            const res = await window.electronAPI.getUsers();
            const list = res.users || [];
            setUsersList(list);

            if (list.length > 0) {
                const activeId = res.lastActiveUserId && list.some(u => u.id === res.lastActiveUserId)
                    ? res.lastActiveUserId
                    : list[0].id;
                setSelectedUserId(activeId);
                setIsRegisterMode(false);
            } else {
                setIsRegisterMode(true);
            }
        } catch (e) {
            console.error('Error loading users:', e);
            setError('Hesaplar yüklenirken hata oluştu: ' + e.message);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    useEffect(() => {
        loadUsers();

        // Check for active lockout
        if (window.electronAPI && window.electronAPI.checkLockout) {
            window.electronAPI.checkLockout().then(lockStatus => {
                if (lockStatus.locked) {
                    startLockoutCountdown(lockStatus.remainingSeconds);
                } else if (lockStatus.attemptsRemaining !== undefined && lockStatus.attempts > 0) {
                    setAttemptsRemaining(lockStatus.attemptsRemaining);
                }
            }).catch(() => {});
        }

        return () => {
            if (lockoutTimerRef.current) {
                clearInterval(lockoutTimerRef.current);
            }
            if (resendTimerRef.current) {
                clearInterval(resendTimerRef.current);
            }
        };
    }, []);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            resendTimerRef.current = setInterval(() => {
                setResendCooldown(prev => {
                    if (prev <= 1) {
                        clearInterval(resendTimerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (resendTimerRef.current) {
                clearInterval(resendTimerRef.current);
            }
        };
    }, [resendCooldown]);

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

    // --- LOGIN HANDLER ---
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
            const res = await window.electronAPI.login(selectedUserId, password);
            if (res.success) {
                if (res.require2FA) {
                    setIs2FAStep(true);
                    setTwoFACode('');
                    setError('');
                } else {
                    onLogin(res.data, res.user);
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

    // --- 2FA STEP ON LOGIN ---
    const handleVerify2FALogin = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) return;
        if (!twoFACode || twoFACode.length < 6) return;

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.verify2FALogin(twoFACode);
            if (res.success) {
                onLogin(res.data, res.user);
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

    // --- STEP 1: REQUEST EMAIL VERIFICATION CODE ---
    const handleRequestVerificationCode = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) {
            setError("Electron API bulunamadı.");
            return;
        }

        const trimmedFirst = firstName.trim();
        const trimmedLast = lastName.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedFirst) {
            setError(texts.placeholderFirstName || 'Lütfen isminizi girin.');
            return;
        }
        if (!trimmedLast) {
            setError(texts.placeholderLastName || 'Lütfen soyisminizi girin.');
            return;
        }
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setError(texts.placeholderEmail || 'Lütfen geçerli bir e-posta adresi girin.');
            return;
        }
        if (password.length < 8) {
            setError(texts ? texts.msgShortPass : 'Şifre en az 8 karakter olmalıdır.');
            return;
        }
        if (password !== confirmPassword) {
            setError(texts ? texts.msgPassMismatch : 'Şifreler eşleşmiyor.');
            return;
        }
        if (!acknowledgedWarning) {
            setError('Lütfen şifrenin sıfırlanamayacağına ilişkin güvenlik uyarısını onaylayın.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.sendEmailCode({
                email: trimmedEmail,
                firstName: trimmedFirst,
                lastName: trimmedLast
            });

            if (res.success) {
                setSimulatedCode(res.codePreview || '');
                setIsEmailVerifyStep(true);
                setResendCooldown(60);
                setVerificationCode('');
            } else {
                setError(res.error || 'Doğrulama kodu gönderilemedi.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Resend code handler
    const handleResendCode = async () => {
        if (resendCooldown > 0 || loading) return;
        setLoading(true);
        setError('');
        try {
            const res = await window.electronAPI.sendEmailCode({
                email: email.trim().toLowerCase(),
                firstName: firstName.trim(),
                lastName: lastName.trim()
            });
            if (res.success) {
                setSimulatedCode(res.codePreview || '');
                setResendCooldown(60);
            } else {
                setError(res.error || 'Kod tekrar gönderilemedi.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- STEP 2: VERIFY CODE AND FINALIZE REGISTRATION ---
    const handleFinalRegister = async (e) => {
        e.preventDefault();
        if (!window.electronAPI) return;

        const cleanCode = verificationCode.trim();
        if (cleanCode.length < 6) {
            setError('Lütfen 6 haneli doğrulama kodunu eksiksiz girin.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await window.electronAPI.register({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim().toLowerCase(),
                password,
                code: cleanCode
            });

            if (res.success) {
                onLogin(res.data || [], res.user);
            } else {
                setError(res.error || 'Kayıt tamamlanamadı.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!texts) return null;
    if (isLoadingUsers) return <div className="loading">{texts.updating}</div>;

    const strength = isRegisterMode ? getPasswordStrength(password) : null;
    const selectedUser = usersList.find(u => u.id === selectedUserId) || usersList[0];

    return (
        <div className="login-container">
            <div className={`login-card ${isRegisterMode ? 'register-mode-card' : ''}`}>
                <div className="login-icon">
                    {isLocked ? (
                        <LockIcon />
                    ) : is2FAStep ? (
                        <KeyIcon />
                    ) : isRegisterMode && isEmailVerifyStep ? (
                        <MailIcon />
                    ) : isRegisterMode ? (
                        <UserPlusIcon />
                    ) : (
                        <>
                            <img
                                src="/icon.png"
                                alt="Logo"
                                className="login-app-logo"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextElementSibling) {
                                        e.currentTarget.nextElementSibling.style.display = 'block';
                                    }
                                }}
                            />
                            <div className="login-fallback-shield" style={{ display: 'none' }}>
                                <ShieldIcon />
                            </div>
                        </>
                    )}
                </div>

                {/* 2FA PROMPT SCREEN (FOR LOGGING IN USERS WHO HAVE 2FA ENABLED) */}
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
                                    placeholder=""
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
                ) : isRegisterMode && isEmailVerifyStep ? (
                    /* STEP 2: EMAIL VERIFICATION SCREEN */
                    <div>
                        <h2>{texts.stepEmailVerify || 'E-posta Doğrulaması'}</h2>
                        <p className="email-verify-info">
                            <strong>{email}</strong> {texts.stepEmailVerifyDesc || 'adresine 6 haneli bir doğrulama kodu gönderildi.'}
                        </p>

                        {/* Windows Notification / Local Simulated Code Badge */}
                        {simulatedCode && (
                            <div className="simulated-code-badge">
                                <div className="simulated-code-info">
                                    <span className="simulated-code-label">📬 {texts.simulationCodeBadge}</span>
                                    <strong className="simulated-code-number">{simulatedCode}</strong>
                                </div>
                                <button
                                    type="button"
                                    className="simulated-code-fill-btn"
                                    onClick={() => setVerificationCode(simulatedCode)}
                                >
                                    {texts.genUse || 'Kodu Doldur'}
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleFinalRegister}>
                            <div className="input-group">
                                <label className="input-label">{texts.labelVerificationCode || 'Doğrulama Kodu'}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength="6"
                                    placeholder=""
                                    value={verificationCode}
                                    onChange={e => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    autoFocus
                                    className="verification-code-input"
                                    required
                                />
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button
                                type="submit"
                                disabled={loading || verificationCode.length < 6}
                                className="btn-primary"
                            >
                                {loading ? texts.updating : (texts.btnVerifyAndRegister || 'Kodu Doğrula ve Hesabı Aç')}
                            </button>

                            <div className="verify-actions-row">
                                <button
                                    type="button"
                                    className="btn-ghost-sm"
                                    disabled={resendCooldown > 0 || loading}
                                    onClick={handleResendCode}
                                >
                                    {resendCooldown > 0
                                        ? `${texts.btnResendCode || 'Tekrar Gönder'} (${resendCooldown}s)`
                                        : (texts.btnResendCode || 'Tekrar Kod Gönder')}
                                </button>

                                <button
                                    type="button"
                                    className="btn-ghost-sm"
                                    onClick={() => {
                                        setIsEmailVerifyStep(false);
                                        setError('');
                                    }}
                                >
                                    {texts.changeInfoBtn || '← Bilgileri Düzenle'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* STEP 1: LOGIN MODE OR REGISTER FORM */
                    <div>
                        <h2>
                            {isRegisterMode
                                ? (texts.registerTitle || 'Yeni Hesap Oluştur')
                                : texts.welcome}
                        </h2>
                        <p>
                            {isRegisterMode
                                ? (texts.registerDesc || 'Cihazdaki diğer kullanıcılardan bağımsız, şifreli yeni bir hesap oluşturun.')
                                : texts.enterMasterPass}
                        </p>

                        {isLocked && !isRegisterMode && (
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

                        <form onSubmit={isRegisterMode ? handleRequestVerificationCode : handleLogin}>
                            {/* REGISTER MODE FIELDS */}
                            {isRegisterMode ? (
                                <>
                                    {/* FIRST NAME & LAST NAME (Side by side) */}
                                    <div className="input-row-dual">
                                        <div className="input-group">
                                            <label className="input-label">{texts.labelFirstName || 'İsim'}</label>
                                            <input
                                                type="text"
                                                placeholder=""
                                                value={firstName}
                                                onChange={e => setFirstName(e.target.value)}
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">{texts.labelLastName || 'Soyisim'}</label>
                                            <input
                                                type="text"
                                                placeholder=""
                                                value={lastName}
                                                onChange={e => setLastName(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* EMAIL ADDRESS */}
                                    <div className="input-group">
                                        <label className="input-label">{texts.labelEmail || 'E-posta Adresi'}</label>
                                        <div className="input-with-icon">
                                            <input
                                                type="email"
                                                placeholder=""
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                required
                                            />
                                            <div className="input-trailing-icon">
                                                <MailIcon />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* LOGIN MODE: ACCOUNT SELECTOR */
                                usersList.length > 1 ? (
                                    <div className="input-group">
                                        <label className="input-label">{texts.selectAccount || 'Giriş Yapılacak Hesap'}</label>
                                        <div className="account-select-wrapper">
                                            <select
                                                className="account-select-dropdown"
                                                value={selectedUserId}
                                                onChange={e => {
                                                    setSelectedUserId(e.target.value);
                                                    setError('');
                                                    setPassword('');
                                                }}
                                            >
                                                {usersList.map(u => (
                                                    <option key={u.id} value={u.id}>
                                                        👤 {u.username}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    /* Single User Account Display */
                                    selectedUser && (
                                        <div className="single-account-display">
                                            <div className="single-account-avatar">
                                                {selectedUser.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="single-account-info">
                                                <span className="single-account-label">{texts.currentUserBadge || 'Hesap:'}</span>
                                                <strong className="single-account-name">{selectedUser.username}</strong>
                                            </div>
                                        </div>
                                    )
                                )
                            )}

                            {/* MASTER PASSWORD FIELD */}
                            <div className="input-group">
                                <label className="input-label">{texts.masterPassword || 'Ana Şifre'}</label>
                                <div className="input-with-icon">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder=""
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoFocus={!isRegisterMode}
                                        disabled={isLocked && !isRegisterMode}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="input-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                        disabled={isLocked && !isRegisterMode}
                                    >
                                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>

                                {isRegisterMode && strength && password.length > 0 && (
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

                            {/* CONFIRM PASSWORD INPUT (Visible only in register mode) */}
                            {isRegisterMode && (
                                <div className="input-group">
                                    <label className="input-label">{texts.labelConfirmPass || 'Yeni Şifre (Tekrar)'}</label>
                                    <div className="input-with-icon">
                                        <input
                                            type={showConfirm ? "text" : "password"}
                                            placeholder=""
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="input-toggle-btn"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            tabIndex={-1}
                                        >
                                            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ZERO-KNOWLEDGE CRITICAL PASSWORD WARNING BANNER (Only in register mode) */}
                            {isRegisterMode && (
                                <div className="zero-knowledge-box">
                                    <div className="zero-knowledge-header">
                                        <ShieldAlertIcon />
                                        <span>{texts.zeroKnowledgeWarningTitle}</span>
                                    </div>
                                    <p className="zero-knowledge-text">
                                        {texts.zeroKnowledgeWarningDesc}
                                    </p>
                                    <label className="zero-knowledge-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={acknowledgedWarning}
                                            onChange={e => setAcknowledgedWarning(e.target.checked)}
                                            required
                                        />
                                        <span>{texts.zeroKnowledgeAck}</span>
                                    </label>
                                </div>
                            )}

                            {error && (!isLocked || isRegisterMode) && <div className="error-message">{error}</div>}

                            {!isLocked && attemptsRemaining !== null && attemptsRemaining > 0 && !isRegisterMode && (
                                <div className="attempts-warning">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>{attemptsRemaining} {texts.attemptsWarning}</span>
                                </div>
                            )}

                            {/* PRIMARY SUBMIT BUTTON */}
                            <button
                                type="submit"
                                disabled={loading || (isLocked && !isRegisterMode)}
                                className="btn-primary"
                            >
                                {loading
                                    ? texts.updating
                                    : (isRegisterMode
                                        ? (texts.btnSendCode || 'Devam Et & Doğrulama Kodu Gönder')
                                        : texts.login)}
                            </button>

                            {/* TOGGLE BETWEEN LOGIN & REGISTER NEW ACCOUNT */}
                            {!isRegisterMode ? (
                                <div className="auth-switch-footer">
                                    <span className="auth-switch-text">{texts.noAccountYet || 'Başka bir kullanıcı mısınız?'}</span>
                                    <button
                                        type="button"
                                        className="auth-link-btn"
                                        onClick={() => {
                                            setIsRegisterMode(true);
                                            setIsEmailVerifyStep(false);
                                            setError('');
                                            setFirstName('');
                                            setLastName('');
                                            setEmail('');
                                            setPassword('');
                                            setConfirmPassword('');
                                            setAcknowledgedWarning(false);
                                        }}
                                    >
                                        <UserPlusIcon />
                                        <span>{texts.register || 'Yeni Hesap Ekle'}</span>
                                    </button>
                                </div>
                            ) : (
                                usersList.length > 0 && (
                                    <div className="auth-switch-footer">
                                        <span className="auth-switch-text">{texts.hasAccountAlready || 'Zaten bir hesabınız var mı?'}</span>
                                        <button
                                            type="button"
                                            className="auth-link-btn"
                                            onClick={() => {
                                                setIsRegisterMode(false);
                                                setIsEmailVerifyStep(false);
                                                setError('');
                                                setPassword('');
                                                setConfirmPassword('');
                                                setAcknowledgedWarning(false);
                                            }}
                                        >
                                            <UserIcon />
                                            <span>{texts.backToLogin || 'Mevcut Hesaba Giriş Yap'}</span>
                                        </button>
                                    </div>
                                )
                            )}
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Login;
