import { readFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig, loadEnv } from 'vite'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version?: string }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appVersion = packageJson.version || ''

  const backendPort = env.PORT || '3000'
  const frontendPort = env.DEV_PORT || '3001'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(String(frontendPort)),
      allowedHosts: true,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          // SSE 流式响应需要禁用缓冲
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache'
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          },
        },
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      // 拆 chunk：避免单 chunk > 500KB
      // 主要大头：i18n 翻译字典（240KB ×2）、react-syntax-highlighter（含所有语言）、
      // radix-ui 全家、react-markdown + remark-gfm、framer-motion、zustand 等
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // 顺序很关键：精细的优先匹配（refractor 必须先于 react，不然被 'react' 截胡）
              if (id.includes('react-syntax-highlighter') || id.includes('refractor') || id.includes('lowlight') || id.includes('prismjs')) {
                return 'syntax-highlighter'
              }
              if (id.includes('react-markdown') || id.includes('/remark') || id.includes('/rehype') || id.includes('/unified') || id.includes('/mdast') || id.includes('/hast') || id.includes('/micromark')) {
                return 'markdown'
              }
              if (id.includes('@radix-ui')) return 'radix'
              if (id.includes('framer-motion')) return 'framer-motion'
              if (id.includes('katex') || id.includes('markdown-it') || id.includes('highlight.js')) return 'tex-md'
              if (id.includes('axios')) return 'axios'
              if (id.includes('lucide-react')) return 'icons'
              if (id.includes('i18next')) return 'i18n'
              if (id.includes('zustand')) return 'zustand'
              if (id.includes('react-router')) return 'react-router'
              // react / react-dom 单独 vendor，注意要排除上面所有以 react- 开头的库
              if (id.match(/node_modules\/(react|react-dom|scheduler)[\\/]/)) return 'react-vendor'
              return 'vendor'
            }
            if (id.includes('/src/i18n/messages/')) return 'i18n-messages'
          },
        },
      },
    },
    define: {
      'import.meta.env.VITE_APP_TITLE': JSON.stringify(env.VITE_APP_TITLE || '灵境'),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
  }
})
