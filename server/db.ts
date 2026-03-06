// ============================================================
// SQLite Database — Server Side (better-sqlite3)
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'ai-demo.db');

// Ensure data dir exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Schema ----

db.exec(`
-- AI 任务配置（原子能力，管理员创建）
CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'custom',   -- builtin | custom
  tags TEXT DEFAULT '[]',           -- JSON array: ["工单", "翻译"]
  trigger_type TEXT NOT NULL,       -- record_create | record_update | field_change | button_click | schedule | workflow
  trigger_config TEXT DEFAULT '{}', -- JSON: { collection, field, cron, ... }
  action TEXT NOT NULL,             -- translate | classify | fill | extract | generate | validate | summarize | decide | investigate
  model_tier TEXT DEFAULT 'fast',   -- fast | lite | pro
  prompt_template TEXT NOT NULL,
  prompt_system TEXT DEFAULT '',    -- system prompt / role
  input_fields TEXT DEFAULT '[]',   -- JSON array
  output_fields TEXT DEFAULT '[]',  -- JSON array
  output_format TEXT DEFAULT 'text', -- text | json | markdown
  retry_count INTEGER DEFAULT 0,    -- auto retry on failure
  timeout_ms INTEGER DEFAULT 30000, -- execution timeout
  avatar TEXT DEFAULT '',           -- emoji avatar for AI employee
  avatar_color TEXT DEFAULT '#8b5cf6', -- avatar background color
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 工作流定义
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL,       -- record_create | record_update | field_change | schedule | manual
  trigger_config TEXT DEFAULT '{}', -- JSON
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 工作流节点（链表结构）
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  type TEXT NOT NULL,               -- trigger | condition | ai_task | action | notification | delay | parallel | end
  title TEXT DEFAULT '',
  config TEXT DEFAULT '{}',         -- JSON: depends on type
  -- ai_task node: { task_id, input_mapping: {field: "{{record.field}}"} }
  -- condition node: { field, operator, value, true_branch, false_branch }
  -- action node: { type: "update_field"|"create_record"|"send_email", ... }
  -- notification node: { channel: "alert"|"email", template }
  -- delay node: { seconds }
  -- parallel node: { branch_ids: [] }
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  next_node_id TEXT DEFAULT '',     -- next node (empty = end)
  branch_true TEXT DEFAULT '',      -- for condition nodes
  branch_false TEXT DEFAULT '',     -- for condition nodes
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 工作流执行实例
CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT DEFAULT '',
  trigger_data TEXT DEFAULT '{}',   -- JSON: the data that triggered this
  status TEXT DEFAULT 'running',    -- running | completed | failed | cancelled
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT '',
  error TEXT DEFAULT ''
);

-- 工作流节点执行记录
CREATE TABLE IF NOT EXISTS node_executions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,       -- workflow_executions.id
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_title TEXT DEFAULT '',
  input_data TEXT DEFAULT '{}',     -- JSON: what was fed into this node
  output_data TEXT DEFAULT '{}',    -- JSON: what this node produced
  status TEXT DEFAULT 'running',    -- pending | running | completed | failed | skipped
  duration_ms INTEGER DEFAULT 0,
  error TEXT DEFAULT '',
  result_id TEXT DEFAULT '',        -- links to ai_results if ai_task node
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT ''
);

-- AI 执行结果（每次 AI 执行产生一条，锚定到页面位置）
CREATE TABLE IF NOT EXISTS ai_results (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  action TEXT NOT NULL,

  -- 锚定位置：哪个页面、哪个记录、哪个字段
  page_id TEXT DEFAULT '',          -- 页面标识 (如 'tickets', 'orders', 'customers', 'emails')
  record_id TEXT NOT NULL,          -- 业务记录 ID
  field_name TEXT DEFAULT '',       -- 目标字段名（空=记录级别）
  block_id TEXT DEFAULT '',         -- 区块标识（用于前端定位）

  -- 执行上下文
  execution_id TEXT DEFAULT '',     -- workflow_executions.id (if triggered by workflow)
  node_execution_id TEXT DEFAULT '', -- node_executions.id
  input_data TEXT DEFAULT '{}',     -- JSON: complete input sent to AI
  prompt_used TEXT DEFAULT '',      -- actual prompt after template rendering

  -- AI 输出
  old_value TEXT DEFAULT '',
  new_value TEXT NOT NULL,
  confidence INTEGER DEFAULT 0,     -- 0-100
  model TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  raw_response TEXT DEFAULT '',     -- AI 原始返回（调试用）

  -- 状态
  status TEXT DEFAULT 'pending',    -- pending | applied | rejected | modified | expired | failed
  applied_by TEXT DEFAULT '',
  applied_at TEXT DEFAULT '',

  -- 重试 & 对话
  retry_of TEXT DEFAULT '',         -- 如果是重试，指向原 result id
  conversation_id TEXT DEFAULT '',  -- 关联的对话 id（如果用户开启了对话）

  created_at TEXT DEFAULT (datetime('now'))
);

-- 审计日志
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  result_id TEXT,
  execution_id TEXT DEFAULT '',     -- can audit workflow-level too
  action TEXT NOT NULL,             -- created | applied | rejected | modified | retried | conversation
  user_name TEXT DEFAULT 'system',
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 知识建议（工单知识积累用）
CREATE TABLE IF NOT EXISTS knowledge_suggestions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_summary TEXT NOT NULL,
  resolution TEXT NOT NULL,
  ai_analysis TEXT NOT NULL,        -- AI 分析的 JSON
  suggested_action TEXT NOT NULL,   -- knowledge_base | user_manual | none
  summary TEXT NOT NULL,            -- 知识摘要
  category TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',    -- pending | accepted | rejected
  accepted_action TEXT DEFAULT '',  -- 实际执行的操作
  created_at TEXT DEFAULT (datetime('now'))
);

-- 预警/推送（通用推送表，满意度、违规、高价值客户等）
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,               -- satisfaction | violation | high_value | payment
  source_type TEXT NOT NULL,        -- ticket | customer | order | email
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT DEFAULT 'info',     -- info | warning | critical
  status TEXT DEFAULT 'unread',     -- unread | read | handled | dismissed
  handled_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- Demo 业务数据表 ----

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT DEFAULT '',
  category TEXT DEFAULT '',
  priority TEXT DEFAULT '',
  status TEXT DEFAULT 'open',       -- open | in_progress | resolved | closed
  resolution TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender TEXT NOT NULL,             -- customer | agent
  content TEXT NOT NULL,
  language TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  country TEXT DEFAULT '',
  company TEXT DEFAULT '',
  license_type TEXT DEFAULT '',     -- community | professional | enterprise
  background TEXT DEFAULT '',       -- AI 调查结果
  satisfaction_score INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',    -- pending | paid | shipped | completed
  voucher_text TEXT DEFAULT '',     -- 上传的凭证内容
  voucher_analysis TEXT DEFAULT '', -- AI 分析结果
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  customer_id TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT DEFAULT '',
  direction TEXT DEFAULT 'inbound', -- inbound | outbound
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_translations (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT DEFAULT '',
  target_lang TEXT DEFAULT '中文',
  model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_summaries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  email_count INTEGER DEFAULT 0,
  model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_results_record ON ai_results(page_id, record_id);
CREATE INDEX IF NOT EXISTS idx_results_field ON ai_results(record_id, field_name);
CREATE INDEX IF NOT EXISTS idx_results_status ON ai_results(status);
CREATE INDEX IF NOT EXISTS idx_results_execution ON ai_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, type);
CREATE INDEX IF NOT EXISTS idx_ticket_replies ON ticket_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_emails_customer ON emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes ON workflow_nodes(workflow_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_node_executions ON node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions ON workflow_executions(workflow_id);
`);

export default db;
