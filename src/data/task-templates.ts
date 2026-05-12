// v1 预置任务模板。每个模板把高层用户意图编译成 OpenClaw Agent prompt。
// Agent 拿到 prompt 后会决定调哪些工具（exec/files/http），事件流会推 item/tool/command_output。
//
// 安全等级（safetyLevel）只是 UI 警示，真正的隔离靠 OpenClaw sandbox/blocklist。

import { z } from 'zod'
import {
  FolderTree,
  FileEdit,
  Files,
  FileSpreadsheet,
  FileText,
  ListTree,
  Archive,
  Code2,
  Braces,
  Save,
  type LucideIcon,
} from '@/lib/icons'

export type SafetyLevel = 'safe' | 'caution' | 'danger'

export interface TaskTemplate<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string
  name: string
  description: string
  icon: LucideIcon
  safetyLevel: SafetyLevel
  /** Zod schema for user-supplied params */
  paramsSchema: TSchema
  /** Build the OpenClaw prompt from validated params */
  buildPrompt: (params: z.infer<TSchema>) => string
}

// ============ 各模板 schema + prompt builder ============

const tidyDownloadsSchema = z.object({
  folder: z.string().min(1, '请提供目录路径'),
  groupBy: z.enum(['type', 'date']).default('type'),
})

const renameSchema = z.object({
  folder: z.string().min(1),
  pattern: z.string().min(1, '匹配模式不能为空'),
  replacement: z.string(),
  dryRun: z.boolean().default(true),
})

const csvMergeSchema = z.object({
  inputDir: z.string().min(1),
  output: z.string().min(1, '输出文件路径'),
  hasHeader: z.boolean().default(true),
})

const xlsxToCsvSchema = z.object({
  xlsx: z.string().min(1, 'xlsx 文件路径'),
  csv: z.string().min(1, '输出 csv 路径'),
  sheet: z.string().optional(),
})

const pdfExtractSchema = z.object({
  pdf: z.string().min(1, 'PDF 文件路径'),
  output: z.string().min(1, '输出 txt 或 md 路径'),
})

const listFilesSchema = z.object({
  folder: z.string().min(1),
  depth: z.number().int().min(1).max(5).default(2),
  includeHidden: z.boolean().default(false),
})

const archiveSchema = z.object({
  folder: z.string().min(1),
  output: z.string().min(1, '.tar.gz 路径'),
  excludeNodeModules: z.boolean().default(true),
})

const formatCodeSchema = z.object({
  folder: z.string().min(1),
  language: z.enum(['javascript', 'typescript', 'python', 'go', 'rust']),
})

const jsonPrettifySchema = z.object({
  input: z.string().min(1, '输入 JSON 文件'),
  output: z.string().min(1, '输出文件'),
  indent: z.number().int().min(0).max(8).default(2),
})

const backupSchema = z.object({
  source: z.string().min(1, '要备份的文件/目录'),
  backupDir: z.string().min(1, '备份存放目录'),
})

