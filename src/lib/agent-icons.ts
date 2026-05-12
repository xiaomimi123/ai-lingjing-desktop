// Agent ID → lucide icon 映射。统一前端 Agent 卡片视觉，不再用 emoji。
//
// 灵境内置 6 个 + 市场 6 个 + 用户自装。映射不到的走兜底 Bot。

import {
  Sparkles,
  FolderOpen,
  FileText,
  BarChart3,
  PenLine,
  Code2,
  Bot,
  Languages,
  CalendarDays,
  Notebook,
  Mail,
  ImageMinus,
  GitBranch,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  // 系统内置
  lingjing: Sparkles,
  'file-butler': FolderOpen,
  'doc-expert': FileText,
  'data-analyst': BarChart3,
  writer: PenLine,
  coder: Code2,
  // 市场
  translator: Languages,
  'daily-summary': CalendarDays,
  'meeting-notes': Notebook,
  'mail-helper': Mail,
  'screenshot-cleaner': ImageMinus,
  'repo-explainer': GitBranch,
}

export function getAgentIcon(agentId?: string): LucideIcon {
  if (!agentId) return Bot
  return ICON_MAP[agentId] ?? Bot
}
