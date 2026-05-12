// Cron 任务预设。点击一键填表，减少用户面对 cron 表达式的心智负担。

export interface CronPreset {
  id: string
  name: string
  emoji: string
  description: string
  schedule: string
  message: string
}

export const CRON_PRESETS: CronPreset[] = [
  {
    id: 'tidy-downloads-daily',
    name: '每日整理下载',
    emoji: '📁',
    description: '每天上午 9 点把 ~/Downloads 下的文件按类型归档到子目录',
    schedule: '0 9 * * *',
    message:
      '整理 ~/Downloads 目录：按文件类型（images / docs / archives / code / misc）建子目录并 mv 进去。已经在子目录里的不动。完成后用 markdown 列表总结迁移了多少文件、有哪些分类。',
  },
  {
    id: 'weekly-summary-friday',
    name: '每周五生成周报',
    emoji: '📅',
    description: '每周五下午 5 点根据 git commit 和本周聊天记录生成周报',
    schedule: '0 17 * * 5',
    message:
      '根据本周（最近 7 天）我的 git commit 历史和今天之前的聊天记录，生成一份周报。结构：本周亮点 / 关键数字 / 进行中 / 风险 / 下周重点。每条带具体数据。',
  },
  {
    id: 'cleanup-tmp-hourly',
    name: '每小时清理 /tmp',
    emoji: '🧹',
    description: '每小时检查 /tmp 下超过 7 天没动的文件并清理',
    schedule: '0 * * * *',
    message:
      '检查 /tmp 目录下 mtime 超过 7 天的文件，列出来给我看。我点头后再 rm（如果有标记 --auto 则直接清）。绝不动 /tmp/.X*-lock 或其他正在使用的锁文件。',
  },
  {
    id: 'check-tasks-30m',
    name: '每 30 分钟检查任务',
    emoji: '🔍',
    description: '每 30 分钟扫描 ~/.openclaw/agents/main 下的 TODO.md 并提醒',
    schedule: '*/30 * * * *',
    message:
      '读 ~/.openclaw/agents/main/TODO.md，找出今天到期或逾期的任务（含 due: YYYY-MM-DD 注解的）。列出来 + 给一句话提醒。文件不存在或没逾期任务就回 OK_NO_ACTION。',
  },
  {
    id: 'backup-config-midnight',
    name: '每天凌晨备份 .env',
    emoji: '💾',
    description: '每天 0 点把 .env、~/.openclaw/openclaw.json 备份到 ~/backups',
    schedule: '0 0 * * *',
    message:
      '把以下文件复制到 ~/backups（不存在就创建），文件名加 YYYYMMDD 后缀：\n- 当前项目的 .env（如果存在）\n- ~/.openclaw/openclaw.json\n保留最近 30 份，老的删掉。完成后告诉我备份了几份、各自大小。',
  },
]
