import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/claude': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: () => '/v1/messages',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Prefer user-provided key (from browser localStorage via header),
              // fall back to .env key
              const userKey = req.headers['x-user-api-key'] as string | undefined;
              const apiKey = userKey || env.ANTHROPIC_API_KEY || '';
              proxyReq.setHeader('x-api-key', apiKey)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
              proxyReq.setHeader('content-type', 'application/json')
              // Remove the user key header so it doesn't get forwarded
              proxyReq.removeHeader('x-user-api-key')
            })
          },
        },
      },
    },
  }
})
