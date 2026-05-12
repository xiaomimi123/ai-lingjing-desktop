// electron/preload.cjs 通过 contextBridge.exposeInMainWorld('lingjing', ...) 暴露的真实接口。
// 已在 lingjing-desktop/开发文档.md §2.4 列出。这里仅做 TypeScript 类型映射。

export interface ConfigureLocalProvidersParams {
  token: string
  baseUrl?: string
  modelId?: string
  providerId?: string
  compat?: string
  skipHermes?: boolean
}

export interface ConfigureResult {
  openclaw: 'ok' | 'error' | 'skipped'
  hermes: 'ok' | 'error' | 'skipped'
  openclawMessage?: string
  hermesMessage?: string
}

export interface AutoConfigureResult extends ConfigureResult {
  tokenSource: 'reused' | 'reused-other' | 'created'
  tokenSuffix: string
}

export interface GatewayStatus {
  backend: { port: number; alive: boolean }
  openclaw: { port: number; alive: boolean }
  hermes: { port: number; alive: boolean }
}

export interface RestartGatewayResult {
  status: 'started' | 'already-running' | 'error' | 'skipped' | 'started-but-not-listening'
  port?: number
  message?: string
}

export interface SkillsSearchParams {
  query?: string
  limit?: number
}

export interface SkillsInstallParams {
  slug: string
  force?: boolean
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface SelectFileOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
  multiSelect?: boolean
  showHidden?: boolean
}

export interface SelectFolderOptions {
  title?: string
  defaultPath?: string
  multiSelect?: boolean
}

export interface SaveFileOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

export interface SelectResult {
  ok: boolean
  canceled: boolean
  paths: string[]
}

export interface SaveResult {
  ok: boolean
  canceled: boolean
  path: string | null
}

export interface LingjingPreload {
  platform: string
  version: string
  safeStorage: {
    isAvailable(): boolean
    encrypt(plain: string): string | null
    decrypt(b64: string): string | null
  }
  configureLocalProviders(params: ConfigureLocalProvidersParams): Promise<ConfigureResult>
  autoConfigureViaMain(params?: { modelId?: string }): Promise<AutoConfigureResult>
  getGatewayStatus(): Promise<GatewayStatus>
  restartGateway(which: 'openclaw' | 'hermes'): Promise<RestartGatewayResult>
  openExternal(url: string): Promise<{ ok: boolean; message?: string }>
  skillsSearch(params?: SkillsSearchParams): Promise<{ ok: boolean; results?: unknown[]; message?: string; clawhubUrl?: string }>
  skillsInstall(params: SkillsInstallParams): Promise<{ ok: boolean; stdout?: string; message?: string }>
  skillsUninstall(params: { slug: string; force?: boolean }): Promise<{ ok: boolean; stdout?: string; message?: string }>
  skillsInfo(params: { slug: string }): Promise<{ ok: boolean; text: string; code: number }>
  clawhubGetUrl(): Promise<{ ok: boolean; url: string; mirror: string }>
  clawhubSetUrl(url: string): Promise<{ ok: boolean; url?: string; message?: string }>
  clawhubPing(urls?: string[]): Promise<{ ok: boolean; results: Array<{ url: string; ok: boolean; status?: number; ms: number; message?: string }> }>
  runtimeStatus(): Promise<{
    ok: boolean
    targetNodeVersion: string
    node: { ready: boolean; version?: string; path?: string; reason?: string; error?: string }
    openclaw: { ready: boolean; version?: string; path?: string; reason?: string; error?: string }
    system: { nodePath: string | null; openclawPath: string | null; detected: boolean }
    needsSetup: boolean
    runtimeRoot: string
  }>
  runtimeEnsureNode(): Promise<{
    ok: boolean
    cached?: boolean
    version?: string
    path?: string
    error?: string
    message?: string
  }>
  runtimeEnsureOpenClaw(): Promise<{
    ok: boolean
    cached?: boolean
    version?: string
    path?: string
    error?: string
    message?: string
  }>
  runtimeOnProgress(cb: (progress: RuntimeProgress) => void): () => void
  selectFile(opts?: SelectFileOptions): Promise<SelectResult>
  selectFolder(opts?: SelectFolderOptions): Promise<SelectResult>
  saveFile(opts?: SaveFileOptions): Promise<SaveResult>
  showInFolder(path: string): Promise<{ ok: boolean; message?: string }>
  readTextFile(path: string): Promise<{ ok: boolean; content?: string; message?: string }>
}

export interface RuntimeProgress {
  component: 'node' | 'openclaw'
  stage:
    | 'check'
    | 'download'
    | 'download-failed'
    | 'extract'
    | 'install'
    | 'install-failed'
    | 'verify'
    | 'done'
    | 'error'
  source?: string
  url?: string
  registry?: string
  percent?: number
  downloaded?: number
  total?: number
  speedBytesPerSec?: number
  filename?: string
  line?: string
  cached?: boolean
  version?: string
  error?: string
}

declare global {
  interface Window {
    lingjing: LingjingPreload
  }
}

export {}
