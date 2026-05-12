// 路由表。v1 范围按 PRD §5.7 + §5.8 简化版（核心区 4 + 底部 2）。
// /onboarding 是独立路由（不在 AppLayout 内），跳过侧栏。

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
import { AgentList } from '@/pages/agents/AgentList'
import { SkillsPage } from '@/pages/skills/SkillsPage'
import { CronPage } from '@/pages/cron/CronPage'
import { ChannelsPage } from '@/pages/channels/ChannelsPage'

export const router = createBrowserRouter([
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'tasks', element: <TaskCenter /> },
      { path: 'tasks/:id', element: <TaskExecutionPage /> },
      { path: 'agents', element: <AgentList /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'cron', element: <CronPage /> },
      { path: 'channels', element: <ChannelsPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'account/usage', element: <UsagePage /> },
      { path: 'settings', element: <SettingsPage /> },
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
