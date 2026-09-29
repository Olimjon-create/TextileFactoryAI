import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Kutubxonalar alohida bo'laklarda: kamdan-kam o'zgaradi, brauzer keshida qoladi
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          'mui-icons': ['@mui/icons-material'],
        },
      },
    },
  },
  server: {
    // 5173 boshqa loyihalar bilan to'qnashmasligi uchun alohida port.
    // strictPort: port band bo'lsa jimgina boshqasiga o'tib ketmasdan xato beradi.
    port: 5180,
    strictPort: true,
    // /api so'rovlari backendga yo'naltiriladi (CORS muammosiz).
    // Backend boshqa portda bo'lsa: set API_PROXY_TARGET=http://localhost:8002
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8001',
      // Yuklangan rasmlar (zavod logolari, mahsulot rasmlari)
      '/media': process.env.API_PROXY_TARGET || 'http://localhost:8001',
    },
  },
});
