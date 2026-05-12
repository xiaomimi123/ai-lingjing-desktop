import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n' // 触发 i18next 初始化
import App from './App'
import './index.css'

const rootEl = document.getElementById('app')
if (!rootEl) {
  throw new Error('未找到 #app 挂载节点（检查 index.html）')
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
