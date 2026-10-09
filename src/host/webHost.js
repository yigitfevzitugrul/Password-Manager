/**
 * Runs the vault service inside the page itself and offers it as `window.electronAPI`, the same
 * interface the Electron preload script gives the page on desktop. Used where there is no
 * Electron main process: the mobile app and a plain browser during development.
 */
import { createVaultService } from '../../shared/vaultService.js';
import { noblePrimitives } from '../../shared/noblePrimitives.js';
import { createMirroredStorage } from './mirroredStorage.js';
import { createIndexedDbBacking } from './indexedDbBacking.js';
import { createWebPlatform } from './webPlatform.js';

export async function installWebHost() {
    const storage = await createMirroredStorage(await createIndexedDbBacking(), {
        onError: (err) => console.error('Storage error:', err && err.message)
    });
    // Ask the browser not to evict the vault when it runs low on space
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    const host = createWebPlatform();
    // Inside the mobile app some services come from the device instead of the WebView
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        const { addNativeServices } = await import('./nativePlatform.js');
        addNativeServices(host.platform);
    }
    const vault = createVaultService({ primitives: noblePrimitives, storage, platform: host.platform });

    // As on desktop, where requests cross a process boundary: every call is asynchronous, and the
    // page and the service never share an object (neither can change the other's data by accident)
    const api = {};
    for (const [name, method] of Object.entries(vault.api)) {
        api[name] = async (...args) => structuredClone(await method(...structuredClone(args)));
    }
    const copied = (subscribe) => (callback) => subscribe(change => callback(structuredClone(change)));

    window.electronAPI = {
        ...api,
        onVaultLocked: host.onLocked,
        onVaultChanged: copied(host.onVaultChanged)
    };

    // Back in the foreground: changes from other devices should be there without waiting
    // (timers stand still while a phone keeps the app in the background)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') vault.syncSoon();
    });

    // Leaving the page locks the vault (the key only ever lives in memory)
    window.addEventListener('pagehide', () => vault.lock(false));
}
