import React, { useState, useMemo } from 'react';
import { calculatePasswordStrength } from '../utils/passwordStrength';

const ShieldCheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const AlertTriangleIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const KeyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
);

const RefreshCwIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

function VaultStats({ passwords, onFilterBy, texts }) {
    const [scanningBreaches, setScanningBreaches] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [breachedItems, setBreachedItems] = useState(null);
    const [scanFailures, setScanFailures] = useState(0);

    // Compute Vault Statistics
    const stats = useMemo(() => {
        const total = passwords.length;
        if (total === 0) {
            return {
                total: 0,
                strongCount: 0,
                weakCount: 0,
                fairCount: 0,
                reusedCount: 0,
                twoFactorCount: 0,
                score: 100,
                reusedGroups: [],
                weakItems: []
            };
        }

        let strongCount = 0;
        let weakCount = 0;
        let fairCount = 0;
        let twoFactorCount = 0;
        const weakItems = [];

        // Track password frequencies
        const pwMap = new Map();

        passwords.forEach(p => {
            const str = calculatePasswordStrength(p.password);
            if (str.level === 'strong') strongCount++;
            else if (str.level === 'fair' || str.level === 'good') fairCount++;
            else {
                weakCount++;
                weakItems.push(p);
            }

            if (p.totpSecret) twoFactorCount++;

            if (p.password) {
                const existing = pwMap.get(p.password) || [];
                existing.push(p);
                pwMap.set(p.password, existing);
            }
        });

        // Reused passwords
        const reusedGroups = [];
        let reusedCount = 0;
        pwMap.forEach((items, pw) => {
            if (items.length > 1) {
                reusedGroups.push({ password: pw, count: items.length, items });
                reusedCount += items.length;
            }
        });

        // Calculate holistic security score (0 - 100)
        let score = Math.round(
            ((strongCount * 1.0 + fairCount * 0.6) / total) * 70 +
            (twoFactorCount / total) * 30 -
            (weakCount * 8) -
            (reusedCount * 10)
        );
        score = Math.max(12, Math.min(100, score));

        return {
            total,
            strongCount,
            weakCount,
            fairCount,
            reusedCount,
            twoFactorCount,
            score,
            reusedGroups,
            weakItems
        };
    }, [passwords]);

    // Batch scan all passwords with HIBP via Electron IPC
    const handleScanBreaches = async () => {
        if (!window.electronAPI || !window.electronAPI.checkPwnedPassword) return;
        setScanningBreaches(true);
        setScanProgress(0);
        setBreachedItems([]);
        setScanFailures(0);

        const results = [];
        let failures = 0;
        const uniquePasswords = Array.from(new Set(passwords.map(p => p.password).filter(Boolean)));
        const breachMap = new Map();

        for (let i = 0; i < uniquePasswords.length; i++) {
            const pw = uniquePasswords[i];
            try {
                const res = await window.electronAPI.checkPwnedPassword(pw);
                if (res.error) {
                    failures++;
                } else if (res.pwned) {
                    breachMap.set(pw, res.count);
                }
            } catch (e) {
                failures++;
            }
            setScanProgress(Math.round(((i + 1) / uniquePasswords.length) * 100));
        }

        passwords.forEach(p => {
            if (p.password && breachMap.has(p.password)) {
                results.push({
                    item: p,
                    count: breachMap.get(p.password)
                });
            }
        });

        setBreachedItems(results);
        setScanFailures(failures);
        setScanningBreaches(false);
    };

    const getScoreBadge = (score) => {
        if (score >= 85) return { grade: 'A', text: 'Çok Güvenli', color: '#10b981' };
        if (score >= 70) return { grade: 'B', text: 'İyi', color: '#3b82f6' };
        if (score >= 50) return { grade: 'C', text: 'Orta', color: '#f59e0b' };
        return { grade: 'D', text: 'Dikkat Edilmeli', color: '#ef4444' };
    };

    const scoreBadge = getScoreBadge(stats.score);

    return (
        <div className="vault-stats-container">
            <div className="stats-header">
                <h2>{texts.statsTitle}</h2>
            </div>

            {/* Score Overview Banner */}
            <div className="stats-overview-card">
                <div className="score-circle-wrapper">
                    <div
                        className="score-circle"
                        style={{
                            background: `conic-gradient(${scoreBadge.color} ${stats.score * 3.6}deg, var(--border) 0deg)`
                        }}
                    >
                        <div className="score-inner">
                            <span className="score-number">{stats.score}</span>
                            <span className="score-max">/100</span>
                        </div>
                    </div>
                </div>
                <div className="score-details">
                    <div className="score-badge" style={{ background: `${scoreBadge.color}20`, color: scoreBadge.color }}>
                        {scoreBadge.grade} • {scoreBadge.text}
                    </div>
                    <h3>{texts.statsOverallScore}</h3>
                    <p>
                        {stats.score >= 80
                            ? 'Kasanız genel olarak oldukça güçlü ve güvenli şifrelerle korunuyor.'
                            : 'Zayıf veya tekrar eden şifrelerinizi güncelleyerek kasanızın güvenliğini artırabilirsiniz.'}
                    </p>
                </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                        <KeyIcon />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-value">{stats.total}</span>
                        <span className="stat-label">{texts.statsTotal}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                        <ShieldCheckIcon />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-value">{stats.strongCount}</span>
                        <span className="stat-label">{texts.statsStrong}</span>
                    </div>
                </div>

                <div className="stat-card stat-card-clickable" onClick={() => onFilterBy && onFilterBy('weak')}>
                    <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
                        <AlertTriangleIcon />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-value" style={{ color: stats.weakCount > 0 ? '#ef4444' : 'inherit' }}>
                            {stats.weakCount}
                        </span>
                        <span className="stat-label">{texts.statsWeak}</span>
                    </div>
                </div>

                <div className="stat-card stat-card-clickable" onClick={() => onFilterBy && onFilterBy('reused')}>
                    <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                        <CopyIcon />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-value" style={{ color: stats.reusedCount > 0 ? '#f59e0b' : 'inherit' }}>
                            {stats.reusedCount}
                        </span>
                        <span className="stat-label">{texts.statsReused}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                        <ShieldCheckIcon />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-value">{stats.twoFactorCount}</span>
                        <span className="stat-label">{texts.stats2FA}</span>
                    </div>
                </div>
            </div>

            {/* Reused Passwords Warning Section */}
            {stats.reusedGroups.length > 0 && (
                <div className="stats-section-card">
                    <div className="section-title-row">
                        <div className="section-title-icon" style={{ color: '#f59e0b' }}>
                            <AlertTriangleIcon />
                        </div>
                        <div>
                            <h4>{texts.statsReusedTitle}</h4>
                            <p className="section-subtitle">{texts.statsReusedWarning}</p>
                        </div>
                    </div>
                    <div className="reused-groups-list">
                        {stats.reusedGroups.map((group, idx) => (
                            <div key={idx} className="reused-group-item">
                                <div className="reused-group-badge">
                                    {group.count} hesapta ortak
                                </div>
                                <div className="reused-group-names">
                                    {group.items.map(item => item.title).join(' • ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* HIBP Breach Scanner Section (Option 18 full vault scan) */}
            <div className="stats-section-card">
                <div className="section-title-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className="section-title-icon" style={{ color: '#ef4444' }}>
                            <ShieldCheckIcon />
                        </div>
                        <div>
                            <h4>Have I Been Pwned Sızıntı Taraması</h4>
                            <p className="section-subtitle">
                                Kasanızdaki şifreleri k-Anonymity (SHA-1) ile güvenli bir şekilde bilinen veri ihlallerine karşı tarayın.
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={handleScanBreaches}
                        disabled={scanningBreaches || stats.total === 0}
                        style={{ width: 'auto', padding: '9px 18px', whiteSpace: 'nowrap' }}
                    >
                        {scanningBreaches ? (
                            <>
                                <span className="spinner-small" />
                                {texts.statsScanning} ({scanProgress}%)
                            </>
                        ) : (
                            <>
                                <RefreshCwIcon />
                                {texts.statsScanBreaches}
                            </>
                        )}
                    </button>
                </div>

                {scanningBreaches && (
                    <div className="scan-progress-bar-container">
                        <div className="scan-progress-bar" style={{ width: `${scanProgress}%` }} />
                    </div>
                )}

                {breachedItems !== null && !scanningBreaches && (
                    <div className="breach-results-box">
                        {scanFailures > 0 && (
                            <div className="breach-danger-banner">
                                <AlertTriangleIcon />
                                <span>{texts.statsScanIncomplete.replace('{count}', scanFailures)}</span>
                            </div>
                        )}
                        {breachedItems.length === 0 ? (
                            scanFailures > 0 ? null :
                            <div className="breach-safe-banner">
                                <ShieldCheckIcon />
                                <span>{texts.statsNoBreaches}</span>
                            </div>
                        ) : (
                            <div className="breach-found-wrapper">
                                <div className="breach-danger-banner">
                                    <AlertTriangleIcon />
                                    <span>
                                        {breachedItems.length} adet şifreniz bilinen veri sızıntılarında bulundu!
                                    </span>
                                </div>
                                <div className="breached-items-list">
                                    {breachedItems.map((entry, idx) => (
                                        <div key={idx} className="breached-item-row">
                                            <div className="breached-item-info">
                                                <strong>{entry.item.title}</strong>
                                                <span>{entry.item.username}</span>
                                            </div>
                                            <div className="breached-item-badge">
                                                {entry.count.toLocaleString()} kez sızmış
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default VaultStats;
