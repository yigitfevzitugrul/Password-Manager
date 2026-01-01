import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Modal from './Modal';
import PasswordGenerator from './PasswordGenerator';
import AccountSettings from './AccountSettings';

const Dashboard = ({ data, onLogout, onSave, theme, toggleTheme, lang, setLang, texts }) => {

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [activeTab, setActiveTab] = useState('passwords'); // 'passwords', 'account'
    const [deleteItem, setDeleteItem] = useState(null);
    const [isViewMode, setIsViewMode] = useState(false);
    const [copyNotification, setCopyNotification] = useState(false);

    // Form State
    const [formData, setFormData] = useState({ title: '', username: '', password: '', url: '', notes: '' });

    const passwords = data || [];

    const filtered = passwords.filter(p =>
        (p.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.username || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openModal = (item = null, viewMode = false) => {
        setIsViewMode(viewMode);
        if (item) {
            setEditingItem(item);
            setFormData({ ...item });
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
        closeModal();
    };

    const confirmDelete = (item) => {
        setDeleteItem(item);
    };

    const handleDelete = () => {
        if (deleteItem) {
            const newData = passwords.filter(p => p.id !== deleteItem.id);
            onSave(newData);
            closeModal();
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopyNotification(true);
        setTimeout(() => setCopyNotification(false), 2000);
    };


    if (!texts) return null;

    return (
        <div className="dashboard">
            <nav className="sidebar glass">
                <div className="sidebar-header">
                    <h3>{texts.appTitle}</h3>
                </div>

                <div className="sidebar-menu">
                    <button
                        className={`menu-item ${activeTab === 'passwords' ? 'active' : ''}`}
                        onClick={() => setActiveTab('passwords')}
                    >
                        {texts.navPasswords}
                    </button>
                    <button
                        className={`menu-item ${activeTab === 'generator' ? 'active' : ''}`}
                        onClick={() => setActiveTab('generator')}
                    >
                        {texts.navGenerator}
                    </button>
                    <button
                        className={`menu-item ${activeTab === 'account' ? 'active' : ''}`}
                        onClick={() => setActiveTab('account')}
                    >
                        {texts.navSettings}
                    </button>
                </div>

                <div className="sidebar-footer">
                    <button className="btn-logout" onClick={onLogout}>
                        <span style={{ fontSize: '1.2rem' }}>🚪</span>
                        {texts.logout}
                    </button>
                </div>
            </nav>

            <main className="content">
                {activeTab === 'passwords' && (
                    <>
                        <header className="top-bar">
                            <div className="search-wrapper glass">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder={texts.searchPlaceholder}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input-clean"
                                />
                            </div>
                            <button className="btn-primary" onClick={() => openModal()}>
                                <span style={{ marginRight: '8px' }}>+</span>
                                {texts.addNew}
                            </button>
                        </header>

                        <div className="password-list">
                            {filtered.length === 0 ? (
                                <div className="empty-state">
                                    <p>{texts.noPasswords}</p>
                                </div>
                            ) : (
                                filtered.map(item => (
                                    <div key={item.id} className="password-item glass">
                                        <div
                                            className="item-info clickable-area"
                                            onClick={() => openModal(item, true)}
                                            title={texts.modalDetail}
                                        >
                                            <h4>{item.title}</h4>
                                            <span>{item.username}</span>
                                        </div>
                                        <div className="item-actions">
                                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.password); }} title={texts.genCopy}>📋</button>
                                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); openModal(item); }} title={texts.modalEdit}>✏️</button>
                                            <button className="btn-icon" style={{ color: '#f38ba8' }} onClick={(e) => { e.stopPropagation(); confirmDelete(item); }} title={texts.btnDelete}>🗑️</button>
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
                    <div className="glass" style={{ padding: '2rem', height: '100%' }}>
                        <h2>{texts.genTitle}</h2>
                        <PasswordGenerator texts={texts} />
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
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelUrl}</label>
                            <input
                                type="text" placeholder={texts.urlPlaceholder}
                                value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelPassword}</label>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <input
                                    type="text" placeholder={texts.passwordPlaceholder}
                                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    readOnly={isViewMode}
                                    className={isViewMode ? 'input-readonly' : ''}
                                />
                                {isViewMode && (
                                    <button type="button" className="btn-icon glass" onClick={() => copyToClipboard(formData.password)} title={texts.genCopy}>
                                        📋
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="input-group">
                            <label className="input-label">{texts.labelNotes}</label>
                            <textarea
                                placeholder={texts.notesPlaceholder}
                                value={formData.notes || ''}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                                style={{
                                    minHeight: '60px',
                                    maxHeight: '150px',
                                    resize: 'vertical',
                                    width: '100%',
                                    padding: '0.8rem',
                                    borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        {!isViewMode && (
                            <PasswordGenerator onGenerate={(pw) => setFormData(prev => ({ ...prev, password: pw }))} texts={texts} />
                        )}

                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {!isViewMode && <button type="submit" className="btn-primary">{texts.btnSave}</button>}
                            <button type="button" onClick={closeModal} style={{ background: '#45475a', color: 'white' }}>
                                {isViewMode ? texts.btnClose : texts.btnCancel}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {deleteItem && (
                <Modal title={texts.confirmDeleteTitle} onClose={closeModal}>
                    <p>{texts.confirmDeleteMsgStart}{deleteItem.title}{texts.confirmDeleteMsgEnd}</p>
                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>{texts.irreversibleAction}</p>
                    <div className="modal-actions">
                        <button className="btn-text" onClick={closeModal}>{texts.btnCancel}</button>
                        <button className="btn-danger" onClick={handleDelete}>{texts.btnDelete}</button>
                    </div>
                </Modal>
            )}

            {copyNotification && (
                <div className="toast-notification glass">
                    <span>✅</span>
                    {texts.copied}
                </div>
            )}
        </div>
    );
}

export default Dashboard;
