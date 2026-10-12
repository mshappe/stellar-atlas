import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const apiTarget = environment.API_PROXY_TARGET ?? `http://127.0.0.1:${environment.PORT ?? '3000'}`
  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': apiTarget,
      },
    },
  }
})
