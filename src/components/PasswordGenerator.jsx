import React, { useState } from 'react';

// Note: Update from function definition.
function PasswordGenerator({ onGenerate, texts }) {
    const [length, setLength] = useState(16);
    const [includeSymbols, setIncludeSymbols] = useState(true);
    const [includeNumbers, setIncludeNumbers] = useState(true);
    const [generated, setGenerated] = useState('');

    const [copySuccess, setCopySuccess] = useState(false);

    // Generate on mount and when options change
    React.useEffect(() => {
        generate();
    }, [length, includeSymbols, includeNumbers]);

    const generate = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums = '0123456789';
        const syms = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        let dictionary = chars;
        if (includeNumbers) dictionary += nums;
        if (includeSymbols) dictionary += syms;

        let result = '';
        for (let i = 0; i < length; i++) {
            result += dictionary.charAt(Math.floor(Math.random() * dictionary.length));
        }
        setGenerated(result);
        setCopySuccess(false); // Reset on new generation
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
                        value={length} onChange={e => setLength(parseInt(e.target.value))}
                    />
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
                    <button type="button" onClick={generate} className="btn-gen-refresh" title="Yenile">
                        ↻
                    </button>
                    <button type="button" onClick={handleCopy} className="btn-gen-use">
                        {onGenerate ? texts.genUse : texts.genCopy}
                    </button>
                </div>
                {copySuccess && <div className="copy-feedback">{texts.copied} ✅</div>}
            </div>
        </div>
    );
}

export default PasswordGenerator;
