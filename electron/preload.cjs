const { contextBridge, ipcRenderer, safeStorage } = require('electron')

contextBridge.exposeInMainWorld('lingjing', {
  platform: process.platform,
  version: process.versions.electron,
  safeStorage: {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) =>
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(plain).toString('base64')
        : null,
    decrypt: (b64) => {
      if (!safeStorage.isEncryptionAvailable() || !b64) return null
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    },
  },
  /**
   * 用灵镜云端 API Token 自动配置本地两个 Gateway,让 OpenClaw / Hermes
   * 都走 api.aitoken.homes 云端,与"灵境云端"聊天共享同一余额。
   *
   * 入参:{ token: 'sk-xxx', baseUrl: 'https://api.aitoken.homes/v1' }
   * 出参:{ openclaw: 'ok'|'error'|'skipped', hermes: 'ok'|'error'|'skipped',
   *        message?: string }
   */
  configureLocalProviders: (params) =>
    ipcRenderer.invoke('lingjing:configure-local-providers', params),
  /**
   * 主进程绕过 CORS 直接拉 sk-xxx + 配 OpenClaw/Hermes(更可靠)。
   */
  autoConfigureViaMain: (params) =>
    ipcRenderer.invoke('lingjing:auto-configure-via-main', params),
  /**
   * 三方网关健康卡片用:返回本地 server / OpenClaw / Hermes 端口探活结果。
   */
  getGatewayStatus: () => ipcRenderer.invoke('lingjing:gateway-status'),
  /**
   * 网关挂了,UI 侧"重启"按钮调:which='openclaw'|'hermes'。
   */
  restartGateway: (which) => ipcRenderer.invoke('lingjing:gateway-restart', which),
  /**
   * 用户操作系统的默认浏览器打开 URL(只允许 http/https)。
   * 用在通信渠道教学链接、官方文档等场景。
   */
  openExternal: (url) => ipcRenderer.invoke('lingjing:open-external', url),
  /**
   * ClawHub 技能商城 —— 走 openclaw skills CLI 调用,Electron 主进程出锅。
   */
  skillsSearch: (params) => ipcRenderer.invoke('lingjing:skills-search', params),
  skillsInstall: (params) => ipcRenderer.invoke('lingjing:skills-install', params),
  skillsUninstall: (params) => ipcRenderer.invoke('lingjing:skills-uninstall', params),
  skillsInfo: (params) => ipcRenderer.invoke('lingjing:skills-info', params),
  /**
   * ClawHub URL 配置（Settings UI 用）。
   * 国内默认走 cn.clawhub-mirror.com 镜像；用户可改官方或自定义。
   */
  clawhubGetUrl: () => ipcRenderer.invoke('lingjing:clawhub-get-url'),
  clawhubSetUrl: (url) => ipcRenderer.invoke('lingjing:clawhub-set-url', { url }),
  clawhubPing: (urls) => ipcRenderer.invoke('lingjing:clawhub-ping', { urls }),
  /**
   * Bundled runtime（Phase 14.3+）。首启下载 Node + OpenClaw 到 userData/runtime/
   * runtimeStatus → 查当前状态（已装 / 缺）
   * runtimeEnsureNode → 触发下载 + 解压
   * runtimeOnProgress(cb) → 订阅进度事件流，返回 unsubscribe
   */
  runtimeStatus: () => ipcRenderer.invoke('lingjing:runtime-status'),
  runtimeEnsureNode: () => ipcRenderer.invoke('lingjing:runtime-ensure-node'),
  runtimeOnProgress: (cb) => {
    const listener = (_evt, payload) => cb(payload)
    ipcRenderer.on('lingjing:runtime-progress', listener)
    return () => ipcRenderer.off('lingjing:runtime-progress', listener)
  },
  /**
   * 系统原生文件/文件夹选择器，Phase 5 任务执行的路径参数用。
   * selectFile/selectFolder 返回 { ok, canceled, paths: string[] }；
   * saveFile 返回 { ok, canceled, path: string|null }。
   */
  selectFile: (opts) => ipcRenderer.invoke('lingjing:select-file', opts),
  selectFolder: (opts) => ipcRenderer.invoke('lingjing:select-folder', opts),
  saveFile: (opts) => ipcRenderer.invoke('lingjing:save-file', opts),
  /** 在 Finder/资源管理器中显示文件 */
  showInFolder: (path) => ipcRenderer.invoke('lingjing:show-in-folder', path),
  /** 读取 ~/.openclaw/ 下的文本文件（设置页用） */
  readTextFile: (path) => ipcRenderer.invoke('lingjing:read-text-file', path),
})
