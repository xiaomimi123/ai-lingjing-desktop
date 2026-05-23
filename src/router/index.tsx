// 路由表（Phase 17.2 重构）：
//
// /                       → /openclaw/chat（默认产品默认页）
// /onboarding             → onboarding 单独，跳过 AppLayout
// /openclaw/chat | tasks | tasks/:id | agents | skills | cron | channels
// /hermes/chat            → Hermes 唯一已实现的二级页
// /hermes/<anything-else> → redirect 到 /hermes/chat（v1.2 之前 placeholder）
// /account | /account/usage | /settings → 顶级共享
// /*                       → 404 PlaceholderPage

import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ChatPage } from '@/pages/chat/ChatPage'
import { TaskCenter } from '@/pages/tasks/TaskCenter'
import { TaskExecutionPage } from '@/pages/tasks/TaskExecutionPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { AccountPage } from '@/pages/account/AccountPage'
import { UsagePage } from '@/pages/account/UsagePage'
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage'
import { WelcomePage } from '@/pages/welcome/WelcomePage'
import { AgentList } from '@/pages/agents/AgentList'
import { SkillsPage } from '@/pages/skills/SkillsPage'
import { CronPage } from '@/pages/cron/CronPage'
import { ChannelsPage } from '@/pages/channels/ChannelsPage'
import { PaintPage } from '@/pages/paint/PaintPage'
import { PaintHistoryPage } from '@/pages/paint/PaintHistoryPage'
import { isWindowsPlatform } from '@/lib/platform'

export const router = createBrowserRouter([
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    path: '/welcome',
    element: <WelcomePage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // 默认跳 OpenClaw 主页
      { index: true, element: <Navigate to="/openclaw/chat" replace /> },

      // OpenClaw 二级页
      { path: 'openclaw', element: <Navigate to="/openclaw/chat" replace /> },
      { path: 'openclaw/chat', element: <ChatPage /> },
      { path: 'openclaw/tasks', element: <TaskCenter /> },
      { path: 'openclaw/tasks/:id', element: <TaskExecutionPage /> },
      { path: 'openclaw/agents', element: <AgentList /> },
      { path: 'openclaw/skills', element: <SkillsPage /> },
      { path: 'openclaw/cron', element: <CronPage /> },
      { path: 'openclaw/channels', element: <ChannelsPage /> },

      // Hermes 仅对话已接（其他 redirect 回 chat）。
      // Win 平台 v1 不支持 Hermes，三条规则全部 Navigate 到 /openclaw/chat，
      // 保护用户直接键入 URL 或 persisted product=hermes 时不进 ChatPage 拉 Hermes。
      // isWindowsPlatform() 在模块加载时跑一次（routerObject 构建时），运行时不变。
      { path: 'hermes', element: isWindowsPlatform() ? <Navigate to="/openclaw/chat" replace /> : <Navigate to="/hermes/chat" replace /> },
      { path: 'hermes/chat', element: isWindowsPlatform() ? <Navigate to="/openclaw/chat" replace /> : <ChatPage /> },
      { path: 'hermes/*', element: isWindowsPlatform() ? <Navigate to="/openclaw/chat" replace /> : <Navigate to="/hermes/chat" replace /> },

      // AI 绘画
      { path: 'paint', element: <Navigate to="/paint/text-to-image" replace /> },
      { path: 'paint/text-to-image', element: <PaintPage /> },
      { path: 'paint/history', element: <PaintHistoryPage /> },

      // 顶级共享
      { path: 'account', element: <AccountPage /> },
      { path: 'account/usage', element: <UsagePage /> },
      { path: 'settings', element: <SettingsPage /> },

      // 老 URL 向后兼容（v1.0 时期硬编码 /chat /agents 等）
      { path: 'chat', element: <Navigate to="/openclaw/chat" replace /> },
      { path: 'tasks', element: <Navigate to="/openclaw/tasks" replace /> },
      { path: 'agents', element: <Navigate to="/openclaw/agents" replace /> },
      { path: 'skills', element: <Navigate to="/openclaw/skills" replace /> },
      { path: 'cron', element: <Navigate to="/openclaw/cron" replace /> },
      { path: 'channels', element: <Navigate to="/openclaw/channels" replace /> },

      {
        path: '*',
        element: (
          <PlaceholderPage
            title="页面未找到"
            description="路径不存在或尚未接入"
          />
        ),
      },
    ],
  },
])
