#!/usr/bin/env node
/**
 * 灵境桌面端发布脚本：构建 → 上传 R2 → 生成 latest.json → 上传 manifest。
 *
 * 用法：
 *   node scripts/release.mjs --platform mac
 *   node scripts/release.mjs --platform win
 *   node scripts/release.mjs --platform all
 *   node scripts/release.mjs --platform mac --skip-build      # 不重新构建
 *   node scripts/release.mjs --platform mac --notes "...内容..." # 写到 latest.json
 *   node scripts/release.mjs --platform mac --dry-run         # 不真实上传，只打印
 *
 * 环境：
 *   - 需 wrangler 已登录（`wrangler login`），或通过 npx wrangler 调用
 *   - .env 里 LINGJING_UPDATE_MANIFEST_URL 提供公开 URL 推导；或 --public-url 覆盖
 *   - .env 或 --bucket 指定 bucket，默认 lingjing-updates
 *
 * 产物匹配（electron-builder 默认 artifactName）：
 *   mac arm64 dmg : *-arm64.dmg                → key: darwin-arm64
 *   mac x64   dmg : *.dmg（无 arm64）          → key: darwin-x64
 *   win nsis  exe : *Setup*.exe                → key: win-x64
 *   win portable  : *portable*.exe             → key: win-x64-portable
 *
 * 不上传 *.blockmap、latest-mac.yml、*.zip（v1 不走 electron-updater，省 R2 流量）。
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

// ───────────── 参数解析 ─────────────
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : def
}
const flag = (name) => argv.includes(`--${name}`)

const platformArg = arg(
  'platform',
  process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null,
)
const skipBuild = flag('skip-build')
const dryRun = flag('dry-run')
const notes = arg('notes', '')
const bucketArg = arg('bucket')
const publicUrlArg = arg('public-url')

if (!['mac', 'win', 'all'].includes(platformArg)) {
  console.error('错误：--platform 必填，可选 mac / win / all')
  process.exit(1)
}

// ───────────── 读 package.json ─────────────
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version

// ───────────── 从 .env 推导 publicBase + bucket ─────────────
function readDotEnv() {
  const out = {}
  if (!existsSync('.env')) return out
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const env = readDotEnv()

let publicBase = publicUrlArg || process.env.R2_PUBLIC_BASE || ''
if (!publicBase && env.LINGJING_UPDATE_MANIFEST_URL) {
  publicBase = env.LINGJING_UPDATE_MANIFEST_URL.replace(/\/latest\.json$/, '')
}
publicBase = publicBase.replace(/\/$/, '')

const bucket = bucketArg || process.env.R2_BUCKET || 'lingjing-updates'

if (!publicBase) {
  console.error('错误：无法确定公开 URL。请：')
  console.error('  - 在 .env 设 LINGJING_UPDATE_MANIFEST_URL=https://pub-xxxxx.r2.dev/latest.json，或')
  console.error('  - 启动时传 --public-url https://pub-xxxxx.r2.dev')
  process.exit(1)
}

// ───────────── 检查 wrangler ─────────────
function hasWrangler() {
  try {
    execSync('wrangler --version', { stdio: 'ignore' })
    return 'wrangler'
  } catch {}
  try {
    execSync('npx --no-install wrangler --version', { stdio: 'ignore' })
    return 'npx --no-install wrangler'
  } catch {}
  return null
}
const wrangler = hasWrangler()
if (!wrangler && !dryRun) {
  console.error('错误：未找到 wrangler。请先：')
  console.error('  npm i -g wrangler   # 或 npm i -D wrangler')
  console.error('  wrangler login')
  process.exit(1)
}

// ───────────── 上传辅助 ─────────────
function upload(localPath, remoteKey) {
  const remote = `${bucket}/${remoteKey}`
  const cmd = `${wrangler || 'wrangler'} r2 object put "${remote}" --file="${localPath}" --remote`
  console.log(`  ↑ ${remoteKey}`)
  if (dryRun) {
    console.log(`    (dry-run) ${cmd}`)
    return
  }
  execSync(cmd, { stdio: 'inherit' })
}

// ───────────── 构建 ─────────────
const platforms = platformArg === 'all' ? ['mac', 'win'] : [platformArg]

if (!skipBuild) {
  for (const p of platforms) {
    console.log(`▶ 构建 ${p}…`)
    if (dryRun) {
      console.log(`  (dry-run) npm run dist:${p}`)
      continue
    }
    execSync(`npm run dist:${p}`, { stdio: 'inherit' })
  }
} else {
  console.log('▶ 跳过构建（--skip-build）')
}

// ───────────── 扫产物 ─────────────
const releaseDir = 'release'
if (!existsSync(releaseDir)) {
  console.error(`错误：${releaseDir}/ 不存在`)
  process.exit(1)
}
const files = readdirSync(releaseDir).filter((f) => {
  const p = join(releaseDir, f)
  return statSync(p).isFile()
})

const downloads = {} // platformKey → filename
for (const f of files) {
  if (/\.dmg$/.test(f) && !/\.blockmap$/.test(f)) {
    if (/-arm64\.dmg$/.test(f)) downloads['darwin-arm64'] = f
    else downloads['darwin-x64'] = f
  } else if (/\.exe$/.test(f) && !/\.blockmap$/.test(f)) {
    if (/portable/i.test(f)) downloads['win-x64-portable'] = f
    else downloads['win-x64'] = f
  }
  // 忽略 .blockmap / *.zip / latest-mac.yml — v1 不走 electron-updater
}

console.log('▶ 检测到产物：')
if (Object.keys(downloads).length === 0) {
  console.error('错误：release/ 里没有可发布的 .dmg / .exe')
  process.exit(1)
}
for (const [k, v] of Object.entries(downloads)) {
  console.log(`  ${k.padEnd(20)}  ${v}`)
}

// ───────────── 上传 ─────────────
console.log(`▶ 上传到 R2 bucket "${bucket}"…`)
const urls = {}
for (const [key, filename] of Object.entries(downloads)) {
  upload(join(releaseDir, filename), filename)
  urls[key] = `${publicBase}/${encodeURIComponent(filename)}`
}

// ───────────── 生成 latest.json ─────────────
const manifest = {
  version,
  releaseDate: new Date().toISOString().slice(0, 10),
  notes,
  downloads: urls,
}
const localManifestPath = join(releaseDir, 'latest.json')
writeFileSync(localManifestPath, JSON.stringify(manifest, null, 2))
console.log(`▶ 生成 ${localManifestPath}`)
console.log(JSON.stringify(manifest, null, 2))

upload(localManifestPath, 'latest.json')

// ───────────── 总结 ─────────────
console.log('\n✅ 发布完成')
console.log(`   版本     : ${version}`)
console.log(`   manifest : ${publicBase}/latest.json`)
for (const [k, u] of Object.entries(urls)) {
  console.log(`   ${k.padEnd(20)} : ${u}`)
}

if (dryRun) {
  console.log('\n（dry-run 模式：未实际上传任何文件）')
}
