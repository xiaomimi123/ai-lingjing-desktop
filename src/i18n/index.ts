// react-i18next 配置。复用 src-vue-backup 的翻译字典（zh-CN.ts、en-US.ts）。
// 默认 zh-CN，提供 en-US 兜底。Phase 4+ 可加 language detector。

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './messages/zh-CN'
import enUS from './messages/en-US'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN as Record<string, unknown> },
    'en-US': { translation: enUS as Record<string, unknown> },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n
