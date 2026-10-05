import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En GitHub Pages el sitio vive en /regatta/ ; en Vercel/Netlify usa BASE_PATH=/
export default defineConfig({
  base: process.env.BASE_PATH || '/regatta/',
  plugins: [react()],
});
