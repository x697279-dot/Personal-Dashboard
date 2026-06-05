import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'my.xjydfy.fun' // 将你的域名加到这里
    ]
  }
})