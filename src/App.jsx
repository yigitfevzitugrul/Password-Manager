import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

import { translations } from './translations';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwords, setPasswords] = useState([]);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [lang, setLang] = useState(localStorage.getItem('lang') || 'tr');

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

    const handleLogin = (data) => {
        setPasswords(data);
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        await window.electronAPI.logout();
        setPasswords([]);
        setIsAuthenticated(false);
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
                    onLogout={handleLogout}
                    onSave={handleSave}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    lang={lang}
                    setLang={setLang}
                    texts={texts}
                />
            ) : (
                <Login onLogin={handleLogin} texts={texts} />
            )}
        </div>
    );
}

export default App;
