import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = join(__dirname, '../data/wizard.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    agent_selection_mode TEXT DEFAULT 'existing',
    selected_agents TEXT DEFAULT '[]',
    generated_agents TEXT DEFAULT '[]',
    bindings TEXT DEFAULT '[]',
    tasks TEXT DEFAULT '[]',
    execution_log TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    scenario_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    assigned_agents TEXT DEFAULT '[]',
    priority TEXT DEFAULT 'medium',
    mode TEXT DEFAULT 'default',
    conversation_history TEXT DEFAULT '[]',
    execution_history TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    filename TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    message TEXT,
    stage TEXT,
    error TEXT,
    result TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    completed_at INTEGER,
    size INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    scenario_id TEXT,
    from_agent TEXT,
    to_agent TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'task',
    timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_scenario_id ON tasks(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_scenarios_status ON scenarios(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_backup_records_created_at ON backup_records(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_scenario_id ON messages(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

  -- Phase 7: 预置 Agent 系统
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    description TEXT,
    soul_path TEXT NOT NULL,
    category TEXT DEFAULT 'system',
    enabled INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    activated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
`)

// 种入预置 Agent（按 id 检测，缺哪个补哪个 — 升级新版本时新增的 Agent 也能自动补齐）
// lingjing 放第一个：新装机默认激活的"全能主理人"
const SEED_AGENTS = [
  { id: 'lingjing', name: '灵境主理人', emoji: '🪐', description: '默认主助手，能打开应用 / 网页、跑命令、操作文件 — 灵境桌面端的入口角色' },
  { id: 'file-butler', name: '文件管家', emoji: '📁', description: '整理、重命名、归档、清理文件，dry-run 优先，安全沙箱' },
  { id: 'doc-expert', name: '文档处理专家', emoji: '📄', description: 'PDF / Word / Excel / Markdown 互转 + 抽取 + OCR + 校对' },
  { id: 'data-analyst', name: '数据分析助手', emoji: '📊', description: 'CSV / Excel / SQL 清洗、统计、可视化、建模' },
  { id: 'writer', name: '写作助手', emoji: '✍️', description: '邮件、报告、文案、技术文档；多风格多版本' },
  { id: 'coder', name: '代码助手', emoji: '💻', description: '读写改 Bug、Review、测试、重构；TS / Py / Go / Rust' },
]

{
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, emoji, description, soul_path, category, enabled)
    VALUES (?, ?, ?, ?, ?, 'system', 1)
  `)
  let inserted = 0
  for (const a of SEED_AGENTS) {
    const r = insert.run(a.id, a.name, a.emoji, a.description, `resources/agents/${a.id}.md`)
    if (r.changes > 0) inserted++
  }
  if (inserted > 0) console.log(`[Database] Seeded ${inserted} new preset agent(s)`)
}

// 增量迁移:旧库可能没有这些列,以幂等方式 ALTER
const migrations = [
  ['scenarios', 'execution_log', `TEXT DEFAULT '[]'`],
  ['tasks', 'execution_history', `TEXT DEFAULT '[]'`],
  // 灵境扩展:scenario_type 区分 'workshop' / 'company',
  // template_key + role_assignments 是虚拟公司专属字段
  ['scenarios', 'scenario_type', `TEXT DEFAULT 'workshop'`],
  ['scenarios', 'template_key', `TEXT`],
  ['scenarios', 'role_assignments', `TEXT DEFAULT '{}'`],
]
for (const [table, column, def] of migrations) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      console.error(`[Database] migration ${table}.${column} failed:`, e.message)
    }
  }
}

export function createBackupRecord(id, type, filename = null) {
  const stmt = db.prepare(`
    INSERT INTO backup_records (id, type, filename, status, progress, message, created_at)
    VALUES (?, ?, ?, 'pending', 0, 'Task created', ?)
  `)
  stmt.run(id, type, filename, Date.now())
  return id
}

export function updateBackupRecord(id, updates) {
  const fields = []
  const values = []
  
  for (let [key, value] of Object.entries(updates)) {
    if (key === 'completedAt') key = 'completed_at'
    fields.push(`${key} = ?`)
    values.push(typeof value === 'object' ? JSON.stringify(value) : value)
  }
  
  values.push(id)
  
  const stmt = db.prepare(`UPDATE backup_records SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)
}

export function getBackupRecord(id) {
  const stmt = db.prepare('SELECT * FROM backup_records WHERE id = ?')
  const record = stmt.get(id)
  if (record && record.result) {
    record.result = JSON.parse(record.result)
  }
  return record
}

export function getBackupRecords(limit = 20, offset = 0) {
  const stmt = db.prepare('SELECT * FROM backup_records ORDER BY created_at DESC LIMIT ? OFFSET ?')
  const records = stmt.all(limit, offset)
  return records.map(r => {
    if (r.result) {
      r.result = JSON.parse(r.result)
    }
    return r
  })
}

export function getBackupRecordsCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM backup_records')
  return stmt.get().count
}

export function deleteBackupRecord(id) {
  const stmt = db.prepare('DELETE FROM backup_records WHERE id = ?')
  stmt.run(id)
}

console.log('[Database] Initialized at:', dbPath)

export default db
