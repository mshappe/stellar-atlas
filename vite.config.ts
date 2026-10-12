import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(() => {
  const apiTarget = process.env.API_PROXY_TARGET ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}`
  return {
    envDir: false,
    plugins: [vue()],
    server: {
      proxy: {
        '/api': apiTarget,
      },
    },
  }
})
