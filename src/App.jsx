import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

import { translations } from './translations';
import { TRASH_RETENTION_MS } from './utils/trash';
import { readAutoLockMinutes, readClipboardClearSeconds } from './utils/securityTimers';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwords, setPasswords] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [lang, setLang] = useState(localStorage.getItem('lang') || 'tr');
    const [lockNotice, setLockNotice] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState(null);

    // Look for a newer release once at startup (can be turned off in Settings)
    React.useEffect(() => {
        if (localStorage.getItem('update_check') === 'false') return;
        if (!window.electronAPI || !window.electronAPI.checkForUpdates) return;
        window.electronAPI.checkForUpdates().then(res => {
            if (res.success && res.updateAvailable) setAvailableUpdate(res.latestVersion);
        }).catch(() => {});
    }, []);
    const [autoLockMinutes, setAutoLockMinutes] = useState(readAutoLockMinutes);
    const [clipboardSeconds, setClipboardSeconds] = useState(readClipboardClearSeconds);

    React.useEffect(() => {
        localStorage.setItem('auto_lock_minutes', String(autoLockMinutes));
    }, [autoLockMinutes]);

    // The clipboard is cleared by the main process, so it has to know the chosen delay
    React.useEffect(() => {
        localStorage.setItem('clipboard_clear_seconds', String(clipboardSeconds));
        if (window.electronAPI && window.electronAPI.setClipboardClearSeconds) {
            window.electronAPI.setClipboardClearSeconds(clipboardSeconds).catch(() => {});
        }
    }, [clipboardSeconds]);

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    React.useEffect(() => {
        localStorage.setItem('lang', lang);
    }, [lang]);

    const texts = translations[lang];

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const clearSession = () => {
        setPasswords([]);
        setCurrentUser(null);
        setIsAuthenticated(false);
    };

    // Main process locked the vault (screen lock / sleep)
    React.useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.onVaultLocked) return undefined;
        return window.electronAPI.onVaultLocked(() => {
            clearSession();
            setLockNotice(true);
        });
    }, []);

    // Inactivity auto-lock
    React.useEffect(() => {
        if (!isAuthenticated) return undefined;

        let timer = null;
        const lock = async () => {
            try {
                await window.electronAPI.autoLock();
            } finally {
                clearSession();
                setLockNotice(true);
            }
        };
        const reset = () => {
            clearTimeout(timer);
            // 0 = never lock on inactivity
            if (autoLockMinutes > 0) {
                timer = setTimeout(lock, autoLockMinutes * 60 * 1000);
            }
        };
        const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
        events.forEach(name => window.addEventListener(name, reset, { passive: true }));
        reset();

        return () => {
            clearTimeout(timer);
            events.forEach(name => window.removeEventListener(name, reset));
        };
    }, [isAuthenticated, autoLockMinutes]);

    const handleLogin = (data, user) => {
        setLockNotice(false);

        const cutoff = Date.now() - TRASH_RETENTION_MS;
        const items = (data || []).filter(item => !item.deletedAt || item.deletedAt > cutoff);
        if (items.length !== (data || []).length) {
            window.electronAPI.savePasswords(items).catch(() => {});
        }
        setPasswords(items);
        setCurrentUser(user || null);
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        try {
            await window.electronAPI.logout();
        } finally {
            clearSession();
        }
    };

    const handleSave = async (newData) => {
        setPasswords(newData);
        await window.electronAPI.savePasswords(newData);
    };

    return (
        <div className="app-container">
            {availableUpdate && (
                <div className="update-banner">
                    <span>{texts.updateAvailable.replace('{version}', availableUpdate)}</span>
                    <button type="button" className="update-banner-action" onClick={() => window.electronAPI.openReleasePage()}>
                        {texts.updateDownloadBtn}
                    </button>
                    <button type="button" className="update-banner-close" onClick={() => setAvailableUpdate(null)} aria-label={texts.btnClose}>
                        ✕
                    </button>
                </div>
            )}
            {isAuthenticated ? (
                <Dashboard
                    data={passwords}
                    currentUser={currentUser}
                    onLogout={handleLogout}
                    onSave={handleSave}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    lang={lang}
                    setLang={setLang}
                    autoLockMinutes={autoLockMinutes}
                    setAutoLockMinutes={setAutoLockMinutes}
                    clipboardSeconds={clipboardSeconds}
                    setClipboardSeconds={setClipboardSeconds}
                    texts={texts}
                />
            ) : (
                <Login onLogin={handleLogin} texts={texts} notice={lockNotice ? texts.autoLocked : ''} />
            )}
        </div>
    );
}

export default App;
