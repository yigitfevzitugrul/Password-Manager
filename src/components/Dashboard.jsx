import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Modal from './Modal';
import PasswordGenerator from './PasswordGenerator';
import AccountSettings from './AccountSettings';

// --- SVG Icons ---
const KeyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
);
const DiceIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="3" />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
        <circle cx="16" cy="8" r="1" fill="currentColor" />
        <circle cx="8" cy="16" r="1" fill="currentColor" />
        <circle cx="16" cy="16" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
);
const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);
const LogOutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);
const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);
const EditIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);
const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);
const ShieldLogo = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);
const VaultIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="9" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="15" />
        <line x1="9" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="15" y2="12" />
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
const ExternalLinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

const Dashboard = ({ data, onLogout, onSave, theme, toggleTheme, lang, setLang, texts }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [activeTab, setActiveTab] = useState('passwords');
    const [deleteItem, setDeleteItem] = useState(null);
    const [isViewMode, setIsViewMode] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '' });
    const [showPasswordField, setShowPasswordField] = useState(false);

    // Form State
    const [formData, setFormData] = useState({ title: '', username: '', password: '', url: '', notes: '' });

    const passwords = data || [];

    const filtered = passwords.filter(p => {
        const term = searchTerm.toLowerCase();
        return (p.title || '').toLowerCase().includes(term) ||
               (p.username || '').toLowerCase().includes(term) ||
               (p.url || '').toLowerCase().includes(term) ||
               (p.notes || '').toLowerCase().includes(term);
    });

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => setToast({ show: false, message: '' }), 2200);
    };

    const openModal = (item = null, viewMode = false) => {
        setIsViewMode(viewMode);
        setShowPasswordField(false);
        if (item) {
            setEditingItem(item);
            setFormData({
                title: item.title || '',
                username: item.username || '',
                password: item.password || '',
                url: item.url || '',
                notes: item.notes || ''
            });
        } else {
            setEditingItem(null);
            setFormData({ title: '', username: '', password: '', url: '', notes: '' });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingItem(null);
        setDeleteItem(null);
        setIsViewMode(false);
        setShowPasswordField(false);
    };

    const handleSaveEntry = (e) => {
        e.preventDefault();
        if (isViewMode) return;

        let newData;
        if (editingItem) {
            newData = passwords.map(p => p.id === editingItem.id ? { ...formData, id: editingItem.id } : p);
        } else {
            newData = [...passwords, { ...formData, id: uuidv4() }];
        }
        onSave(newData);
        showToast(texts.savedSuccess || 'Şifre başarıyla kaydedildi.');
        closeModal();
    };

    const confirmDelete = (item) => {
        setDeleteItem(item);
    };

    const handleDelete = () => {
        if (deleteItem) {
            const newData = passwords.filter(p => p.id !== deleteItem.id);
            onSave(newData);
            showToast(texts.deletedSuccess || 'Şifre silindi.');
            closeModal();
        }
    };

    const copyToClipboard = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(label || texts.copied || 'Kopyalandı');
    };

    const openUrl = (url) => {
        if (!url) return;
        let target = url;
        if (!/^https?:\/\//i.test(target)) {
            target = 'https://' + target;
        }
        window.open(target, '_blank');
    };

    const getInitials = (title) => {
        if (!title) return '?';
        return title.charAt(0).toUpperCase();
    };

    if (!texts) return null;

    return (
        <div className="dashboard">
            <nav className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <ShieldLogo />
                    </div>
                    <h3>{texts.appTitle}</h3>
                </div>

                <div className="sidebar-menu">
                    <button
                        className={`menu-item ${activeTab === 'passwords' ? 'active' : ''}`}
                        onClick={() => setActiveTab('passwords')}
                    >
                        <KeyIcon />
                        {texts.navPasswords}
                    </button>
                    <button
                        className={`menu-item ${activeTab === 'generator' ? 'active' : ''}`}
                        onClick={() => setActiveTab('generator')}
                    >
                        <DiceIcon />
                        {texts.navGenerator}
                    </button>
                    <button
                        className={`menu-item ${activeTab === 'account' ? 'active' : ''}`}
                        onClick={() => setActiveTab('account')}
                    >
                        <SettingsIcon />
                        {texts.navSettings}
                    </button>
                </div>

                <div className="sidebar-footer">
                    <button className="btn-logout" onClick={onLogout}>
                        <LogOutIcon />
                        {texts.logout}
                    </button>
                </div>
            </nav>

            <main className="content">
                {activeTab === 'passwords' && (
                    <>
                        <header className="top-bar">
                            <div className="search-wrapper">
                                <span className="search-icon"><SearchIcon /></span>
                                <input
                                    type="text"
                                    placeholder={texts.searchPlaceholder}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input-clean"
                                />
                            </div>
                            <button className="btn-primary" onClick={() => openModal()}>
                                <PlusIcon />
                                {texts.addNew}
                            </button>
                        </header>

                        <div className="password-list">
                            {filtered.length === 0 ? (
                                <div className="empty-state">
                                    <VaultIcon />
                                    <p>{texts.noPasswords}</p>
                                </div>
                            ) : (
                                filtered.map(item => (
                                    <div key={item.id} className="password-item">
                                        <div
                                            className="clickable-area"
                                            onClick={(e) => { e.stopPropagation(); openModal(item, true); }}
                                            title={texts.modalDetail}
                                        >
                                            <div className="item-avatar">
                                                {getInitials(item.title)}
                                            </div>
                                            <div className="item-info">
                                                <h4>{item.title}</h4>
                                                <span>{item.username}</span>
                                            </div>
                                        </div>
                                        <div className="item-actions">
                                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.password, texts.copiedPassword); }} title={texts.genCopy}>
                                                <CopyIcon />
                                            </button>
                                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); openModal(item); }} title={texts.modalEdit}>
                                                <EditIcon />
                                            </button>
                                            <button className="btn-icon-danger" onClick={(e) => { e.stopPropagation(); confirmDelete(item); }} title={texts.btnDelete}>
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
                {activeTab === 'account' && (
                    <AccountSettings
                        theme={theme}
                        toggleTheme={toggleTheme}
                        lang={lang}
                        setLang={setLang}
                        texts={texts}
                    />
                )}
                {activeTab === 'generator' && (
                    <div className="generator-page">
                        <h2>{texts.genTitle}</h2>
                        <div className="generator-page-card">
                            <PasswordGenerator texts={texts} />
                        </div>
                    </div>
                )}
            </main>

            {showModal && (
                <Modal
                    title={isViewMode ? texts.modalDetail : (editingItem ? texts.modalEdit : texts.modalAdd)}
                    onClose={closeModal}
                >
                    <form onSubmit={handleSaveEntry}>
                        <div className="input-group">
                            <label className="input-label">{texts.labelTitle}</label>
                            <input
                                type="text" placeholder={texts.titlePlaceholder}
                                value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                                required
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelUsername}</label>
                            <input
                                type="text" placeholder={texts.usernamePlaceholder}
                                value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                            {isViewMode && formData.username && (
                                <div style={{ marginTop: '6px' }}>
                                    <button type="button" className="btn-ghost" onClick={() => copyToClipboard(formData.username, texts.copiedUsername)} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <CopyIcon /> {texts.copiedUsername || 'Kullanıcı Adını Kopyala'}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelUrl}</label>
                            <input
                                type="text" placeholder={texts.urlPlaceholder}
                                value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                            {isViewMode && formData.url && (
                                <div style={{ marginTop: '6px' }}>
                                    <button type="button" className="btn-ghost" onClick={() => openUrl(formData.url)} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <ExternalLinkIcon /> {texts.openUrl || 'Bağlantıyı Aç'}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelPassword}</label>
                            <div className="input-with-icon">
                                <input
                                    type={showPasswordField ? "text" : "password"}
                                    placeholder={texts.passwordPlaceholder}
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    readOnly={isViewMode}
                                    className={isViewMode ? 'input-readonly' : ''}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="input-toggle-btn"
                                    onClick={() => setShowPasswordField(!showPasswordField)}
                                    tabIndex={-1}
                                >
                                    {showPasswordField ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                            {isViewMode && (
                                <div style={{ marginTop: '6px' }}>
                                    <button type="button" className="btn-ghost" onClick={() => copyToClipboard(formData.password, texts.copiedPassword)} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <CopyIcon /> {texts.genCopy}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelNotes}</label>
                            <textarea
                                placeholder={texts.notesPlaceholder}
                                value={formData.notes || ''}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                        </div>

                        {!isViewMode && (
                            <PasswordGenerator onGenerate={(pw) => setFormData(prev => ({ ...prev, password: pw }))} texts={texts} />
                        )}

                        <div className="modal-actions">
                            {isViewMode ? (
                                <>
                                    <button type="button" className="btn-primary" onClick={() => setIsViewMode(false)} style={{ width: 'auto' }}>
                                        <EditIcon /> {texts.switchToEdit || texts.modalEdit}
                                    </button>
                                    <button type="button" onClick={closeModal} className="btn-secondary">
                                        {texts.btnClose}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type="submit" className="btn-primary" style={{ width: 'auto' }}>
                                        {texts.btnSave}
                                    </button>
                                    <button type="button" onClick={closeModal} className="btn-secondary">
                                        {texts.btnCancel}
                                    </button>
                                </>
                            )}
                        </div>
                    </form>
                </Modal>
            )}

            {deleteItem && (
                <Modal title={texts.confirmDeleteTitle} onClose={closeModal}>
                    <div className="modal-delete-warning">
                        <p>{texts.confirmDeleteMsgStart}{deleteItem.title}{texts.confirmDeleteMsgEnd}</p>
                        <p className="sub-text">{texts.irreversibleAction}</p>
                    </div>
                    <div className="modal-actions">
                        <button className="btn-danger" onClick={handleDelete}>{texts.btnDelete}</button>
                        <button className="btn-ghost" onClick={closeModal}>{texts.btnCancel}</button>
                    </div>
                </Modal>
            )}

            {toast.show && (
                <div className="toast-notification">
                    <CheckIcon />
                    {toast.message}
                </div>
            )}
        </div>
    );
}

export default Dashboard;
