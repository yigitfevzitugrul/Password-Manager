// Choices offered in Settings for the automatic lock and the clipboard clearing
// 0 means "never" (allowed, but shown as not recommended)
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60, 0]; // minutes
export const CLIPBOARD_CLEAR_OPTIONS = [10, 30, 60, 120, 0]; // seconds

export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const DEFAULT_CLIPBOARD_CLEAR_SECONDS = 30;

function readChoice(key, options, fallback) {
    const stored = localStorage.getItem(key);
    if (stored === null || stored === '') return fallback;
    const value = Number(stored);
    return options.includes(value) ? value : fallback;
}

export const readAutoLockMinutes = () =>
    readChoice('auto_lock_minutes', AUTO_LOCK_OPTIONS, DEFAULT_AUTO_LOCK_MINUTES);

export const readClipboardClearSeconds = () =>
    readChoice('clipboard_clear_seconds', CLIPBOARD_CLEAR_OPTIONS, DEFAULT_CLIPBOARD_CLEAR_SECONDS);
