import React, { useState, useEffect } from 'react';

// Note: I will only replace the code starting from the component function to avoid missing imports in the view (although I viewed the whole file).
// Wait, I should not remove imports.

function Login({ onLogin, texts }) {
    const [hasUser, setHasUser] = useState(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function check() {
            if (!window.electronAPI) {
                console.error("Electron API is missing!");
                setHasUser(false);
                setError("Electron Köprüsü Yüklenemedi! (Preload Error)");
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

    const handleLogin = async (e) => {
        e.preventDefault();
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
        if (password !== confirmPassword) {
            setError(texts ? texts.msgPassMismatch : 'Şifreler eşleşmiyor.');
            return;
        }
        if (password.length < 6) {
            setError(texts ? texts.msgShortPass : 'Şifre en az 6 karakter olmalıdır.');
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

    return (
        <div className="login-container">
            <div className="login-card glass">
                <h2>{hasUser ? texts.welcome : texts.setup}</h2>
                <p>{hasUser ? texts.enterMasterPass : texts.setMasterPass}</p>

                <form onSubmit={hasUser ? handleLogin : handleRegister}>
                    <div className="input-group">
                        <input
                            type="password"
                            placeholder={texts.masterPassword}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {!hasUser && (
                        <div className="input-group">
                            <input
                                type="password"
                                placeholder={texts.labelConfirmPass}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
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
