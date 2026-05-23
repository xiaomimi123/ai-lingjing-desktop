// 图标统一出口。底层从 lucide-react 切到 iconoir-react（更克制的手绘线条风）。
// 保留 lucide 命名作为对外名字，组件实现底层是 iconoir。整个 codebase 不需要逐
// 处改组件名，只把 import 来源换成 @/lib/icons 即可。

import type { ComponentType, SVGProps } from 'react'
import {
  Activity,
  Archive,
  ArrowLeft,
  Atom,
  BookmarkBook,
  Brain,
  Building,
  Calendar,
  ChatBubble,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Cloud,
  Code,
  CodeBrackets,
  Coins,
  Copy,
  Cpu,
  Database,
  Download,
  EditPencil,
  Filter,
  Flash,
  FloppyDisk,
  Folder,
  Gamepad,
  GitBranch,
  Globe,
  GraphUp,
  HalfMoon,
  Hashtag,
  Hexagon,
  InfoCircle,
  JournalPage,
  Key,
  Link,
  LogIn,
  LogOut,
  MagicWand,
  Mail,
  MediaImage,
  Message,
  MoreVert,
  MultiplePages,
  NavArrowDown,
  NavArrowRight,
  OpenNewWindow,
  Package,
  Page,
  PageEdit,
  PageSearch,
  Play,
  Plus,
  Refresh,
  Restart,
  Rocket,
  Search,
  SendDiagonal,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldXmark,
  Sparks,
  Square,
  SunLight,
  Table,
  TaskList,
  Terminal,
  Translate,
  Trash,
  User,
  WarningSquare,
  WarningTriangle,
  Wifi,
  WifiOff,
  Xmark,
  XmarkCircle,
} from 'iconoir-react'

/** 兼容 lucide-react 的 LucideIcon 类型，便于组件 prop / interface 直接迁移。 */
export type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>

// ─── 直接同名 ───
export {
  ArrowLeft,
  Archive,
  Brain,
  Check,
  Circle,
  Cloud,
  Coins,
  Copy,
  Cpu,
  Database,
  Download,
  GitBranch,
  Hexagon,
  LogIn,
  LogOut,
  MagicWand,
  Mail,
  MediaImage,
  OpenNewWindow,
  Package,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Square,
  Terminal,
  User,
}

// ─── 重命名映射（左 = lucide 风格名字，右 = iconoir 组件） ───
export const AlarmClock = Clock
export const AlertCircle = WarningSquare
export const AlertTriangle = WarningTriangle
export const BarChart3 = GraphUp
export const Bot = Atom
export const Braces = CodeBrackets
export const Building2 = Building
export const CalendarDays = Calendar
export const CheckCircle2 = CheckCircle
export const ChevronDown = NavArrowDown
export const ChevronRight = NavArrowRight
export const CircleAlert = WarningSquare
export const CircleX = XmarkCircle
export const Code2 = Code
export const ExternalLink = OpenNewWindow
export const FileEdit = PageEdit
export const Files = MultiplePages
export const FileSearch = PageSearch
export const FileSpreadsheet = Table
export const FileText = Page
export const FolderOpen = Folder
export const FolderTree = Folder
export const Gamepad2 = Gamepad
export const Gauge = Activity
export const Globe2 = Globe
export const Hash = Hashtag
export const ImageMinus = MediaImage
export const Inbox = Archive
export const Info = InfoCircle
export const KeyRound = Key
export const Languages = Translate
export const ListChecks = TaskList
export const ListTree = JournalPage
export const Loader2 = Refresh
export const MessageCircle = ChatBubble
export const MessageSquare = Message
export const MessagesSquare = ChatBubble
export const Moon = HalfMoon
export const MoreVertical = MoreVert
export const Notebook = BookmarkBook
export const Pencil = EditPencil
export const PenLine = EditPencil
export const Plug = Link
export const Power = Flash
export const RefreshCw = Refresh
export const RotateCcw = Restart
export const Save = FloppyDisk
export const Send = SendDiagonal
export const ShieldX = ShieldXmark
export const SlidersHorizontal = Filter
export const Sparkles = Sparks
export const Sun = SunLight
export const Trash2 = Trash
export const Unplug = WifiOff
export const X = Xmark
export const XCircle = XmarkCircle

// Wifi 顺带导出 — 部分页面用作连接指示
export { Wifi, WifiOff }