// ============ 10 个模板 ============

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tidy-downloads',
    name: '整理下载文件夹',
    description: '按文件类型或日期分类到子目录，原文件移动不复制',
    icon: FolderTree,
    safetyLevel: 'caution',
    paramsSchema: tidyDownloadsSchema,
    buildPrompt: (p) =>
      `请帮我整理目录 \`${p.folder}\`：
- 按 ${p.groupBy === 'type' ? '文件类型（如 images/、docs/、archives/、code/、misc/）' : '修改日期（YYYY-MM/）'} 创建子目录
- 把文件 mv 到对应子目录（不要复制，不要删除）
- 跳过已经是子目录的内容
- 完成后用 markdown 列表总结迁移了多少文件、有哪些分类。
仅在 \`${p.folder}\` 内操作，不要触碰其他路径。`,
  },

  {
    id: 'batch-rename',
    name: '批量重命名',
    description: '用正则把目录内文件名替换。默认 dry-run 只显示不执行',
    icon: FileEdit,
    safetyLevel: 'caution',
    paramsSchema: renameSchema,
    buildPrompt: (p) =>
      `在目录 \`${p.folder}\` 中，把文件名中匹配正则 \`${p.pattern}\` 的部分替换为 \`${p.replacement}\`。
${p.dryRun ? '⚠️ Dry-run：只列出 [原名 → 新名] 的对照表，不要真改。' : '执行真实 mv 重命名。'}
仅操作 \`${p.folder}\` 内文件，不递归子目录。`,
  },

  {
    id: 'csv-merge',
    name: 'CSV 合并',
    description: '把目录内所有 .csv 合并成一个文件',
    icon: Files,
    safetyLevel: 'safe',
    paramsSchema: csvMergeSchema,
    buildPrompt: (p) =>
      `把目录 \`${p.inputDir}\` 下所有 \`.csv\` 文件按名字排序后合并到 \`${p.output}\`。
${p.hasHeader ? '所有文件都有相同表头，只保留第一份的表头，后续文件跳过首行。' : '每个文件没有表头，直接拼接。'}
输出文件用 UTF-8 编码。完成后报告合并了多少文件、总行数。`,
  },

  {
    id: 'xlsx-to-csv',
    name: 'Excel 转 CSV',
    description: '把 .xlsx 转成 .csv，可选指定 sheet 名',
    icon: FileSpreadsheet,
    safetyLevel: 'safe',
    paramsSchema: xlsxToCsvSchema,
    buildPrompt: (p) =>
      `把 \`${p.xlsx}\` 转换成 CSV 保存到 \`${p.csv}\`。
${p.sheet ? `仅导出 sheet \`${p.sheet}\`。` : '如果有多个 sheet，导出第一个。'}
用 UTF-8 编码。完成后报告行列数。`,
  },

  {
    id: 'pdf-extract-text',
    name: 'PDF 提取文字',
    description: '把 PDF 全部正文提取成纯文本或 Markdown',
    icon: FileText,
    safetyLevel: 'safe',
    paramsSchema: pdfExtractSchema,
    buildPrompt: (p) =>
      `从 \`${p.pdf}\` 提取所有文字保存到 \`${p.output}\`。
- 保留段落分隔
- 如果输出文件以 .md 结尾，尝试识别标题层级用 # ## 标注
- 表格保留为文本形式（不要丢失）
完成后报告字符数。`,
  },

  {
    id: 'list-files-tree',
    name: '目录文件清单',
    description: '生成 Markdown 树状文件清单',
    icon: ListTree,
    safetyLevel: 'safe',
    paramsSchema: listFilesSchema,
    buildPrompt: (p) =>
      `列出 \`${p.folder}\` 下深度 ${p.depth} 以内的所有${p.includeHidden ? '（含隐藏）' : ''}文件和目录，
输出为 markdown 树状列表。每个文件附文件大小（人类可读，如 12 KB / 3.4 MB）。
忽略 node_modules、.git、dist、target 等大型构建产物目录。`,
  },

  {
    id: 'archive-folder',
    name: '压缩文件夹',
    description: '打包成 .tar.gz，可排除 node_modules',
    icon: Archive,
    safetyLevel: 'caution',
    paramsSchema: archiveSchema,
    buildPrompt: (p) =>
      `把目录 \`${p.folder}\` 压缩成 \`${p.output}\`（.tar.gz）。
${p.excludeNodeModules ? '排除 node_modules、.git、dist、target、.next、__pycache__ 等。' : '包含所有内容。'}
完成后报告压缩前后大小。`,
  },

  {
    id: 'format-code',
    name: '代码格式化',
    description: '用语言标准工具批量格式化代码',
    icon: Code2,
    safetyLevel: 'caution',
    paramsSchema: formatCodeSchema,
    buildPrompt: (p) => {
      const tool: Record<typeof p.language, string> = {
        javascript: 'prettier（如果项目里有 .prettierrc 就用项目配置）',
        typescript: 'prettier（如果项目里有 .prettierrc 就用项目配置）',
        python: 'black（默认 88 字符行宽）',
        go: 'gofmt -w',
        rust: 'rustfmt',
      }
      return `用 ${tool[p.language]} 格式化 \`${p.folder}\` 下所有 ${p.language} 源文件。
排除 node_modules、.venv、vendor、target、dist 等。
完成后报告修改了多少个文件。`
    },
  },

  {
    id: 'json-prettify',
    name: 'JSON 美化',
    description: '把单行/压缩的 JSON 美化为缩进格式',
    icon: Braces,
    safetyLevel: 'safe',
    paramsSchema: jsonPrettifySchema,
    buildPrompt: (p) =>
      `把 \`${p.input}\` 的 JSON 用 ${p.indent} 个空格缩进美化后保存到 \`${p.output}\`。
保持 key 原顺序。完成后报告大小变化。`,
  },

  {
    id: 'backup-with-timestamp',
    name: '备份文件（加时间戳）',
    description: '把文件/目录复制到备份目录，文件名加时间戳',
    icon: Save,
    safetyLevel: 'safe',
    paramsSchema: backupSchema,
    buildPrompt: (p) =>
      `把 \`${p.source}\` 复制到 \`${p.backupDir}\` 目录下。
文件名格式：\`<原名>.<YYYYMMDD-HHmmss>.<原扩展名>\`（如果是目录，加 .tar.gz 后缀的压缩包）。
不删除原文件。完成后报告备份路径。`,
  },
]

export function getTemplateById(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id)
}

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  safe: '安全',
  caution: '需谨慎',
  danger: '危险',
}

export const SAFETY_COLOR: Record<SafetyLevel, string> = {
  safe: 'text-emerald-600 border-emerald-200 bg-emerald-50',
  caution: 'text-amber-600 border-amber-200 bg-amber-50',
  danger: 'text-destructive border-destructive/30 bg-destructive/10',
}
