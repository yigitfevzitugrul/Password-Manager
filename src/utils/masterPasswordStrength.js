/**
 * Master password strength estimation (zxcvbn): pattern, dictionary and keyboard-walk aware,
 * unlike a simple character-class check.
 */
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

export const MASTER_PASSWORD_MIN_LENGTH = 12;

// Guesses per second assumed for an offline attack on the vault file (scrypt slows each guess down)
const ATTACKER_GUESSES_PER_SECOND = 1e4;
// Below this many guesses (log10) a master password is refused
const MIN_ACCEPTABLE_GUESSES_LOG10 = 10;

const zxcvbn = new ZxcvbnFactory({
    dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
    graphs: zxcvbnCommon.adjacencyGraphs
});

const LEVELS = [
    { min: 14, level: 100, labelKey: 'strengthVeryStrong', color: '#10b981' },
    { min: 12, level: 80, labelKey: 'strengthStrong', color: '#10b981' },
    { min: MIN_ACCEPTABLE_GUESSES_LOG10, level: 60, labelKey: 'strengthGood', color: '#3b82f6' },
    { min: 8, level: 40, labelKey: 'strengthFair', color: '#f59e0b' },
    { min: -Infinity, level: 20, labelKey: 'strengthWeak', color: 'var(--danger)' }
];

const TIME_UNITS = [
    { seconds: 100 * 365 * 24 * 3600, key: 'crackCenturies' },
    { seconds: 365 * 24 * 3600, key: 'crackYears' },
    { seconds: 30 * 24 * 3600, key: 'crackMonths' },
    { seconds: 24 * 3600, key: 'crackDays' },
    { seconds: 3600, key: 'crackHours' },
    { seconds: 60, key: 'crackMinutes' }
];

function formatCrackTime(seconds, texts) {
    for (const unit of TIME_UNITS) {
        if (seconds >= unit.seconds) {
            if (unit.key === 'crackCenturies') return texts.crackCenturies;
            return texts[unit.key].replace('{n}', Math.floor(seconds / unit.seconds).toLocaleString());
        }
    }
    return texts.crackInstant;
}

/**
 * @param {string} password
 * @param {object} texts - translations
 * @param {string[]} userInputs - words an attacker would try first (name, app name...)
 */
export function evaluateMasterPassword(password, texts, userInputs = []) {
    if (!password) return null;

    const result = zxcvbn.check(password, [...userInputs.filter(Boolean), 'orenda', 'orendapass']);
    const band = LEVELS.find(l => result.guessesLog10 >= l.min);

    return {
        level: band.level,
        label: texts[band.labelKey],
        color: band.color,
        crackTime: formatCrackTime(result.guesses / ATTACKER_GUESSES_PER_SECOND, texts),
        acceptable: password.length >= MASTER_PASSWORD_MIN_LENGTH &&
            result.guessesLog10 >= MIN_ACCEPTABLE_GUESSES_LOG10
    };
}
