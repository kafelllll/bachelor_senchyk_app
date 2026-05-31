import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_APP_BASE_URL ?? '/';

  return {
    base,
    plugins: [react()],
    server: {
      proxy: {
        '/api/plantnet': {
          target: 'https://my-api.plantnet.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/plantnet/, ''),
        },
      },
    },
  };
});
