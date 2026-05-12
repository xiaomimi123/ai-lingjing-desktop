// 包装 electron/preload.cjs 真实暴露的 window.lingjing 扁平 API。
// 浏览器环境（非 Electron）下 window.lingjing undefined，统一兜底为 noop / 默认值。
//
// 真实 API 列表见 lingjing-desktop/开发文档.md §2.4。
// 注意：preload 全部是 invoke/reply Promise，没有事件订阅 API。
// 事件订阅请用 useEventStream（EventSource 连 /api/events）。

import type {
  ConfigureLocalProvidersParams,
  ConfigureResult,
  AutoConfigureResult,
  GatewayStatus,
  RestartGatewayResult,
  SkillsSearchParams,
  SkillsInstallParams,
  SelectFileOptions,
  SelectFolderOptions,
  SaveFileOptions,
  SelectResult,
  SaveResult,
} from '@/types/electron'

const isElectron = typeof window !== 'undefined' && Boolean(window.lingjing)

function notInElectron<T>(fallback: T): T {
  if (!isElectron && typeof window !== 'undefined') {
    console.warn('[ipc] window.lingjing not available（浏览器环境）')
  }
  return fallback
}

export const ipc = {
  get isElectron() {
    return isElectron
  },

  get platform(): string {
    return window.lingjing?.platform ?? 'browser'
  },

  get version(): string {
    return window.lingjing?.version ?? ''
  },

  safeStorage: {
    isAvailable(): boolean {
      return window.lingjing?.safeStorage.isAvailable() ?? false
    },
    encrypt(plain: string): string | null {
      return window.lingjing?.safeStorage.encrypt(plain) ?? null
    },
    decrypt(b64: string): string | null {
      return window.lingjing?.safeStorage.decrypt(b64) ?? null
    },
  },

  configureLocalProviders(params: ConfigureLocalProvidersParams): Promise<ConfigureResult> {
    if (!window.lingjing) return Promise.resolve(notInElectron<ConfigureResult>({ openclaw: 'skipped', hermes: 'skipped' }))
    return window.lingjing.configureLocalProviders(params)
  },

  autoConfigureViaMain(params?: { modelId?: string }): Promise<AutoConfigureResult> {
    if (!window.lingjing) return Promise.resolve(notInElectron<AutoConfigureResult>({
      tokenSource: 'created',
      tokenSuffix: '',
      openclaw: 'skipped',
      hermes: 'skipped',
    }))
    return window.lingjing.autoConfigureViaMain(params)
  },

  getGatewayStatus(): Promise<GatewayStatus> {
    if (!window.lingjing) return Promise.resolve(notInElectron<GatewayStatus>({
      backend: { port: 0, alive: false },
      openclaw: { port: 0, alive: false },
      hermes: { port: 0, alive: false },
    }))
    return window.lingjing.getGatewayStatus()
  },

  restartGateway(which: 'openclaw' | 'hermes'): Promise<RestartGatewayResult> {
    if (!window.lingjing) return Promise.resolve(notInElectron<RestartGatewayResult>({ status: 'skipped', message: 'not in Electron' }))
    return window.lingjing.restartGateway(which)
  },

  openExternal(url: string): Promise<{ ok: boolean; message?: string }> {
    if (!window.lingjing) {
      // 浏览器环境：直接打开新标签页
      try { window.open(url, '_blank', 'noopener') } catch {}
      return Promise.resolve({ ok: true })
    }
    return window.lingjing.openExternal(url)
  },

  skillsSearch(params?: SkillsSearchParams) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.skillsSearch(params)
  },

  skillsInstall(params: SkillsInstallParams) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.skillsInstall(params)
  },

  skillsUninstall(params: { slug: string; force?: boolean }) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.skillsUninstall(params)
  },

  skillsInfo(params: { slug: string }) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, text: '', code: -1 }))
    return window.lingjing.skillsInfo(params)
  },

  clawhubGetUrl() {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, url: '', mirror: '' }))
    return window.lingjing.clawhubGetUrl()
  },

  clawhubSetUrl(url: string): Promise<{ ok: boolean; url?: string; message?: string }> {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.clawhubSetUrl(url)
  },

  clawhubPing(urls?: string[]) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, results: [] }))
    return window.lingjing.clawhubPing(urls)
  },

  runtimeStatus() {
    if (!window.lingjing) {
      return Promise.resolve(notInElectron({
        ok: false,
        targetNodeVersion: '',
        node: { ready: false, reason: 'not-in-electron' },
        runtimeRoot: '',
      }))
    }
    return window.lingjing.runtimeStatus()
  },

  runtimeEnsureNode() {
    if (!window.lingjing) {
      return Promise.resolve(notInElectron({ ok: false, error: 'not-in-electron' }))
    }
    return window.lingjing.runtimeEnsureNode()
  },

  runtimeOnProgress(cb: (p: unknown) => void): () => void {
    if (!window.lingjing) return () => {}
    return window.lingjing.runtimeOnProgress(cb as never)
  },

  selectFile(opts?: SelectFileOptions): Promise<SelectResult> {
    if (!window.lingjing) {
      // 浏览器环境兜底：用 <input type="file"> 弹原生选择器
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        if (opts?.multiSelect) input.multiple = true
        if (opts?.filters?.length) {
          input.accept = opts.filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',')
        }
        input.onchange = () => {
          const files = input.files ? Array.from(input.files) : []
          if (files.length === 0) resolve({ ok: false, canceled: true, paths: [] })
          // 浏览器没法拿到完整路径，只有 name
          else resolve({ ok: true, canceled: false, paths: files.map((f) => f.name) })
        }
        input.oncancel = () => resolve({ ok: false, canceled: true, paths: [] })
        input.click()
      })
    }
    return window.lingjing.selectFile(opts)
  },

  selectFolder(opts?: SelectFolderOptions): Promise<SelectResult> {
    if (!window.lingjing) return Promise.resolve(notInElectron<SelectResult>({ ok: false, canceled: true, paths: [] }))
    return window.lingjing.selectFolder(opts)
  },

  saveFile(opts?: SaveFileOptions): Promise<SaveResult> {
    if (!window.lingjing) return Promise.resolve(notInElectron<SaveResult>({ ok: false, canceled: true, path: null }))
    return window.lingjing.saveFile(opts)
  },

  showInFolder(filePath: string) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.showInFolder(filePath)
  },

  readTextFile(filePath: string) {
    if (!window.lingjing) return Promise.resolve(notInElectron({ ok: false, message: 'not in Electron' }))
    return window.lingjing.readTextFile(filePath)
  },
}

export type IPC = typeof ipc
