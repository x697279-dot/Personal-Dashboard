import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 必须添加 base: './'，这能确保所有的静态资源引用都是相对路径
  base: './' 
})