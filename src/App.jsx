import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

import { translations } from './translations';

// Lock the vault after this much time without any user input
const AUTO_LOCK_MS = 5 * 60 * 1000;

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwords, setPasswords] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [lang, setLang] = useState(localStorage.getItem('lang') || 'tr');
    const [lockNotice, setLockNotice] = useState(false);

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
                await window.electronAPI.logout();
            } finally {
                clearSession();
                setLockNotice(true);
            }
        };
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(lock, AUTO_LOCK_MS);
        };
        const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
        events.forEach(name => window.addEventListener(name, reset, { passive: true }));
        reset();

        return () => {
            clearTimeout(timer);
            events.forEach(name => window.removeEventListener(name, reset));
        };
    }, [isAuthenticated]);

    const handleLogin = (data, user) => {
        setLockNotice(false);
        setPasswords(data || []);
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
                    texts={texts}
                />
            ) : (
                <Login onLogin={handleLogin} texts={texts} notice={lockNotice ? texts.autoLocked : ''} />
            )}
        </div>
    );
}

export default App;
