import React, { useState } from 'react';

function PasswordGenerator({ onGenerate, texts }) {
    const [length, setLength] = useState(16);
    const [includeUppercase, setIncludeUppercase] = useState(true);
    const [includeLowercase, setIncludeLowercase] = useState(true);
    const [includeSymbols, setIncludeSymbols] = useState(true);
    const [includeNumbers, setIncludeNumbers] = useState(true);
    const [generated, setGenerated] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

    // Generate on mount and when options change
    React.useEffect(() => {
        generate();
    }, [length, includeUppercase, includeLowercase, includeSymbols, includeNumbers]);

    const generate = () => {
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const nums = '0123456789';
        const syms = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        let dictionary = '';
        if (includeUppercase) dictionary += upper;
        if (includeLowercase) dictionary += lower;
        if (includeNumbers) dictionary += nums;
        if (includeSymbols) dictionary += syms;

        if (dictionary.length === 0) {
            dictionary = lower + upper;
        }

        // Use cryptographically secure random number generator
        const array = new Uint32Array(length);
        crypto.getRandomValues(array);

        let result = '';
        for (let i = 0; i < length; i++) {
            result += dictionary.charAt(array[i] % dictionary.length);
        }
        setGenerated(result);
        setCopySuccess(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generated);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        if (onGenerate) onGenerate(generated);
    };

    // Safety check
    if (!texts) return null;

    return (
        <div className="generator-section">
            <h4>{texts.genTitle}</h4>
            <div className="generator-controls">
                <div className="control-row">
                    <label>{texts.genLength}: {length}</label>
                    <input
                        type="range" min="8" max="64"
                        value={length} onChange={e => setLength(parseInt(e.target.value, 10) || 16)}
                    />
                </div>
                <div className="checkbox-row">
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={includeUppercase} onChange={e => setIncludeUppercase(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">{texts.genUppercase}</span>
                    </label>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={includeLowercase} onChange={e => setIncludeLowercase(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">{texts.genLowercase}</span>
                    </label>
                </div>
                <div className="checkbox-row">
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={includeNumbers} onChange={e => setIncludeNumbers(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">{texts.genNumbers}</span>
                    </label>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={includeSymbols} onChange={e => setIncludeSymbols(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">{texts.genSymbols}</span>
                    </label>
                </div>
            </div>

            <div className="generated-result">
                <div className="generated-password-display">
                    {generated}
                </div>
                <div className="gen-actions">
                    <button type="button" onClick={generate} className="btn-gen-refresh" title={texts.genGenerate}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                    </button>
                    <button type="button" onClick={handleCopy} className="btn-gen-use">
                        {onGenerate ? texts.genUse : texts.genCopy}
                    </button>
                </div>
                {copySuccess && <div className="copy-feedback">{texts.copied} ✓</div>}
            </div>
        </div>
    );
}

export default PasswordGenerator;
