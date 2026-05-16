import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path must match your GitHub repo name for GH Pages
export default defineConfig({
  plugins: [react()],
  base: '/Cove/',
});
