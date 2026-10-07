import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// The dev server needs inline/eval scripts for HMR; the packaged app must not allow them.
const strictCsp = () => ({
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml(html) {
        return html.replace(
            /(<meta http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
            "$1default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'$2"
        )
    }
})

export default defineConfig({
    plugins: [react(), strictCsp()],
    base: './',
    server: {
        port: 5173,
        strictPort: true,
    }
})
