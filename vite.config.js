import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom domain withcove.co — base is now '/'
export default defineConfig({
  plugins: [react()],
  base: '/',
});
