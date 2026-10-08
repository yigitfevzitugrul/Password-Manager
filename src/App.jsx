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
    // Revision of the entries in `passwords`; sent with every save so the vault knows what the
    // save is based on (entries synced from another device meanwhile are then never overwritten).
    // Kept in state, not a ref: it must always belong to the same render as the entries.
    const [vaultRevision, setVaultRevision] = useState(undefined);
    const noteRevision = (revision) => {
        if (typeof revision !== 'number') return;
        setVaultRevision(current => (current >= revision ? current : revision));
    };

    // Another device's changes were merged into the vault
    React.useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.onVaultChanged) return undefined;
        return window.electronAPI.onVaultChanged(({ items, revision }) => {
            noteRevision(revision);
            setPasswords(items);
        });
    }, []);

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
        setVaultRevision(undefined);
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
        let lastActivity = Date.now();
        const reset = () => {
            clearTimeout(timer);
            lastActivity = Date.now();
            // 0 = never lock on inactivity
            if (autoLockMinutes > 0) {
                timer = setTimeout(lock, autoLockMinutes * 60 * 1000);
            }
        };
        // Timers stand still while a phone keeps the app in the background: check the clock on return
        const onVisible = () => {
            if (document.visibilityState !== 'visible' || autoLockMinutes <= 0) return;
            if (Date.now() - lastActivity >= autoLockMinutes * 60 * 1000) {
                clearTimeout(timer);
                lock();
            }
        };
        const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
        events.forEach(name => window.addEventListener(name, reset, { passive: true }));
        document.addEventListener('visibilitychange', onVisible);
        reset();

        return () => {
            clearTimeout(timer);
            events.forEach(name => window.removeEventListener(name, reset));
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isAuthenticated, autoLockMinutes]);

    const handleLogin = (data, user, revision) => {
        setLockNotice(false);
        setVaultRevision(revision);

        const cutoff = Date.now() - TRASH_RETENTION_MS;
        const items = (data || []).filter(item => !item.deletedAt || item.deletedAt > cutoff);
        if (items.length !== (data || []).length) {
            window.electronAPI.savePasswords(items, revision).then(res => noteRevision(res.revision)).catch(() => {});
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
        const res = await window.electronAPI.savePasswords(newData, vaultRevision);
        noteRevision(res.revision);
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
