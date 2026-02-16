import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Ako u .env napišeš azure, koristit će azure link, inače localhost
  const targetUrl = env.VITE_BACKEND_TYPE === 'azure' 
    ? 'https://whiteboard1-fze2dkfwvgecfc.azurewebsites.net' 
    : 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        },
        '/sanctum': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
