import { defineConfig } from 'vite'

// Vite dev-server behind HTTPS reverse proxy (Caddy)
// - Allows access via your domain
// - Configures HMR to use secure WS through the proxy
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8100,
    // Allow your public domain to access the dev server through the reverse proxy
    allowedHosts: ['andry-sandbox.agilesolution.ru'],
    // Ensure HMR works over HTTPS when proxied by Caddy
    hmr: {
      host: 'andry-sandbox.agilesolution.ru',
      protocol: 'wss',
      // Use clientPort so Vite keeps listening locally, while browser connects via 443
      clientPort: 443,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 8100,
  },
})
