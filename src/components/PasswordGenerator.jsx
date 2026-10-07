import React, { useState, useEffect, useMemo } from 'react';

// --- SVGs ---
const RefreshIcon = ({ isSpinning }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
            transform: isSpinning ? 'rotate(360deg)' : 'rotate(0deg)',
            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
    >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const ShieldCheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const DiceIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="4" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        <circle cx="16" cy="8" r="1.5" fill="currentColor" />
        <circle cx="8" cy="16" r="1.5" fill="currentColor" />
        <circle cx="16" cy="16" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

// Uniform random integer in [0, max) from the CSPRNG (rejection sampling, no modulo bias)
function secureRandomInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do {
        crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
}

function PasswordGenerator({ onGenerate, texts, isStandalone = false }) {
    const [length, setLength] = useState(20);
    const [includeUppercase, setIncludeUppercase] = useState(true);
    const [includeLowercase, setIncludeLowercase] = useState(true);
    const [includeNumbers, setIncludeNumbers] = useState(true);
    const [includeSymbols, setIncludeSymbols] = useState(true);
    const [excludeSimilar, setExcludeSimilar] = useState(false);

    const [generated, setGenerated] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [isSpinning, setIsSpinning] = useState(false);

    // Cryptographically secure generation
    const generate = () => {
        setIsSpinning(true);
        setTimeout(() => setIsSpinning(false), 400);

        let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let lower = 'abcdefghijklmnopqrstuvwxyz';
        let nums = '0123456789';
        let syms = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        if (excludeSimilar) {
            // Remove similar looking chars: i, l, 1, L, o, 0, O, I, |
            upper = upper.replace(/[IL1O0]/g, '');
            lower = lower.replace(/[il1o0]/g, '');
            nums = nums.replace(/[10]/g, '');
            syms = syms.replace(/[|]/g, '');
        }

        let dictionary = '';
        const guaranteed = [];

        if (includeUppercase && upper.length > 0) {
            dictionary += upper;
            guaranteed.push(upper[secureRandomInt(upper.length)]);
        }
        if (includeLowercase && lower.length > 0) {
            dictionary += lower;
            guaranteed.push(lower[secureRandomInt(lower.length)]);
        }
        if (includeNumbers && nums.length > 0) {
            dictionary += nums;
            guaranteed.push(nums[secureRandomInt(nums.length)]);
        }
        if (includeSymbols && syms.length > 0) {
            dictionary += syms;
            guaranteed.push(syms[secureRandomInt(syms.length)]);
        }

        // Fallback if user unchecks everything
        if (dictionary.length === 0) {
            dictionary = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        }

        const remainingLength = Math.max(0, length - guaranteed.length);
        let resultChars = [...guaranteed];
        for (let i = 0; i < remainingLength; i++) {
            resultChars.push(dictionary.charAt(secureRandomInt(dictionary.length)));
        }

        // Fisher-Yates shuffle
        for (let i = resultChars.length - 1; i > 0; i--) {
            const j = secureRandomInt(i + 1);
            [resultChars[i], resultChars[j]] = [resultChars[j], resultChars[i]];
        }

        const finalPassword = resultChars.join('');
        setGenerated(finalPassword);
        setCopySuccess(false);
    };

    // Regenerate on settings change
    useEffect(() => {
        generate();
    }, [length, includeUppercase, includeLowercase, includeNumbers, includeSymbols, excludeSimilar]);

    // Calculate Entropy & Strength
    const { entropyBits, strengthLabel, strengthColor, strengthPercent } = useMemo(() => {
        let pool = 0;
        if (includeUppercase) pool += 26;
        if (includeLowercase) pool += 26;
        if (includeNumbers) pool += 10;
        if (includeSymbols) pool += 28;
        if (pool === 0) pool = 62;

        const bits = Math.round(length * Math.log2(pool));

        let label = texts?.strengthWeak || 'Zayıf';
        let color = '#ef4444'; // Red
        let percent = 25;

        if (bits >= 110) {
            label = texts?.strengthVeryStrong || 'Maksimum Güvenlik';
            color = '#10b981'; // Emerald Green
            percent = 100;
        } else if (bits >= 80) {
            label = texts?.strengthStrong || 'Çok Güçlü';
            color = '#10b981';
            percent = 85;
        } else if (bits >= 55) {
            label = texts?.strengthGood || 'Güçlü';
            color = '#3b82f6'; // Blue
            percent = 65;
        } else if (bits >= 35) {
            label = texts?.strengthFair || 'Orta';
            color = '#f59e0b'; // Amber
            percent = 45;
        }

        return { entropyBits: bits, strengthLabel: label, strengthColor: color, strengthPercent: percent };
    }, [length, includeUppercase, includeLowercase, includeNumbers, includeSymbols, texts]);

    const handleCopy = () => {
        if (!generated) return;
        window.electronAPI.copyToClipboard(generated);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        if (onGenerate) onGenerate(generated);
    };

    // Preset Handlers
    const applyPreset = (presetType) => {
        if (presetType === 'balanced') {
            setLength(16);
            setIncludeUppercase(true);
            setIncludeLowercase(true);
            setIncludeNumbers(true);
            setIncludeSymbols(true);
            setExcludeSimilar(false);
        } else if (presetType === 'strong') {
            setLength(20);
            setIncludeUppercase(true);
            setIncludeLowercase(true);
            setIncludeNumbers(true);
            setIncludeSymbols(true);
            setExcludeSimilar(true);
        } else if (presetType === 'max') {
            setLength(32);
            setIncludeUppercase(true);
            setIncludeLowercase(true);
            setIncludeNumbers(true);
            setIncludeSymbols(true);
            setExcludeSimilar(false);
        } else if (presetType === 'pin') {
            setLength(6);
            setIncludeUppercase(false);
            setIncludeLowercase(false);
            setIncludeNumbers(true);
            setIncludeSymbols(false);
            setExcludeSimilar(false);
        }
    };

    // Formats password with syntax highlighting: Numbers in cyan, symbols in rose, letters in white/slate
    const renderColorCodedPassword = () => {
        if (!generated) return null;
        return generated.split('').map((char, index) => {
            let typeClass = 'pw-char-lower';
            if (/[A-Z]/.test(char)) typeClass = 'pw-char-upper';
            else if (/[0-9]/.test(char)) typeClass = 'pw-char-digit';
            else if (/[^A-Za-z0-9]/.test(char)) typeClass = 'pw-char-symbol';

            return (
                <span key={index} className={`pw-char ${typeClass}`}>
                    {char}
                </span>
            );
        });
    };

    if (!texts) return null;

    return (
        <div className={`modern-generator-root ${onGenerate ? 'generator-in-modal' : 'generator-standalone'}`}>
            {/* Header only shown in standalone tab */}
            {!onGenerate && (
                <div className="generator-header-block">
                    <div className="generator-title-row">
                        <div className="generator-title-icon">
                            <DiceIcon />
                        </div>
                        <div>
                            <h2>{texts.genTitle || 'Şifre Oluşturucu'}</h2>
                            <p className="generator-subtitle">
                                {texts.genSubtitle || 'Kriptografik olarak güvenli, kırılması imkânsız şifreler üretin.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* HERO PASSWORD DISPLAY BOX */}
            <div className="generator-hero-box">
                <div className="generator-display-container">
                    <div className="generator-output-scroller">
                        <div className="generator-output-text">
                            {renderColorCodedPassword()}
                        </div>
                    </div>

                    <div className="generator-hero-actions">
                        <button
                            type="button"
                            className="btn-hero-action btn-hero-refresh"
                            onClick={generate}
                            title={texts.genGenerate || 'Yenile'}
                        >
                            <RefreshIcon isSpinning={isSpinning} />
                        </button>

                        <button
                            type="button"
                            className={`btn-hero-action btn-hero-copy ${copySuccess ? 'is-copied' : ''}`}
                            onClick={handleCopy}
                            title={onGenerate ? texts.genUse : texts.genCopy}
                        >
                            {copySuccess ? <CheckIcon /> : <CopyIcon />}
                            <span>{copySuccess ? (texts.copied || 'Kopyalandı!') : (onGenerate ? (texts.genUse || 'Kullan') : (texts.genCopy || 'Kopyala'))}</span>
                        </button>
                    </div>
                </div>

                {/* STRENGTH & ENTROPY STATUS BAR */}
                <div className="generator-strength-bar-wrap">
                    <div className="strength-meta-row">
                        <div className="strength-badge-pill" style={{ color: strengthColor }}>
                            <ShieldCheckIcon />
                            <span>{strengthLabel}</span>
                        </div>
                        <div className="entropy-label">
                            {entropyBits} {texts.genEntropyBits || 'Bit Entropi'}
                        </div>
                    </div>
                    <div className="generator-progress-track">
                        <div
                            className="generator-progress-fill"
                            style={{
                                width: `${strengthPercent}%`,
                                backgroundColor: strengthColor,
                                boxShadow: `0 0 12px ${strengthColor}88`
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* PRESETS ROW (Fast 1-click configs) */}
            <div className="generator-presets-bar">
                <span className="presets-label">{texts.genOptions || 'Ön Ayarlar'}:</span>
                <div className="presets-pills">
                    <button
                        type="button"
                        className={`preset-pill ${length === 16 && includeSymbols && !excludeSimilar ? 'active' : ''}`}
                        onClick={() => applyPreset('balanced')}
                    >
                        ⚡ {texts.genPresetBalanced || 'Dengeli (16)'}
                    </button>
                    <button
                        type="button"
                        className={`preset-pill ${length === 20 && includeSymbols && excludeSimilar ? 'active' : ''}`}
                        onClick={() => applyPreset('strong')}
                    >
                        🛡️ {texts.genPresetStrong || 'Güçlü (20)'}
                    </button>
                    <button
                        type="button"
                        className={`preset-pill ${length === 32 ? 'active' : ''}`}
                        onClick={() => applyPreset('max')}
                    >
                        🔒 {texts.genPresetMax || 'Maksimum (32)'}
                    </button>
                    <button
                        type="button"
                        className={`preset-pill ${length === 6 && !includeUppercase && !includeSymbols ? 'active' : ''}`}
                        onClick={() => applyPreset('pin')}
                    >
                        🔢 {texts.genPresetPin || 'PIN (6)'}
                    </button>
                </div>
            </div>

            {/* CONFIGURATION PANEL */}
            <div className="generator-settings-card">
                {/* LENGTH SLIDER ROW */}
                <div className="generator-length-control">
                    <div className="slider-header-row">
                        <span className="control-title">{texts.genLength || 'Şifre Uzunluğu'}</span>
                        <div className="length-badge-counter">{length}</div>
                    </div>

                    <div className="slider-input-container">
                        <input
                            type="range"
                            min="6"
                            max="64"
                            value={length}
                            onChange={(e) => setLength(parseInt(e.target.value, 10) || 16)}
                            className="modern-range-slider"
                        />
                    </div>

                    {/* Quick length chips */}
                    <div className="length-chips-row">
                        {[8, 12, 16, 20, 24, 32, 48, 64].map((num) => (
                            <button
                                key={num}
                                type="button"
                                className={`length-chip ${length === num ? 'active' : ''}`}
                                onClick={() => setLength(num)}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* CHARACTER TYPES TOGGLE TILES */}
                <div className="char-toggles-grid">
                    <label className={`char-tile ${includeUppercase ? 'is-active' : ''}`}>
                        <div className="char-tile-left">
                            <span className="char-tile-sample">A-Z</span>
                            <span className="char-tile-text">{texts.genUppercase || 'Büyük Harf'}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={includeUppercase}
                            onChange={(e) => setIncludeUppercase(e.target.checked)}
                        />
                        <span className="custom-checkbox-indicator"></span>
                    </label>

                    <label className={`char-tile ${includeLowercase ? 'is-active' : ''}`}>
                        <div className="char-tile-left">
                            <span className="char-tile-sample">a-z</span>
                            <span className="char-tile-text">{texts.genLowercase || 'Küçük Harf'}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={includeLowercase}
                            onChange={(e) => setIncludeLowercase(e.target.checked)}
                        />
                        <span className="custom-checkbox-indicator"></span>
                    </label>

                    <label className={`char-tile ${includeNumbers ? 'is-active' : ''}`}>
                        <div className="char-tile-left">
                            <span className="char-tile-sample digit-sample">0-9</span>
                            <span className="char-tile-text">{texts.genNumbers || 'Rakamlar'}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={includeNumbers}
                            onChange={(e) => setIncludeNumbers(e.target.checked)}
                        />
                        <span className="custom-checkbox-indicator"></span>
                    </label>

                    <label className={`char-tile ${includeSymbols ? 'is-active' : ''}`}>
                        <div className="char-tile-left">
                            <span className="char-tile-sample symbol-sample">!@#</span>
                            <span className="char-tile-text">{texts.genSymbols || 'Semboller'}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={includeSymbols}
                            onChange={(e) => setIncludeSymbols(e.target.checked)}
                        />
                        <span className="custom-checkbox-indicator"></span>
                    </label>

                    <label className={`char-tile full-width-tile ${excludeSimilar ? 'is-active' : ''}`}>
                        <div className="char-tile-left">
                            <span className="char-tile-sample similar-sample">il1O0</span>
                            <span className="char-tile-text">{texts.genExcludeSimilar || 'Benzer Karakterleri Çıkar (i, l, 1, o, 0, O)'}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={excludeSimilar}
                            onChange={(e) => setExcludeSimilar(e.target.checked)}
                        />
                        <span className="custom-checkbox-indicator"></span>
                    </label>
                </div>
            </div>
        </div>
    );
}

export default PasswordGenerator;
