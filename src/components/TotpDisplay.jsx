import React, { useState, useEffect, useRef } from 'react';
import { generateTOTP, getTimeRemaining, isValidBase32 } from '../utils/totp';

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

function TotpDisplay({ secret, texts }) {
    const [code, setCode] = useState('------');
    const [timeLeft, setTimeLeft] = useState(30);
    const [error, setError] = useState(false);
    const [copied, setCopied] = useState(false);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!secret || !isValidBase32(secret)) {
            setError(true);
            setCode('------');
            return;
        }

        setError(false);

        async function updateCode() {
            try {
                const newCode = await generateTOTP(secret);
                setCode(newCode);
                setTimeLeft(getTimeRemaining());
                setError(false);
            } catch (err) {
                console.error('TOTP generation error:', err);
                setError(true);
                setCode('------');
            }
        }

        // Generate immediately
        updateCode();

        // Update every second
        intervalRef.current = setInterval(() => {
            const remaining = getTimeRemaining();
            setTimeLeft(remaining);

            // Regenerate when the period resets
            if (remaining === 30 || remaining === 29) {
                updateCode();
            }
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [secret]);

    const handleCopy = () => {
        if (error || code === '------') return;
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Format code as "123 456"
    const formattedCode = code.length === 6
        ? `${code.substring(0, 3)} ${code.substring(3)}`
        : code;

    const progressPercent = (timeLeft / 30) * 100;
    const isUrgent = timeLeft <= 5;

    return (
        <div className="totp-display">
            <div className="totp-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="totp-icon">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="totp-label">{texts.totpCode || '2FA Doğrulama Kodu'}</span>
            </div>

            {error ? (
                <div className="totp-error">
                    {texts.totpInvalid || 'Geçersiz TOTP anahtarı'}
                </div>
            ) : (
                <>
                    <div className="totp-code-row">
                        <span className={`totp-code ${isUrgent ? 'totp-urgent' : ''}`}>
                            {formattedCode}
                        </span>
                        <button
                            type="button"
                            className="totp-copy-btn"
                            onClick={handleCopy}
                            title={texts.genCopy || 'Kopyala'}
                        >
                            {copied ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : (
                                <CopyIcon />
                            )}
                        </button>
                    </div>

                    <div className="totp-progress-container">
                        <div
                            className={`totp-progress-bar ${isUrgent ? 'totp-progress-urgent' : ''}`}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    <div className={`totp-timer ${isUrgent ? 'totp-timer-urgent' : ''}`}>
                        {timeLeft}{texts.totpSeconds || 's'}
                    </div>
                </>
            )}
        </div>
    );
}

export default TotpDisplay;
