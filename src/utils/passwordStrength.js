/**
 * Password Strength Calculation & Analysis Utility
 */

export function calculatePasswordStrength(password) {
    if (!password) {
        return {
            score: 0,
            level: 'none',
            labelTr: 'Yok',
            labelEn: 'None',
            color: 'var(--text-muted)',
            criteria: {
                length: false,
                uppercase: false,
                lowercase: false,
                numbers: false,
                symbols: false
            }
        };
    }

    let score = 0;
    const len = password.length;

    // Criteria checks
    const criteria = {
        length: len >= 10,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        numbers: /[0-9]/.test(password),
        symbols: /[^A-Za-z0-9]/.test(password)
    };

    // Length score
    if (len >= 8) score += 20;
    if (len >= 12) score += 15;
    if (len >= 16) score += 15;

    // Character diversity
    if (criteria.uppercase) score += 10;
    if (criteria.lowercase) score += 10;
    if (criteria.numbers) score += 15;
    if (criteria.symbols) score += 15;

    // Bonus for variety
    const varietyCount = [criteria.uppercase, criteria.lowercase, criteria.numbers, criteria.symbols].filter(Boolean).length;
    if (varietyCount >= 3 && len >= 12) score += 5;

    // Clamp score
    score = Math.min(100, Math.max(0, score));

    if (score < 40) {
        return {
            score,
            level: 'weak',
            labelTr: 'Zayıf',
            labelEn: 'Weak',
            color: '#ef4444',
            criteria
        };
    } else if (score < 65) {
        return {
            score,
            level: 'fair',
            labelTr: 'Orta',
            labelEn: 'Fair',
            color: '#f59e0b',
            criteria
        };
    } else if (score < 85) {
        return {
            score,
            level: 'good',
            labelTr: 'İyi',
            labelEn: 'Good',
            color: '#3b82f6',
            criteria
        };
    } else {
        return {
            score,
            level: 'strong',
            labelTr: 'Güçlü',
            labelEn: 'Strong',
            color: '#10b981',
            criteria
        };
    }
}
