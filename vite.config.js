import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// On desktop every request goes through the main process; the mobile app's page makes them itself.
const MOBILE_CONNECT_SRC = 'https://api.pwnedpasswords.com https://api.github.com'

// https://vitejs.dev/config/
// The dev server needs inline/eval scripts for HMR; the packaged app must not allow them.
const strictCsp = (connectSrc) => ({
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml(html) {
        return html.replace(
            /(<meta http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
            `$1default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src ${connectSrc}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'$2`
        )
    }
})

export default defineConfig(({ mode }) => ({
    plugins: [react(), strictCsp(mode === 'mobile' ? MOBILE_CONNECT_SRC : "'none'")],
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(version)
    },
    server: {
        port: 5173,
        strictPort: true,
    }
}))
