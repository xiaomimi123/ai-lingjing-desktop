import { defineConfig, devices } from '@playwright/test'

/**
 * 灵境桌面应用 E2E 测试配置
 * 在已运行的 dev server (vite :3001) 上跑测试,假设 npm run electron:dev 已在跑。
 *
 * 认证策略:全套测试只调一次 /api/user/login(setup project),
 * cookie + localStorage 持久化进 playwright/.auth/user.json,
 * 后续所有 test 用 storageState 复用——避免云端 5 次/分钟登录限频。
 */
const STORAGE_STATE = 'playwright/.auth/user.json'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],
})
