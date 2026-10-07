import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Modal from './Modal';
import PasswordGenerator from './PasswordGenerator';
import AccountSettings from './AccountSettings';
import VaultStats from './VaultStats';
import TotpDisplay from './TotpDisplay';
import { isValidBase32 } from '../utils/totp';
import { calculatePasswordStrength } from '../utils/passwordStrength';

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
const StatsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
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
const StarIcon = ({ filled = false }) => (
    <svg viewBox="0 0 24 24" fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);
const GripIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
    </svg>
);
const ShieldAlertIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
);

const ChevronIcon = ({ open = true }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

// Categories definitions
const CATEGORIES = [
    { key: 'all', icon: '📁', labelKey: 'catAll' },
    { key: 'social', icon: '🌐', labelKey: 'catSocial' },
    { key: 'finance', icon: '💳', labelKey: 'catFinance' },
    { key: 'email', icon: '✉️', labelKey: 'catEmail' },
    { key: 'work', icon: '💼', labelKey: 'catWork' },
    { key: 'shopping', icon: '🛍️', labelKey: 'catShopping' },
    { key: 'other', icon: '📌', labelKey: 'catOther' }
];

const Dashboard = ({ data, currentUser, onLogout, onSave, theme, toggleTheme, lang, setLang, texts }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [activeTab, setActiveTab] = useState('passwords'); // 'passwords', 'generator', 'stats', 'account'
    const [deleteItem, setDeleteItem] = useState(null);
    const [isViewMode, setIsViewMode] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '' });
    const [showPasswordField, setShowPasswordField] = useState(false);

    // Option 5: Category Filter
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [categoriesOpen, setCategoriesOpen] = useState(() => localStorage.getItem('categories_open') !== 'false');

    // Option 6: Favorites Filter
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

    // Option 7: Sorting
    const [sortMode, setSortMode] = useState(() => localStorage.getItem('sort_preference') || 'custom');

    // Quick filter from Stats tab (e.g. 'weak', 'reused')
    const [quickFilter, setQuickFilter] = useState(null);

    // Option 15: Drag & Drop State
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Option 18: Single Item HIBP Breach Check
    const [breachResult, setBreachResult] = useState(null);
    const [isCheckingBreach, setIsCheckingBreach] = useState(false);

    // Form State (with Category and Favorite)
    const [formData, setFormData] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        category: 'other',
        notes: '',
        totpSecret: '',
        isFavorite: false
    });

    const passwords = data || [];

    // Save sort preference
    const handleSortChange = (newSort) => {
        setSortMode(newSort);
        localStorage.setItem('sort_preference', newSort);
    };

    const toggleCategories = () => {
        setCategoriesOpen(prev => {
            localStorage.setItem('categories_open', String(!prev));
            return !prev;
        });
    };

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => setToast({ show: false, message: '' }), 2200);
    };

    // Option 6: Instant Favorite Toggle
    const handleToggleFavorite = (e, item) => {
        e.stopPropagation();
        const updated = passwords.map(p =>
            p.id === item.id ? { ...p, isFavorite: !p.isFavorite } : p
        );
        onSave(updated);
        showToast(!item.isFavorite ? texts.favAdded : texts.favRemoved);
    };

    // Calculate duplicate passwords for 'reused' quick filter
    const reusedPasswordSet = React.useMemo(() => {
        const counts = {};
        passwords.forEach(p => {
            if (p.password) {
                counts[p.password] = (counts[p.password] || 0) + 1;
            }
        });
        const duplicates = new Set();
        Object.entries(counts).forEach(([pw, c]) => {
            if (c > 1) duplicates.add(pw);
        });
        return duplicates;
    }, [passwords]);

    // Filter Passwords
    const filtered = React.useMemo(() => {
        return passwords.filter(p => {
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                (p.title || '').toLowerCase().includes(term) ||
                (p.username || '').toLowerCase().includes(term) ||
                (p.url || '').toLowerCase().includes(term) ||
                (p.notes || '').toLowerCase().includes(term);

            if (!matchesSearch) return false;

            // Category filter
            if (selectedCategory !== 'all') {
                const itemCat = p.category || 'other';
                if (itemCat !== selectedCategory) return false;
            }

            // Favorites filter
            if (showOnlyFavorites && !p.isFavorite) return false;

            // Quick filters from Stats
            if (quickFilter === 'weak') {
                const str = calculatePasswordStrength(p.password);
                if (str.level !== 'weak') return false;
            } else if (quickFilter === 'reused') {
                if (!p.password || !reusedPasswordSet.has(p.password)) return false;
            }

            return true;
        });
    }, [passwords, searchTerm, selectedCategory, showOnlyFavorites, quickFilter, reusedPasswordSet]);

    // Sort Filtered Passwords
    const sortedPasswords = React.useMemo(() => {
        const list = [...filtered];

        if (sortMode === 'az') {
            list.sort((a, b) => (a.title || '').localeCompare(b.title || '', lang));
        } else if (sortMode === 'za') {
            list.sort((a, b) => (b.title || '').localeCompare(a.title || '', lang));
        } else if (sortMode === 'newest') {
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else if (sortMode === 'oldest') {
            list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        } else if (sortMode === 'strength-desc') {
            list.sort((a, b) => {
                const sa = calculatePasswordStrength(a.password).score;
                const sb = calculatePasswordStrength(b.password).score;
                return sb - sa;
            });
        } else if (sortMode === 'strength-asc') {
            list.sort((a, b) => {
                const sa = calculatePasswordStrength(a.password).score;
                const sb = calculatePasswordStrength(b.password).score;
                return sa - sb;
            });
        }
        return list;
    }, [filtered, sortMode, lang]);

    // Option 15: Drag & Drop handlers
    const isDragEnabled = sortMode === 'custom' && selectedCategory === 'all' && !showOnlyFavorites && !searchTerm && !quickFilter;

    const handleDragStart = (e, index) => {
        if (!isDragEnabled) return;
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
    };

    const handleDragOver = (e, index) => {
        if (!isDragEnabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = (e, targetIndex) => {
        if (!isDragEnabled) return;
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === targetIndex) {
            setDraggedItemIndex(null);
            setDragOverIndex(null);
            return;
        }

        const newOrder = [...passwords];
        const [movedItem] = newOrder.splice(draggedItemIndex, 1);
        newOrder.splice(targetIndex, 0, movedItem);

        onSave(newOrder);
        setDraggedItemIndex(null);
        setDragOverIndex(null);
        showToast('Sıralama güncellendi.');
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
        setDragOverIndex(null);
    };

    const openModal = (item = null, viewMode = false) => {
        setIsViewMode(viewMode);
        setShowPasswordField(false);
        setBreachResult(null);
        if (item) {
            setEditingItem(item);
            setFormData({
                title: item.title || '',
                username: item.username || '',
                password: item.password || '',
                url: item.url || '',
                category: item.category || 'other',
                notes: item.notes || '',
                totpSecret: item.totpSecret || '',
                isFavorite: !!item.isFavorite
            });
        } else {
            setEditingItem(null);
            setFormData({
                title: '',
                username: '',
                password: '',
                url: '',
                category: selectedCategory !== 'all' ? selectedCategory : 'other',
                notes: '',
                totpSecret: '',
                isFavorite: false
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingItem(null);
        setDeleteItem(null);
        setIsViewMode(false);
        setShowPasswordField(false);
        setBreachResult(null);
    };

    const handleSaveEntry = (e) => {
        e.preventDefault();
        if (isViewMode) return;

        let newData;
        const now = Date.now();
        if (editingItem) {
            newData = passwords.map(p =>
                p.id === editingItem.id
                    ? { ...formData, id: editingItem.id, createdAt: editingItem.createdAt || now, updatedAt: now }
                    : p
            );
        } else {
            newData = [...passwords, { ...formData, id: uuidv4(), createdAt: now, updatedAt: now }];
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
        window.electronAPI.copyToClipboard(text);
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

    // Option 18: Check HIBP for the currently opened password in modal
    const handleCheckCurrentBreach = async () => {
        if (!formData.password) return;
        setIsCheckingBreach(true);
        setBreachResult(null);
        try {
            if (window.electronAPI && window.electronAPI.checkPwnedPassword) {
                const res = await window.electronAPI.checkPwnedPassword(formData.password);
                setBreachResult(res);
            }
        } catch (e) {
            console.error(e);
            setBreachResult({ error: e.message });
        } finally {
            setIsCheckingBreach(false);
        }
    };

    const getInitials = (title) => {
        if (!title) return '?';
        return title.charAt(0).toUpperCase();
    };

    // Get count for a category
    const getCategoryCount = (catKey) => {
        if (catKey === 'all') return passwords.length;
        return passwords.filter(p => (p.category || 'other') === catKey).length;
    };

    const favoritesCount = passwords.filter(p => p.isFavorite).length;

    if (!texts) return null;

    return (
        <div className="dashboard">
            <nav className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <img
                            src="./icon.png"
                            alt="Logo"
                            className="sidebar-app-logo"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.style.display = 'block';
                                }
                            }}
                        />
                        <div className="sidebar-fallback-logo" style={{ display: 'none' }}>
                            <ShieldLogo />
                        </div>
                    </div>
                    <h3>{texts.appTitle}</h3>
                </div>

                <div className="sidebar-menu">
                    <button
                        className={`menu-item ${activeTab === 'passwords' && !showOnlyFavorites ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab('passwords');
                            setShowOnlyFavorites(false);
                            setQuickFilter(null);
                        }}
                    >
                        <KeyIcon />
                        {texts.navPasswords}
                        <span className="menu-badge">{passwords.length}</span>
                    </button>

                    {/* Option 6: Favorites Sidebar Link */}
                    <button
                        className={`menu-item ${activeTab === 'passwords' && showOnlyFavorites ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab('passwords');
                            setShowOnlyFavorites(true);
                            setQuickFilter(null);
                        }}
                    >
                        <StarIcon filled={showOnlyFavorites} />
                        {texts.navFavorites}
                        <span className="menu-badge">{favoritesCount}</span>
                    </button>

                    {/* Option 13: Vault Stats Sidebar Link */}
                    <button
                        className={`menu-item ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        <StatsIcon />
                        {texts.navStats}
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

                {/* Option 5: Categories List in Sidebar */}
                {activeTab === 'passwords' && (
                    <div className="sidebar-categories">
                        <button
                            type="button"
                            className="sidebar-section-title sidebar-section-toggle"
                            onClick={toggleCategories}
                            aria-expanded={categoriesOpen}
                        >
                            <span>{texts.labelCategory}</span>
                            <ChevronIcon open={categoriesOpen} />
                        </button>
                        {categoriesOpen && (
                        <div className="category-list">
                            {CATEGORIES.map(cat => {
                                const count = getCategoryCount(cat.key);
                                const isSelected = selectedCategory === cat.key && !showOnlyFavorites;
                                return (
                                    <button
                                        key={cat.key}
                                        className={`category-item ${isSelected ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedCategory(cat.key);
                                            setShowOnlyFavorites(false);
                                            setQuickFilter(null);
                                        }}
                                    >
                                        <span className="category-icon">{cat.icon}</span>
                                        <span className="category-name">{texts[cat.labelKey] || cat.key}</span>
                                        <span className="category-count">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                        )}
                    </div>
                )}

                <div className="sidebar-footer">
                    <div className="sidebar-user-badge">
                        <div className="sidebar-user-avatar">
                            {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : '👤'}
                        </div>
                        <div className="sidebar-user-info">
                            <span className="sidebar-user-name" title={currentUser?.username}>
                                {currentUser?.username || texts.accountUsername || 'Kullanıcı'}
                            </span>
                            <span className="sidebar-user-sub">
                                {texts.currentUserBadge || 'Aktif Hesap'}
                            </span>
                        </div>
                    </div>
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

                            {/* Option 7: Sorting Selector */}
                            <div className="sort-selector-wrapper">
                                <label className="sort-label">{texts.sortLabel}:</label>
                                <select
                                    className="sort-select"
                                    value={sortMode}
                                    onChange={(e) => handleSortChange(e.target.value)}
                                >
                                    <option value="custom">{texts.sortCustom}</option>
                                    <option value="az">{texts.sortAZ}</option>
                                    <option value="za">{texts.sortZA}</option>
                                    <option value="newest">{texts.sortNewest}</option>
                                    <option value="oldest">{texts.sortOldest}</option>
                                    <option value="strength-desc">{texts.sortStrengthDesc}</option>
                                    <option value="strength-asc">{texts.sortStrengthAsc}</option>
                                </select>
                            </div>

                            <button className="btn-primary" onClick={() => openModal()} style={{ width: 'auto' }}>
                                <PlusIcon />
                                {texts.addNew}
                            </button>
                        </header>

                        {/* Quick Filter Alert Banner */}
                        {quickFilter && (
                            <div className="filter-alert-banner">
                                <span>
                                    {quickFilter === 'weak' ? 'Filtre: Yalnızca Zayıf Şifreler' : 'Filtre: Yalnızca Tekrar Eden Şifreler'}
                                </span>
                                <button className="btn-ghost" onClick={() => setQuickFilter(null)} style={{ padding: '2px 8px', fontSize: '0.78rem' }}>
                                    ✕ Filtreyi Temizle
                                </button>
                            </div>
                        )}

                        {/* Option 15: Drag hint banner */}
                        {isDragEnabled && sortedPasswords.length > 1 && (
                            <div className="drag-hint-banner">
                                <GripIcon />
                                <span>{texts.dragHint}</span>
                            </div>
                        )}

                        <div className="password-list">
                            {sortedPasswords.length === 0 ? (
                                <div className="empty-state">
                                    <VaultIcon />
                                    <p>{texts.noPasswords}</p>
                                </div>
                            ) : (
                                sortedPasswords.map((item, index) => {
                                    const strength = calculatePasswordStrength(item.password);
                                    const isDraggingThis = draggedItemIndex === index;
                                    const isDragOverThis = dragOverIndex === index;

                                    return (
                                        <div
                                            key={item.id}
                                            className={`password-item ${isDraggingThis ? 'is-dragging' : ''} ${isDragOverThis ? 'is-drag-over' : ''}`}
                                            draggable={isDragEnabled}
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onDragEnd={handleDragEnd}
                                        >
                                            {/* Drag Handle */}
                                            {isDragEnabled && (
                                                <div className="drag-handle" title={texts.dragHint}>
                                                    <GripIcon />
                                                </div>
                                            )}

                                            <div
                                                className="clickable-area"
                                                onClick={(e) => { e.stopPropagation(); openModal(item, true); }}
                                                title={texts.modalDetail}
                                            >
                                                <div className="item-avatar">
                                                    {getInitials(item.title)}
                                                </div>
                                                <div className="item-info">
                                                    <div className="item-title-row">
                                                        <h4>{item.title}</h4>

                                                        {/* Option 5: Category Badge */}
                                                        {item.category && item.category !== 'other' && (
                                                            <span className="category-pill">
                                                                {CATEGORIES.find(c => c.key === item.category)?.icon}{' '}
                                                                {texts[CATEGORIES.find(c => c.key === item.category)?.labelKey] || item.category}
                                                            </span>
                                                        )}

                                                        {/* Option 12: Password Strength Badge */}
                                                        <span
                                                            className={`strength-pill strength-${strength.level}`}
                                                            style={{
                                                                backgroundColor: `${strength.color}15`,
                                                                color: strength.color,
                                                                borderColor: `${strength.color}40`
                                                            }}
                                                            title={`Güvenlik Skoru: ${strength.score}/100`}
                                                        >
                                                            <span className="strength-dot" style={{ backgroundColor: strength.color }} />
                                                            {lang === 'tr' ? strength.labelTr : strength.labelEn}
                                                        </span>

                                                        {/* 2FA Badge */}
                                                        {item.totpSecret && isValidBase32(item.totpSecret) && (
                                                            <span className="totp-badge">{texts.totpBadge}</span>
                                                        )}
                                                    </div>
                                                    <span>{item.username || '-'}</span>
                                                </div>
                                            </div>

                                            <div className="item-actions">
                                                {/* Option 6: Star Icon Favorite Toggle */}
                                                <button
                                                    className={`btn-icon star-btn ${item.isFavorite ? 'is-fav' : ''}`}
                                                    onClick={(e) => handleToggleFavorite(e, item)}
                                                    title={item.isFavorite ? texts.favRemoved : texts.favAdded}
                                                >
                                                    <StarIcon filled={item.isFavorite} />
                                                </button>

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
                                    );
                                })
                            )}
                        </div>
                    </>
                )}

                {/* Option 13: Dashboard Statistics / Vault Health Tab */}
                {activeTab === 'stats' && (
                    <VaultStats
                        passwords={passwords}
                        onFilterBy={(filterType) => {
                            setActiveTab('passwords');
                            setQuickFilter(filterType);
                        }}
                        texts={texts}
                    />
                )}

                {activeTab === 'account' && (
                    <AccountSettings
                        currentUser={currentUser}
                        passwords={passwords}
                        onSave={onSave}
                        theme={theme}
                        toggleTheme={toggleTheme}
                        lang={lang}
                        setLang={setLang}
                        texts={texts}
                    />
                )}

                {activeTab === 'generator' && (
                    <div className="generator-page">
                        <PasswordGenerator texts={texts} />
                    </div>
                )}
            </main>

            {/* ADD / EDIT / DETAIL MODAL */}
            {showModal && (
                <Modal
                    title={isViewMode ? texts.modalDetail : (editingItem ? texts.modalEdit : texts.modalAdd)}
                    onClose={closeModal}
                >
                    <form onSubmit={handleSaveEntry}>
                        <div className="input-group">
                            <label className="input-label">{texts.labelTitle}</label>
                            <input
                                type="text"
                                placeholder={texts.titlePlaceholder}
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                required
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                            />
                        </div>

                        {/* Option 5: Category Selector in Modal */}
                        <div className="input-group">
                            <label className="input-label">{texts.labelCategory}</label>
                            {isViewMode ? (
                                <input
                                    type="text"
                                    value={
                                        (CATEGORIES.find(c => c.key === formData.category)?.icon || '📌') + ' ' +
                                        (texts[CATEGORIES.find(c => c.key === formData.category)?.labelKey] || formData.category || 'Diğer')
                                    }
                                    readOnly
                                    className="input-readonly"
                                />
                            ) : (
                                <select
                                    className="category-modal-select"
                                    value={formData.category || 'other'}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {CATEGORIES.filter(c => c.key !== 'all').map(cat => (
                                        <option key={cat.key} value={cat.key}>
                                            {cat.icon} {texts[cat.labelKey] || cat.key}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="input-group">
                            <label className="input-label">{texts.labelUsername}</label>
                            <input
                                type="text"
                                placeholder={texts.usernamePlaceholder}
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
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
                                type="text"
                                placeholder={texts.urlPlaceholder}
                                value={formData.url}
                                onChange={e => setFormData({ ...formData, url: e.target.value })}
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label className="input-label" style={{ margin: 0 }}>{texts.labelPassword}</label>
                                {formData.password && (
                                    <span
                                        className="strength-tag"
                                        style={{ color: calculatePasswordStrength(formData.password).color, fontSize: '0.78rem', fontWeight: 600 }}
                                    >
                                        ● {lang === 'tr' ? calculatePasswordStrength(formData.password).labelTr : calculatePasswordStrength(formData.password).labelEn}
                                    </span>
                                )}
                            </div>
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

                            {/* Option 18: Breach Check Button in View Mode */}
                            {isViewMode && formData.password && (
                                <div className="modal-pw-actions" style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                    <button type="button" className="btn-ghost" onClick={() => copyToClipboard(formData.password, texts.copiedPassword)} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <CopyIcon /> {texts.genCopy}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={handleCheckCurrentBreach}
                                        disabled={isCheckingBreach}
                                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <ShieldAlertIcon /> {isCheckingBreach ? texts.breachChecking : texts.checkBreachBtn}
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* Option 18: Breach Result Notification */}
                            {breachResult && (
                                <div className={`breach-alert-card ${breachResult.pwned || breachResult.error ? 'is-pwned' : 'is-safe'}`}>
                                    {breachResult.error ? (
                                        <>
                                            <ShieldAlertIcon />
                                            <span>{texts.breachCheckFailed}</span>
                                        </>
                                    ) : breachResult.pwned ? (
                                        <>
                                            <ShieldAlertIcon />
                                            <span>
                                                {texts.breachWarning.replace('{count}', breachResult.count.toLocaleString())}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckIcon />
                                            <span>{texts.breachSafe}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* TOTP 2FA Key Field */}
                        <div className="input-group">
                            <label className="input-label">{texts.totpSecret}</label>
                            <input
                                type="text"
                                placeholder={texts.totpSecretPlaceholder}
                                value={formData.totpSecret || ''}
                                onChange={e => setFormData({ ...formData, totpSecret: e.target.value.replace(/\s/g, '').toUpperCase() })}
                                readOnly={isViewMode}
                                className={isViewMode ? 'input-readonly' : ''}
                                autoComplete="off"
                                spellCheck="false"
                                style={{ fontFamily: "'Space Grotesk', monospace", letterSpacing: '1px' }}
                            />
                        </div>

                        {isViewMode && formData.totpSecret && (
                            <TotpDisplay secret={formData.totpSecret} texts={texts} />
                        )}

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

            {/* CONFIRM DELETE MODAL */}
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

            {/* TOAST NOTIFICATION */}
            {toast.show && (
                <div className="toast-notification">
                    <CheckIcon />
                    {toast.message}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
