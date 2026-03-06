// ============================================================
// Seed Data — Tasks, Workflows, Business Data
// ============================================================

import db from './db.js';
import crypto from 'crypto';

const uid = () => crypto.randomUUID().slice(0, 8);

// Demo trigger metadata — enriches result rows for audit trail
const TRIGGER_DEFAULTS = {
  workflow: { trigger_source: 'workflow', trigger_user: 'system', trigger_user_id: 'sys-001', trigger_ip: '10.0.1.10', trigger_action: '工作流自动触发' },
  frontend: { trigger_source: 'frontend', trigger_user: '张明', trigger_user_id: 'user-001', trigger_ip: '192.168.1.105', trigger_action: '按钮点击' },
  schedule: { trigger_source: 'schedule', trigger_user: 'system', trigger_user_id: 'sys-001', trigger_ip: '10.0.1.10', trigger_action: '定时任务' },
  api: { trigger_source: 'api', trigger_user: 'api-client', trigger_user_id: 'api-001', trigger_ip: '203.0.113.50', trigger_action: 'API 调用' },
};

const PAGE_PATHS: Record<string, string> = {
  tickets: '/tickets',
  customers: '/customers',
  orders: '/orders',
  emails: '/emails',
  'email-summaries': '/emails/summaries',
};

// Auto-generate input_data and prompt_used from task type
const PROMPT_TEMPLATES: Record<string, (r: Record<string, unknown>) => { input_data: string; prompt_used: string }> = {
  'task-translate': (r) => ({
    input_data: JSON.stringify({ content: `(工单 ${r.record_id} 原文)`, target_lang: '中文', source_field: r.field_name }),
    prompt_used: `将以下文本翻译为中文，只输出翻译结果，不加任何解释：\n\n(工单 ${r.record_id} 原文内容)`,
  }),
  'task-classify': (r) => ({
    input_data: JSON.stringify({ content: `(工单 ${r.record_id} 内容摘要)`, categories: ['设备维修', '软件问题', '账户问题', '功能咨询', '投诉建议', '许可证问题', '数据问题'] }),
    prompt_used: `只输出一个分类标签：设备维修 | 软件问题 | 账户问题 | 功能咨询 | 投诉建议 | 许可证问题 | 数据问题 | 其他\n\n工单内容：\n(工单 ${r.record_id} 内容)`,
  }),
  'task-priority': (r) => ({
    input_data: JSON.stringify({ content: `(工单 ${r.record_id} 内容)`, category: r.new_value || '未分类', severity_factors: ['影响范围', '紧急程度', '业务影响'] }),
    prompt_used: `只输出优先级：P1-紧急 | P2-高 | P3-中 | P4-低\n\n分类：${r.new_value || '未知'}\n内容：(工单 ${r.record_id} 内容)`,
  }),
  'task-reply-gen': (r) => ({
    input_data: JSON.stringify({ content: `(工单 ${r.record_id} 完整内容)`, customer_lang: '英语', knowledge_context: '(匹配的知识库条目)', tone_options: ['专业', '温和', '简洁'] }),
    prompt_used: `为以下工单生成回复，同时提供英语版本和中文版本。\n\n工单内容：\n(工单 ${r.record_id} 完整内容)\n\n参考知识库：\n(已匹配的知识库条目)`,
  }),
  'task-customer-bg': (r) => ({
    input_data: JSON.stringify({ customer_id: r.record_id, data_sources: ['crm', 'tickets', 'emails', 'orders'], analysis_depth: 'full' }),
    prompt_used: `调查客户 ${r.record_id} 的背景信息，综合 CRM、工单、邮件、订单数据，输出客户画像。`,
  }),
  'task-satisfaction': (r) => ({
    input_data: JSON.stringify({ customer_id: r.record_id, metrics: ['ticket_frequency', 'response_satisfaction', 'email_sentiment', 'renewal_status'] }),
    prompt_used: `分析客户 ${r.record_id} 的满意度，综合工单频率、响应满意度、邮件情绪、续约状态，给出评估和建议。`,
  }),
  'task-violation': (r) => ({
    input_data: JSON.stringify({ customer_id: r.record_id, check_items: ['license_validity', 'usage_limits', 'data_compliance', 'api_quota'] }),
    prompt_used: `检查客户 ${r.record_id} 的合规状态：授权有效性、用量限制、数据合规、API 配额。`,
  }),
  'task-voucher': (r) => ({
    input_data: JSON.stringify({ order_id: r.record_id, voucher_content: '(上传的凭证文本)', order_amount: '(订单金额)', currency: '(币种)' }),
    prompt_used: `核对订单 ${r.record_id} 的付款凭证：比对凭证金额与订单金额，检查付款方、币种、日期，输出匹配结果和差异。`,
  }),
  'task-knowledge': (r) => ({
    input_data: JSON.stringify({ ticket_id: r.record_id, resolution: '(工单解决方案)', category: '(工单分类)', analysis_type: 'knowledge_extraction' }),
    prompt_used: `分析已解决工单 ${r.record_id} 的解决方案，判断是否适合写入知识库或用户手册，提取关键知识点。`,
  }),
  'task-email-summary': (r) => ({
    input_data: JSON.stringify({ customer_id: r.record_id, email_count: 6, date_range: '近30天', summary_type: 'comprehensive' }),
    prompt_used: `汇总客户 ${r.record_id} 近30天的邮件往来，提取关键事项、待办、商业洞察。`,
  }),
};

function enrichResult(r: Record<string, unknown>, page: string, triggerType: keyof typeof TRIGGER_DEFAULTS = 'workflow', blockPos = '') {
  const t = TRIGGER_DEFAULTS[triggerType];
  const taskId = r.task_id as string;
  const promptGen = PROMPT_TEMPLATES[taskId];
  const { input_data, prompt_used } = promptGen ? promptGen(r) : { input_data: '{}', prompt_used: '' };
  return {
    ...r,
    ...t,
    input_data,
    prompt_used,
    trigger_page_path: PAGE_PATHS[page] || `/${page}`,
    trigger_block_pos: blockPos || `${page}/${r.field_name || 'record'}`,
  };
}

export function seed() {
  const count = db.prepare('SELECT COUNT(*) as c FROM tickets').get() as { c: number };
  if (count.c > 0) return;

  // ---- AI Tasks (atomic capabilities) ----
  // Each task = an AI Employee with avatar + persona
  const tasks = [
    {
      id: 'task-translate', name: '翻译专员', description: '将任意语言文本翻译为目标语言',
      category: 'builtin', tags: '["通用","翻译"]',
      trigger_type: 'record_create', trigger_config: '{}',
      action: 'translate', model_tier: 'fast',
      avatar: '🌐', avatar_color: '#1677ff',
      prompt_template: '将以下文本翻译为{{target_lang}}，只输出翻译结果，不加任何解释：\n\n{{content}}',
      prompt_system: '你是一个专业翻译，确保术语准确、语句自然。',
      input_fields: '["content","target_lang"]', output_fields: '["translated_text"]',
      output_format: 'text', retry_count: 1, timeout_ms: 15000,
    },
    {
      id: 'task-classify', name: '分类专员', description: '根据内容自动判断工单类别',
      category: 'builtin', tags: '["工单","分类"]',
      trigger_type: 'record_create', trigger_config: '{}',
      action: 'classify', model_tier: 'lite',
      avatar: '🏷️', avatar_color: '#722ed1',
      prompt_template: '只输出一个分类标签：设备维修 | 软件问题 | 账户问题 | 功能咨询 | 投诉建议 | 许可证问题 | 数据问题 | 其他\n\n工单内容：\n{{content}}',
      prompt_system: '你是工单分类系统。只输出分类标签，不要解释。',
      input_fields: '["content"]', output_fields: '["category"]',
      output_format: 'text', retry_count: 0, timeout_ms: 10000,
    },
    {
      id: 'task-priority', name: '优先级顾问', description: '根据内容和分类判断紧急程度',
      category: 'builtin', tags: '["工单","决策"]',
      trigger_type: 'record_create', trigger_config: '{}',
      action: 'decide', model_tier: 'lite',
      avatar: '🚦', avatar_color: '#fa541c',
      prompt_template: '只输出优先级：P1-紧急 | P2-高 | P3-中 | P4-低\n\n分类：{{category}}\n内容：{{content}}',
      prompt_system: '你是优先级评估系统。只输出优先级标签。',
      input_fields: '["content","category"]', output_fields: '["priority"]',
      output_format: 'text', retry_count: 0, timeout_ms: 10000,
    },
    {
      id: 'task-reply-gen', name: '回复助手', description: '为工单预生成双语回复',
      category: 'builtin', tags: '["工单","生成"]',
      trigger_type: 'record_create', trigger_config: '{}',
      action: 'generate', model_tier: 'fast',
      avatar: '✍️', avatar_color: '#52c41a',
      prompt_template: '为以下工单生成回复，同时提供{{customer_lang}}版本和中文版本。\n\n工单内容：\n{{content}}\n\n格式：\n=== {{customer_lang}} ===\n（正式回复）\n\n=== 中文 ===\n（对应中文）',
      prompt_system: '你是专业客服回复助手。回复要礼貌、专业、有具体行动计划。',
      input_fields: '["content","customer_lang","knowledge_context"]', output_fields: '["reply_draft"]',
      output_format: 'text', retry_count: 1, timeout_ms: 30000,
    },
    {
      id: 'task-knowledge', name: '知识管家', description: '分析已解决工单是否值得积累为知识',
      category: 'builtin', tags: '["工单","知识"]',
      trigger_type: 'field_change', trigger_config: '{}',
      action: 'decide', model_tier: 'fast',
      avatar: '📚', avatar_color: '#faad14',
      prompt_template: '分析已解决工单的知识价值。输出JSON：\n{"worth_action":true/false,"reason":"原因","suggested_action":"knowledge_base"|"user_manual"|"none","summary":"知识摘要","category":"分类"}\n\n工单：{{content}}\n解决方案：{{resolution}}',
      prompt_system: '你是知识管理专家。判断工单解决方案是否有复用价值。',
      input_fields: '["content","resolution"]', output_fields: '["knowledge_suggestion"]',
      output_format: 'json', retry_count: 0, timeout_ms: 20000,
    },
    {
      id: 'task-customer-bg', name: '情报分析师', description: '调查客户公司背景信息',
      category: 'builtin', tags: '["客户","调查"]',
      trigger_type: 'record_create', trigger_config: '{}',
      action: 'investigate', model_tier: 'fast',
      avatar: '🔍', avatar_color: '#13c2c2',
      prompt_template: '调查客户背景并输出简洁报告：\n1. 公司简介\n2. 行业和规模\n3. 价值评估(高/中/低)\n4. 风险点\n\n客户：{{name}}\n地区：{{country}}\n{{additional_info}}',
      prompt_system: '你是商业情报分析师。',
      input_fields: '["name","country","additional_info"]', output_fields: '["background","value_rating"]',
      output_format: 'text', retry_count: 1, timeout_ms: 20000,
    },
    {
      id: 'task-email-summary', name: '邮件秘书', description: '总结客户邮件往来',
      category: 'builtin', tags: '["邮件","摘要"]',
      trigger_type: 'schedule', trigger_config: '{}',
      action: 'summarize', model_tier: 'fast',
      avatar: '📧', avatar_color: '#eb2f96',
      prompt_template: '总结以下邮件往来，提取关键信息和待办：\n\n{{emails}}',
      prompt_system: '你是邮件分析助手。重点提取：决策事项、待办、关键日期、金额。',
      input_fields: '["emails"]', output_fields: '["summary"]',
      output_format: 'markdown', retry_count: 0, timeout_ms: 30000,
    },
    {
      id: 'task-voucher', name: '财务核对员', description: '分析转账凭证与订单匹配度',
      category: 'builtin', tags: '["订单","校验"]',
      trigger_type: 'field_change', trigger_config: '{}',
      action: 'validate', model_tier: 'fast',
      avatar: '💰', avatar_color: '#faad14',
      prompt_template: '分析转账凭证与订单是否匹配。输出JSON：\n{"match":true/false,"confidence":0-100,"voucher_amount":"金额","discrepancies":[],"recommendation":"建议"}\n\n凭证：{{voucher_text}}\n订单：{{order_id}} / {{currency}} {{amount}} / {{customer_name}}',
      prompt_system: '你是财务核对专家。',
      input_fields: '["voucher_text","order_id","amount","currency","customer_name"]', output_fields: '["match_result"]',
      output_format: 'json', retry_count: 1, timeout_ms: 15000,
    },
    {
      id: 'task-satisfaction', name: '客户成功顾问', description: '分析客户满意度和流失风险',
      category: 'builtin', tags: '["客户","决策"]',
      trigger_type: 'schedule', trigger_config: '{}',
      action: 'decide', model_tier: 'fast',
      avatar: '😊', avatar_color: '#52c41a',
      prompt_template: '分析客户满意度。输出JSON：\n{"score":0-100,"risk_level":"high"|"medium"|"low","factors":[],"recommendation":"建议"}\n\n客户：{{customer_name}}\n工单历史：{{ticket_summary}}\n邮件历史：{{email_summary}}',
      prompt_system: '你是客户成功经理。',
      input_fields: '["customer_name","ticket_summary","email_summary"]', output_fields: '["satisfaction_result"]',
      output_format: 'json', retry_count: 0, timeout_ms: 20000,
    },
    {
      id: 'task-violation', name: '合规审查员', description: '检测客户是否违规使用',
      category: 'builtin', tags: '["客户","校验"]',
      trigger_type: 'schedule', trigger_config: '{}',
      action: 'validate', model_tier: 'fast',
      avatar: '🛡️', avatar_color: '#f5222d',
      prompt_template: '分析客户是否违规使用。输出JSON：\n{"violation":true/false,"severity":"high"|"medium"|"low","details":[],"recommendation":"建议"}\n\n客户：{{customer_name}}\n许可证：{{license_type}}\n应用信息：{{app_info}}',
      prompt_system: '你是许可证合规分析师。',
      input_fields: '["customer_name","license_type","app_info"]', output_fields: '["violation_result"]',
      output_format: 'json', retry_count: 0, timeout_ms: 15000,
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO ai_tasks (id, name, description, category, tags, trigger_type, trigger_config, action, model_tier,
      prompt_template, prompt_system, input_fields, output_fields, output_format, retry_count, timeout_ms, avatar, avatar_color)
    VALUES (@id, @name, @description, @category, @tags, @trigger_type, @trigger_config, @action, @model_tier,
      @prompt_template, @prompt_system, @input_fields, @output_fields, @output_format, @retry_count, @timeout_ms, @avatar, @avatar_color)
  `);
  for (const t of tasks) insertTask.run(t);

  // ---- Workflows ----
  // ---- Workflows (simplified: single AI team node per workflow) ----
  const insertNode = db.prepare(`
    INSERT INTO workflow_nodes (id, workflow_id, type, title, config, sort_order, position_x, position_y, next_node_id, branch_true, branch_false)
    VALUES (@id, @workflow_id, @type, @title, @config, @sort_order, @position_x, @position_y, @next_node_id, @branch_true, @branch_false)
  `);

  // Workflow 1: 工单处理 — AI 团队(翻译+分类+优先级+回复) 合并为单节点
  const wfId = `wf-${uid()}`;
  db.prepare(`INSERT INTO workflows (id, name, description, trigger_type, trigger_config)
    VALUES (?, ?, ?, ?, ?)`).run(
    wfId, '工单全流程处理', '新工单 → AI团队(🌐翻译+🏷️分类+🚦优先级+✍️回复) → 写入 → 通知',
    'record_create', JSON.stringify({ collection: 'tickets' })
  );

  const n1 = [`nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`];
  const wf1Nodes = [
    { id: n1[0], workflow_id: wfId, type: 'trigger', title: '新工单创建', config: JSON.stringify({ collection: 'tickets' }), sort_order: 0, position_x: 100, position_y: 50, next_node_id: n1[1] },
    { id: n1[1], workflow_id: wfId, type: 'ai_task', title: '🌐🏷️🚦✍️ 工单处理团队', config: JSON.stringify({ team: true, mode: 'collaborative', task_ids: ['task-translate', 'task-classify', 'task-priority', 'task-reply-gen'], description: '翻译 + 分类 + 优先级 + 预回复，合并为单次 AI 调用' }), sort_order: 1, position_x: 100, position_y: 150, next_node_id: n1[2] },
    { id: n1[2], workflow_id: wfId, type: 'action', title: '写入处理结果', config: JSON.stringify({ type: 'update_record', collection: 'tickets' }), sort_order: 2, position_x: 100, position_y: 250, next_node_id: n1[3] },
    { id: n1[3], workflow_id: wfId, type: 'end', title: '完成', config: '{}', sort_order: 3, position_x: 100, position_y: 350 },
  ];
  for (const n of wf1Nodes) insertNode.run({ next_node_id: '', branch_true: '', branch_false: '', ...n });

  // Workflow 2: 工单知识积累 — 单个 AI 员工
  const wf2Id = `wf-${uid()}`;
  db.prepare(`INSERT INTO workflows (id, name, description, trigger_type, trigger_config)
    VALUES (?, ?, ?, ?, ?)`).run(
    wf2Id, '工单知识积累', '工单解决 → 📚知识管家分析 → 创建建议',
    'field_change', JSON.stringify({ collection: 'tickets', field: 'status', value: 'resolved' })
  );

  const n2 = [`nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`];
  const wf2Nodes = [
    { id: n2[0], workflow_id: wf2Id, type: 'trigger', title: '工单已解决', config: '{}', sort_order: 0, position_x: 100, position_y: 50, next_node_id: n2[1] },
    { id: n2[1], workflow_id: wf2Id, type: 'ai_task', title: '📚 知识管家', config: JSON.stringify({ task_ids: ['task-knowledge'], description: '分析知识价值并提出建议' }), sort_order: 1, position_x: 100, position_y: 150, next_node_id: n2[2] },
    { id: n2[2], workflow_id: wf2Id, type: 'action', title: '创建知识建议', config: JSON.stringify({ type: 'create_record', collection: 'knowledge_suggestions' }), sort_order: 2, position_x: 100, position_y: 250, next_node_id: n2[3] },
    { id: n2[3], workflow_id: wf2Id, type: 'end', title: '完成', config: '{}', sort_order: 3, position_x: 100, position_y: 350 },
  ];
  for (const n of wf2Nodes) insertNode.run({ next_node_id: '', branch_true: '', branch_false: '', ...n });

  // Workflow 3: 邮件处理 — AI 团队(翻译+摘要)
  const wf3Id = `wf-${uid()}`;
  db.prepare(`INSERT INTO workflows (id, name, description, trigger_type, trigger_config)
    VALUES (?, ?, ?, ?, ?)`).run(
    wf3Id, '邮件自动处理', '新邮件 → AI团队(🌐翻译+📧摘要) → 通知',
    'record_create', JSON.stringify({ collection: 'emails' })
  );

  const n3 = [`nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`, `nd-${uid()}`];
  const wf3Nodes = [
    { id: n3[0], workflow_id: wf3Id, type: 'trigger', title: '新邮件到达', config: JSON.stringify({ collection: 'emails' }), sort_order: 0, position_x: 100, position_y: 50, next_node_id: n3[1] },
    { id: n3[1], workflow_id: wf3Id, type: 'ai_task', title: '🌐📧 邮件处理团队', config: JSON.stringify({ team: true, mode: 'parallel', task_ids: ['task-translate', 'task-email-summary'], description: '翻译和摘要并发执行，各自独立输出' }), sort_order: 1, position_x: 100, position_y: 150, next_node_id: n3[2] },
    { id: n3[2], workflow_id: wf3Id, type: 'notification', title: '通知负责人', config: JSON.stringify({ channel: 'inbox', template: '新邮件已处理' }), sort_order: 2, position_x: 100, position_y: 250, next_node_id: n3[3] },
    { id: n3[3], workflow_id: wf3Id, type: 'end', title: '完成', config: '{}', sort_order: 3, position_x: 100, position_y: 350 },
  ];
  for (const n of wf3Nodes) insertNode.run({ next_node_id: '', branch_true: '', branch_false: '', ...n });

  // ---- Customers ----
  const customers = [
    { id: 'cust-001', name: 'TechFlow GmbH', email: 'info@techflow.de', country: '德国', company: 'TechFlow GmbH', license_type: 'professional', satisfaction_score: 82, background: '德国工业自动化软件公司，50人规模，使用NocoBase搭建内部ERP和项目管理系统。年订阅$12K，续约意愿高。' },
    { id: 'cust-002', name: 'Sakura Systems', email: 'contact@sakura-sys.co.jp', country: '日本', company: 'Sakura Systems Inc.', license_type: 'enterprise', satisfaction_score: 91, background: '日本IT集成商，200人规模，为客户部署NocoBase企业版。Top 3渠道合作伙伴，年采购$36K。正考虑升级更多License。' },
    { id: 'cust-003', name: '深圳明创科技', email: 'support@mingchuang.cn', country: '中国', company: '深圳明创科技有限公司', license_type: 'professional', satisfaction_score: 65, background: '电子制造企业，120人规模，用NocoBase做采购审批和库存管理。近期工作流异常导致满意度下降，需重点跟进。' },
    { id: 'cust-004', name: 'GlobalTrade Ltd', email: 'ops@globaltrade.uk', country: '英国', company: 'GlobalTrade Ltd', license_type: 'enterprise', satisfaction_score: 74, background: '跨国贸易公司，80人规模，主要用于客户管理和订单跟踪。数据导出问题影响季度合规报告，时间敏感。' },
    { id: 'cust-005', name: 'StartupHub Inc', email: 'dev@startuphub.com', country: '美国', company: 'StartupHub Inc', license_type: 'community', satisfaction_score: 88, background: '硅谷孵化器，30人团队，社区版用户。正在评估API集成能力，有可能升级到专业版。活跃度高，社区贡献者。' },
  ];
  const insertCust = db.prepare('INSERT INTO customers (id, name, email, country, company, license_type, satisfaction_score, background) VALUES (@id, @name, @email, @country, @company, @license_type, @satisfaction_score, @background)');
  for (const c of customers) insertCust.run(c);

  // ---- Tickets ----
  const tickets = [
    { id: 'tk-001', customer_name: 'TechFlow GmbH', customer_email: 'info@techflow.de', subject: 'Printer connection issue after update', content: 'After the latest system update, our network printer HP LaserJet Pro M404 is no longer connecting. We have tried restarting the print spooler service and reinstalling the driver, but the issue persists. This is affecting our entire office of 25 people. Please help urgently.', language: '英语', status: 'open', resolution: '' },
    { id: 'tk-002', customer_name: 'Sakura Systems', customer_email: 'contact@sakura-sys.co.jp', subject: 'ライセンスのアップグレードについて', content: '現在プロフェッショナル版を使用していますが、エンタープライズ版へのアップグレードを検討しています。アップグレードの手順と価格について教えていただけますか？また、データの移行はスムーズに行えますか？', language: '日语', status: 'open', resolution: '' },
    { id: 'tk-003', customer_name: 'GlobalTrade Ltd', customer_email: 'ops@globaltrade.uk', subject: 'Data export failing with timeout error', content: 'When trying to export our customer database (approximately 50,000 records), the export process times out after 120 seconds. We need this data for our quarterly compliance report due next week. The error message is: "Export timeout: operation exceeded maximum duration". We are on the Enterprise plan.', language: '英语', status: 'in_progress', resolution: '' },
    { id: 'tk-004', customer_name: '深圳明创科技', customer_email: 'support@mingchuang.cn', subject: '工作流触发异常', content: '我们配置的审批工作流在某些情况下没有正确触发。具体表现为：当采购金额超过10万时应该自动触发三级审批，但有时只触发了一级审批就直接通过了。这个问题已经导致两笔大额采购未经充分审批就执行了。', language: '中文', status: 'open', resolution: '' },
    { id: 'tk-005', customer_name: 'StartupHub Inc', customer_email: 'dev@startuphub.com', subject: 'API rate limiting questions', content: 'We are building an integration with your API and want to understand the rate limiting policies.', language: '英语', status: 'resolved', resolution: 'Provided API documentation link with rate limiting details. Standard limit is 100 req/min.' },
    { id: 'tk-006', customer_name: 'Sakura Systems', customer_email: 'contact@sakura-sys.co.jp', subject: 'マルチテナント環境でのパフォーマンス問題', content: '3社のクライアント環境を同一インスタンスで運用していますが、ピーク時間帯（日本時間9:00-11:00）にレスポンスが著しく低下します。特にダッシュボードの読み込みに10秒以上かかることがあります。各テナントのリソース制限設定はありますか？', language: '日语', status: 'open', resolution: '' },
    { id: 'tk-007', customer_name: 'GlobalTrade Ltd', customer_email: 'ops@globaltrade.uk', subject: 'Automated report scheduling', content: 'We need to set up automated weekly reports that include: 1) New customer acquisitions 2) Revenue by region 3) Outstanding invoices over 30 days. These should be emailed to our management team every Monday at 8am GMT. Is this possible with your workflow system?', language: '英语', status: 'open', resolution: '' },
    { id: 'tk-008', customer_name: 'StartupHub Inc', customer_email: 'dev@startuphub.com', subject: 'Webhook payload too large', content: 'Our webhook endpoint is receiving payloads exceeding 1MB when records with file attachments are updated. This causes our Lambda function to timeout. Can we configure webhook payload size limits or exclude attachment data from webhook events?', language: '英语', status: 'in_progress', resolution: '' },
  ];
  const insertTicket = db.prepare('INSERT INTO tickets (id, customer_name, customer_email, subject, content, language, status, resolution) VALUES (@id, @customer_name, @customer_email, @subject, @content, @language, @status, @resolution)');
  for (const t of tickets) insertTicket.run(t);

  // ---- Replies ----
  db.prepare('INSERT INTO ticket_replies (id, ticket_id, sender, content, language) VALUES (?, ?, ?, ?, ?)')
    .run(`reply-${uid()}`, 'tk-003', 'agent', 'Hi, we are looking into the timeout issue. Could you confirm which export format you are using?', '英语');
  db.prepare('INSERT INTO ticket_replies (id, ticket_id, sender, content, language) VALUES (?, ?, ?, ?, ?)')
    .run(`reply-${uid()}`, 'tk-003', 'customer', 'We are using CSV format with 15 custom fields.', '英语');

  // ---- Orders ----
  const orders = [
    { id: 'ord-001', customer_id: 'cust-002', customer_name: 'Sakura Systems', amount: 12800, currency: 'USD', status: 'pending', voucher_text: '', voucher_analysis: '' },
    { id: 'ord-002', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', amount: 36500, currency: 'GBP', status: 'pending', voucher_text: 'SWIFT Transfer Confirmation\nSender: GlobalTrade Ltd (Barclays UK)\nAccount: GB29 BARC 2026 1530 0934 91\nAmount: GBP 36,500.00\nReference: ORD-002-NOCOBASE\nDate: 2026-03-03\nBeneficiary: NocoBase Ltd', voucher_analysis: '' },
    { id: 'ord-003', customer_id: 'cust-003', customer_name: '深圳明创科技', amount: 88000, currency: 'CNY', status: 'paid', voucher_text: '中国银行转账凭证\n付款方: 深圳明创科技有限公司\n收款方: NocoBase 软件技术有限公司\n金额: ¥88,000.00\n附言: 2026年度专业版订阅\n交易日期: 2026-02-15', voucher_analysis: '{"match":true,"confidence":96,"voucher_amount":"¥88,000.00","voucher_payer":"深圳明创科技有限公司","discrepancies":[],"recommendation":"金额、客户名称完全匹配，建议标记为已付款。"}' },
    { id: 'ord-004', customer_id: 'cust-005', customer_name: 'StartupHub Inc', amount: 4800, currency: 'USD', status: 'pending', voucher_text: '', voucher_analysis: '' },
    { id: 'ord-005', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', amount: 15200, currency: 'EUR', status: 'pending', voucher_text: 'SEPA Transfer\nDebtor: TechFlow GmbH (Deutsche Bank)\nIBAN: DE89 3704 0044 0532 0130 00\nAmount: EUR 14,800.00\nReference: NOCOBASE-2026-RENEWAL\nDate: 2026-03-04', voucher_analysis: '' },
  ];
  const insertOrder = db.prepare('INSERT INTO orders (id, customer_id, customer_name, amount, currency, status, voucher_text, voucher_analysis) VALUES (@id, @customer_id, @customer_name, @amount, @currency, @status, @voucher_text, @voucher_analysis)');
  for (const o of orders) insertOrder.run(o);

  // ---- Emails ----
  // TechFlow GmbH (cust-001) — 6 emails (German, triggers summary)
  const emailsTF = [
    { id: 'email-tf-01', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'info@techflow.de', to_addr: 'support@nocobase.com', subject: 'Anfrage zur Integration', body: 'Sehr geehrte Damen und Herren, wir möchten gerne wissen, ob Ihre Plattform eine Integration mit SAP Business One unterstützt. Wir verwenden SAP für unsere Buchhaltung und benötigen einen bidirektionalen Datenaustausch.', language: '德语', direction: 'inbound' },
    { id: 'email-tf-02', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'support@nocobase.com', to_addr: 'info@techflow.de', subject: 'Re: Anfrage zur Integration', body: 'Dear TechFlow team, yes we support SAP B1 integration via our REST API and webhook system. I will send you our integration guide shortly.', language: '英语', direction: 'outbound' },
    { id: 'email-tf-03', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'info@techflow.de', to_addr: 'support@nocobase.com', subject: 'Datenmigration Zeitplan', body: 'Vielen Dank für die Informationen. Wir planen die Migration für nächsten Monat. Können Sie uns einen Zeitplan für die Implementierung vorschlagen? Wir haben etwa 50.000 Datensätze in SAP.', language: '德语', direction: 'inbound' },
    { id: 'email-tf-04', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'support@nocobase.com', to_addr: 'info@techflow.de', subject: 'Re: Datenmigration Zeitplan', body: 'For 50K records, we recommend a 2-week migration plan: Week 1 for schema mapping and test migration, Week 2 for production cutover. We can arrange a technical call this Friday.', language: '英语', direction: 'outbound' },
    { id: 'email-tf-05', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'info@techflow.de', to_addr: 'support@nocobase.com', subject: 'Lizenz-Upgrade Frage', body: 'Wir erwägen ein Upgrade auf die Enterprise-Version. Können Sie die Unterschiede zwischen Professional und Enterprise erläutern, insbesondere bezüglich der API-Limits und des Supports?', language: '德语', direction: 'inbound' },
    { id: 'email-tf-06', customer_id: 'cust-001', customer_name: 'TechFlow GmbH', from_addr: 'info@techflow.de', to_addr: 'support@nocobase.com', subject: 'Dringend: Produktionsproblem', body: 'Unsere Produktionsumgebung zeigt seit heute Morgen Fehler beim Speichern von Datensätzen. Fehlermeldung: "Transaction deadlock detected". Bitte um dringende Hilfe, da dies unsere Fertigung blockiert.', language: '德语', direction: 'inbound' },
  ];

  // GlobalTrade Ltd (cust-004) — 5 emails (English)
  const emailsGT = [
    { id: 'email-gt-01', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', from_addr: 'ops@globaltrade.uk', to_addr: 'support@nocobase.com', subject: 'Contract renewal discussion', body: 'Hi team, our annual contract is up for renewal in 60 days. We would like to discuss potential volume discounts for expanding to 3 additional offices.', language: '英语', direction: 'inbound' },
    { id: 'email-gt-02', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', from_addr: 'support@nocobase.com', to_addr: 'ops@globaltrade.uk', subject: 'Re: Contract renewal discussion', body: 'Thank you for considering expansion. For 3+ offices, we offer a 15% volume discount on Enterprise plans. I will prepare a formal proposal by Friday.', language: '英语', direction: 'outbound' },
    { id: 'email-gt-03', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', from_addr: 'ops@globaltrade.uk', to_addr: 'support@nocobase.com', subject: 'Data compliance requirements', body: 'As part of our GDPR compliance review, we need documentation about your data processing procedures, data residency options, and breach notification policies. This is blocking our renewal approval.', language: '英语', direction: 'inbound' },
    { id: 'email-gt-04', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', from_addr: 'ops@globaltrade.uk', to_addr: 'support@nocobase.com', subject: 'Custom report export format', body: 'We need to export our quarterly compliance reports in a specific XML format required by UK regulators. Can your platform support custom export templates?', language: '英语', direction: 'inbound' },
    { id: 'email-gt-05', customer_id: 'cust-004', customer_name: 'GlobalTrade Ltd', from_addr: 'support@nocobase.com', to_addr: 'ops@globaltrade.uk', subject: 'Re: Data compliance & custom exports', body: 'We have sent the GDPR documentation package to your compliance team. Regarding custom XML exports, yes we support this via our template engine. I will schedule a demo next week.', language: '英语', direction: 'outbound' },
  ];

  // Sakura Systems (cust-002) — 3 emails (Japanese)
  const emailsSK = [
    { id: 'email-sk-01', customer_id: 'cust-002', customer_name: 'Sakura Systems', from_addr: 'contact@sakura-sys.co.jp', to_addr: 'support@nocobase.com', subject: 'パートナーシップ提案', body: '弊社はNocoBaseの日本市場でのリセラーパートナーシップに興味があります。現在3社のクライアントがNocoBaseの導入を検討しています。パートナープログラムの詳細を教えていただけますか？', language: '日语', direction: 'inbound' },
    { id: 'email-sk-02', customer_id: 'cust-002', customer_name: 'Sakura Systems', from_addr: 'support@nocobase.com', to_addr: 'contact@sakura-sys.co.jp', subject: 'Re: パートナーシップ提案', body: 'Thank you for your interest in our partner program. As a top 3 channel partner, we can offer exclusive pricing and dedicated technical support. Let us arrange a call to discuss the details.', language: '英语', direction: 'outbound' },
    { id: 'email-sk-03', customer_id: 'cust-002', customer_name: 'Sakura Systems', from_addr: 'contact@sakura-sys.co.jp', to_addr: 'support@nocobase.com', subject: '技術的な質問：マルチテナント', body: 'エンタープライズ版のマルチテナント機能について質問があります。1つのインスタンスで複数のクライアント環境を完全に分離できますか？データの分離レベルはどのようになっていますか？', language: '日语', direction: 'inbound' },
  ];

  // 深圳明创 (cust-003) — 2 emails (Chinese)
  const emailsMC = [
    { id: 'email-mc-01', customer_id: 'cust-003', customer_name: '深圳明创科技', from_addr: 'support@mingchuang.cn', to_addr: 'support@nocobase.com', subject: '审批流程配置咨询', body: '你好，我们需要配置一个多级审批流程：金额<1万由部门经理审批，1-10万由总监审批，>10万由总经理审批。请问如何配置条件分支？', language: '中文', direction: 'inbound' },
    { id: 'email-mc-02', customer_id: 'cust-003', customer_name: '深圳明创科技', from_addr: 'support@nocobase.com', to_addr: 'support@mingchuang.cn', subject: 'Re: 审批流程配置咨询', body: '您好，多级审批可以通过工作流的条件节点实现。我们已经准备了详细的配置文档，稍后发送给您。如需要，可以安排远程协助。', language: '中文', direction: 'outbound' },
    { id: 'email-mc-03', customer_id: 'cust-003', customer_name: '深圳明创科技', from_addr: 'support@mingchuang.cn', to_addr: 'support@nocobase.com', subject: '库存管理模块需求', body: '你好，我们希望在现有系统上增加库存预警功能：当某个零件库存低于安全库存时自动触发采购申请。请问这个能通过工作流实现吗？需要配合哪些数据表设计？', language: '中文', direction: 'inbound' },
    { id: 'email-mc-04', customer_id: 'cust-003', customer_name: '深圳明创科技', from_addr: 'support@nocobase.com', to_addr: 'support@mingchuang.cn', subject: 'Re: 库存管理模块需求', body: '您好，库存预警完全可以通过工作流实现。建议方案：\n1. 创建"库存记录"表，包含零件名称、当前数量、安全库存字段\n2. 配置定时工作流，每天检查库存 < 安全库存的记录\n3. 触发时自动创建采购申请并通知相关人员\n\n我们下周可以安排远程演示。', language: '中文', direction: 'outbound' },
    { id: 'email-mc-05', customer_id: 'cust-003', customer_name: '深圳明创科技', from_addr: 'support@mingchuang.cn', to_addr: 'support@nocobase.com', subject: '紧急：月报数据不一致', body: '我们发现本月的采购统计报表与实际审批单数量不一致，差了3笔。怀疑与之前的审批工作流异常有关。请尽快协助排查，月报下周一需要提交给管理层。', language: '中文', direction: 'inbound' },
  ];

  // StartupHub Inc (cust-005) — 2 emails (English)
  const emailsSH = [
    { id: 'email-sh-01', customer_id: 'cust-005', customer_name: 'StartupHub Inc', from_addr: 'dev@startuphub.com', to_addr: 'support@nocobase.com', subject: 'API integration architecture review', body: 'Hi team, we are building a React Native mobile app that syncs with NocoBase. Currently using REST API but considering GraphQL. Do you have plans for GraphQL support? Also, what is the recommended approach for offline-first sync?', language: '英语', direction: 'inbound' },
    { id: 'email-sh-02', customer_id: 'cust-005', customer_name: 'StartupHub Inc', from_addr: 'support@nocobase.com', to_addr: 'dev@startuphub.com', subject: 'Re: API integration architecture review', body: 'Hi StartupHub team, great questions! GraphQL is on our 2026 Q3 roadmap. For now, REST API with our filter/include system covers most GraphQL use cases. For offline sync, we recommend: 1) Use our /changes endpoint for incremental sync 2) Implement local SQLite cache 3) Conflict resolution via last-write-wins with manual merge option.', language: '英语', direction: 'outbound' },
  ];

  const insertEmail = db.prepare('INSERT INTO emails (id, customer_id, customer_name, from_addr, to_addr, subject, body, language, direction) VALUES (@id, @customer_id, @customer_name, @from_addr, @to_addr, @subject, @body, @language, @direction)');
  for (const e of [...emailsTF, ...emailsGT, ...emailsSK, ...emailsMC, ...emailsSH]) insertEmail.run(e);

  // ---- Email Translations (auto-generated by 🌐 翻译专员) ----
  const insertTranslation = db.prepare('INSERT INTO email_translations (id, email_id, translated_text, source_lang, target_lang, model) VALUES (?, ?, ?, ?, ?, ?)');
  // German → Chinese translations
  insertTranslation.run(`et-${uid()}`, 'email-tf-01', '尊敬的先生/女士，我们想了解贵平台是否支持与SAP Business One的集成。我们使用SAP进行会计核算，需要双向数据交换。', '德语', '中文', 'gemini-2.0-flash');
  insertTranslation.run(`et-${uid()}`, 'email-tf-03', '感谢您提供的信息。我们计划下个月进行迁移。您能否建议一个实施时间表？我们在SAP中大约有50,000条记录。', '德语', '中文', 'gemini-2.0-flash');
  insertTranslation.run(`et-${uid()}`, 'email-tf-05', '我们正在考虑升级到企业版。能否说明专业版和企业版之间的区别，特别是关于API限制和支持方面？', '德语', '中文', 'gemini-2.0-flash');
  insertTranslation.run(`et-${uid()}`, 'email-tf-06', '我们的生产环境从今天早上开始在保存记录时出现错误。错误信息："Transaction deadlock detected"。请紧急帮助，这已经阻塞了我们的生产线。', '德语', '中文', 'gemini-2.0-flash');
  // Japanese → Chinese translations
  insertTranslation.run(`et-${uid()}`, 'email-sk-01', '我司对在日本市场成为NocoBase的经销商合作伙伴非常感兴趣。目前有3家客户正在考虑引入NocoBase。能否告知合作伙伴计划的详情？', '日语', '中文', 'gemini-2.0-flash');
  insertTranslation.run(`et-${uid()}`, 'email-sk-03', '关于企业版的多租户功能有一个问题。一个实例能否完全隔离多个客户环境？数据的隔离级别是怎样的？', '日语', '中文', 'gemini-2.0-flash');

  // ---- Email Summaries (auto-generated by 📧 邮件秘书, 5+ emails) ----
  const insertSummary = db.prepare('INSERT INTO email_summaries (id, customer_id, summary, email_count, model) VALUES (?, ?, ?, ?, ?)');
  insertSummary.run(`es-${uid()}`, 'cust-001',
    '## TechFlow GmbH 邮件摘要（6封）\n\n### 关键事项\n1. **SAP B1 集成需求** — 客户需要双向数据交换，已确认支持REST API和Webhook\n2. **数据迁移计划** — 约5万条记录，建议2周迁移方案（第1周测试，第2周切换），待安排技术会议\n3. **许可证升级意向** — 客户考虑从Professional升级到Enterprise，关注API限制和支持差异\n4. **🚨 生产紧急问题** — Transaction deadlock 错误导致生产线阻塞，需紧急处理\n\n### 待办\n- [ ] 回复生产环境紧急问题\n- [ ] 安排Friday技术会议讨论迁移\n- [ ] 提供Pro vs Enterprise对比文档\n\n### 商业洞察\n- 客户活跃度高，有明确的升级意向和扩展需求\n- 生产问题如不及时处理可能影响续约', 6, 'gemini-2.0-flash');
  insertSummary.run(`es-${uid()}`, 'cust-004',
    '## GlobalTrade Ltd 邮件摘要（5封）\n\n### 关键事项\n1. **合同续约** — 60天内到期，客户希望扩展到3个额外办公室，已报15%批量折扣\n2. **GDPR合规文档** — 客户需要数据处理流程、数据驻留选项和违规通知政策文档（已发送）\n3. **自定义XML导出** — UK监管要求的特定XML格式季度合规报告（支持模板引擎，待安排演示）\n\n### 待办\n- [ ] 周五前发送正式续约提案\n- [ ] 下周安排自定义导出模板演示\n- [ ] 跟进GDPR文档审核状态\n\n### 商业洞察\n- 续约+扩展意愿明确，合规是关键障碍\n- 尽快解决合规文档和导出问题可促成续约', 5, 'gemini-2.0-flash');
  insertSummary.run(`es-${uid()}`, 'cust-003',
    '## 深圳明创科技 邮件摘要（5封）\n\n### 关键事项\n1. **审批流程配置** — 需要多级审批（1万/10万分档），已提供配置文档\n2. **库存预警需求** — 希望实现零件库存低于安全值自动触发采购，已提供工作流方案\n3. **🚨 月报数据不一致** — 采购统计差3笔，疑与审批工作流异常相关，下周一截止\n\n### 待办\n- [ ] 紧急排查月报数据差异（周一截止）\n- [ ] 安排库存管理模块远程演示\n- [ ] 跟进工作流异常修复后的验证\n\n### 风险\n- 数据不一致问题如未及时解决，将严重影响客户信任\n- 客户满意度已偏低(65分)，需要超预期响应', 5, 'gemini-2.0-flash');

  // ---- Knowledge Suggestions ----
  const insertKS = db.prepare('INSERT INTO knowledge_suggestions (id, ticket_id, ticket_summary, resolution, ai_analysis, suggested_action, summary, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertKS.run(`ks-${uid()}`, 'tk-005', 'API rate limiting questions',
    'Provided API documentation link with rate limiting details.',
    '此问题涉及API基础知识，属于高频咨询(月均12次)。建议同时更新知识库和用户手册。',
    'knowledge_base', 'API限流策略：标准版100req/min，企业版500req/min',
    'API集成', 'pending');
  insertKS.run(`ks-${uid()}`, 'tk-001', 'Printer connection issue after update',
    'HP LaserJet Pro driver reinstall + Print Spooler restart resolved the issue.',
    '系统更新后HP打印机兼容性问题，已出现3次类似工单。建议写入知识库作为标准排查流程。',
    'knowledge_base', '系统更新后HP LaserJet Pro打印机连接修复流程',
    '设备维修', 'pending');
  insertKS.run(`ks-${uid()}`, 'tk-004', '工作流触发异常 — 审批金额条件失效',
    '定位到并发冲突导致条件判断跳过，已修复工作流引擎并发锁机制。',
    '这是一个严重的业务流程Bug。修复方案和排查过程有很高的知识价值，建议写入用户手册的"工作流排错指南"。',
    'user_manual', '多级审批工作流并发冲突排查与修复',
    '工作流', 'approved');

  // ---- Alerts (AI-generated pushes) ----
  const insertAlert = db.prepare('INSERT INTO alerts (id, type, source_type, source_id, title, detail, severity, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  // 🔍 情报分析师 — high-value customer
  insertAlert.run(`alert-${uid()}`, 'high_value', 'customer', 'cust-002',
    '🔍 高价值客户发现: Sakura Systems',
    '情报分析师发现：Sakura Systems 是日本Top 3渠道合作伙伴，年采购$36K，正考虑升级更多License。当前有3家客户计划引入NocoBase。建议优先安排合作伙伴会议。',
    'info', 'unread');
  // 🛡️ 合规审查员 — potential violation
  insertAlert.run(`alert-${uid()}`, 'violation', 'customer', 'cust-005',
    '🛡️ 许可证使用异常: StartupHub Inc',
    '合规审查员发现：社区版用户 StartupHub Inc 的API调用频次和数据量超出社区版限制（日均API调用2,400次，数据量12万条）。建议核实使用情况并推动升级。',
    'warning', 'unread');
  // 💰 财务核对员 — voucher mismatch
  insertAlert.run(`alert-${uid()}`, 'payment', 'order', 'ord-005',
    '💰 凭证金额不符: TechFlow GmbH (ord-005)',
    '财务核对员发现：订单金额 EUR 15,200 但凭证显示 EUR 14,800，差额 EUR 400。可能原因：客户扣除了银行手续费。建议与客户确认。',
    'warning', 'unread');
  // 😊 客户成功顾问 — churn risk
  insertAlert.run(`alert-${uid()}`, 'satisfaction', 'customer', 'cust-003',
    '😊 流失风险预警: 深圳明创科技',
    '客户成功顾问分析：满意度65分（下降趋势），近期工作流异常工单未及时解决，2封咨询邮件等待回复。建议安排客户成功经理紧急跟进。',
    'critical', 'unread');
  // 📧 邮件秘书 — urgent email
  insertAlert.run(`alert-${uid()}`, 'high_value', 'email', 'email-tf-06',
    '📧 紧急邮件提醒: TechFlow GmbH 生产阻塞',
    '邮件秘书检测到紧急邮件：TechFlow GmbH 生产环境出现 Transaction deadlock 错误，生产线已阻塞。建议立即响应。',
    'critical', 'unread');

  // ---- Pre-processed AI Results (simulating AI team execution on tickets) ----
  // This gives the demo realistic AI-filled data with purple indicators
  const insertResult = db.prepare(`
    INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
      trigger_source, trigger_user, trigger_user_id, trigger_ip, trigger_action, trigger_page_path, trigger_block_pos,
      input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (@id, @task_id, @task_name, @action, 'tickets', @record_id, @field_name,
      @trigger_source, @trigger_user, @trigger_user_id, @trigger_ip, @trigger_action, @trigger_page_path, @trigger_block_pos,
      @input_data, @prompt_used,
      @old_value, @new_value, @confidence, @model, @tokens_used, @duration_ms, @status, @raw_response)
  `);

  // tk-001: English printer issue — full AI team result
  const tk1Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-001', field_name: 'language', old_value: '', new_value: '英语', confidence: 98, model: 'gemini-2.0-flash', tokens_used: 42, duration_ms: 380, status: 'applied', raw_response: '英语' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-001', field_name: 'translated_content', old_value: '', new_value: '最新系统更新后，我们的网络打印机 HP LaserJet Pro M404 无法连接。我们已尝试重启打印后台服务和重新安装驱动程序，但问题仍然存在。这影响了我们整个办公室的25人。请紧急处理。', confidence: 95, model: 'gemini-2.0-flash', tokens_used: 186, duration_ms: 1240, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-001', field_name: 'category', old_value: '', new_value: '设备维修', confidence: 96, model: 'gemini-2.0-flash', tokens_used: 28, duration_ms: 310, status: 'applied', raw_response: '设备维修' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-001', field_name: 'priority', old_value: '', new_value: 'P1-紧急', confidence: 92, model: 'gemini-2.0-flash', tokens_used: 35, duration_ms: 290, status: 'applied', raw_response: 'P1-紧急' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-001', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Dear TechFlow GmbH,\n\nThank you for reporting this issue. We understand the urgency as it affects your entire office.\n\nOur technical team has identified this as a known issue with the latest update affecting HP LaserJet Pro series. Please try:\n1. Run "sfc /scannow" in Command Prompt (Admin)\n2. Download the latest HP Universal Print Driver from hp.com\n3. Restart the Print Spooler service\n\nIf the issue persists, we will arrange a remote session within 2 hours.\n\nBest regards,\nSupport Team', zh: '感谢报告此问题。我们理解这对贵办公室25人的影响。技术团队已确认这是最新更新影响HP LaserJet Pro系列的已知问题。提供3步排查方案，如仍有问题将安排远程支持。' },
      { tone: '温和', emoji: '🤝', reply: 'Dear TechFlow GmbH,\n\nWe\'re really sorry to hear about the printer troubles — we know how frustrating it must be with 25 people affected!\n\nThe good news is we\'ve seen this before with the latest update and HP LaserJet Pro models. Here are a few things that usually help:\n1. Run "sfc /scannow" in Command Prompt\n2. Grab the latest driver from hp.com\n3. Restart the Print Spooler service\n\nIf none of that does the trick, just let us know and we\'ll hop on a remote session right away.\n\nHang in there!\nSupport Team', zh: '对打印机问题表示歉意，理解25人受影响的困扰。好消息是这是已知问题，提供3步方案。如不行随时联系，会立即远程协助。语气更亲切轻松。' },
      { tone: '简洁', emoji: '⚡', reply: 'Hi TechFlow,\n\nKnown issue with HP LaserJet Pro + latest update. Fix:\n1. Admin CMD → sfc /scannow\n2. Update driver: hp.com\n3. Restart Print Spooler\n\nStill broken? We\'ll remote in within 2h.\n\nSupport Team', zh: '直接给出解决方案，不做过多寒暄。3步修复 + 兜底方案。适合技术型客户。' },
    ]), confidence: 88, model: 'gemini-2.0-flash', tokens_used: 320, duration_ms: 2800, status: 'pending', raw_response: '' },
  ];

  // tk-002: Japanese license inquiry
  const tk2Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-002', field_name: 'language', old_value: '', new_value: '日语', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 38, duration_ms: 350, status: 'applied', raw_response: '日语' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-002', field_name: 'translated_content', old_value: '', new_value: '我们目前使用专业版，正在考虑升级到企业版。能否告知升级步骤和价格？另外，数据迁移是否能顺利进行？', confidence: 94, model: 'gemini-2.0-flash', tokens_used: 142, duration_ms: 980, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-002', field_name: 'category', old_value: '', new_value: '许可证问题', confidence: 97, model: 'gemini-2.0-flash', tokens_used: 26, duration_ms: 280, status: 'applied', raw_response: '许可证问题' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-002', field_name: 'priority', old_value: '', new_value: 'P3-中', confidence: 90, model: 'gemini-2.0-flash', tokens_used: 30, duration_ms: 260, status: 'applied', raw_response: 'P3-中' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-002', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Sakura Systems 様\n\nお問い合わせいただきありがとうございます。\n\nプロフェッショナル版からエンタープライズ版へのアップグレードについて：\n1. アップグレード手順：管理画面 → ライセンス → アップグレード申請\n2. 価格：年額 $12,800 → $36,500（差額のみ）\n3. データ移行：完全自動で、ダウンタイムは約30分です\n\n詳細なお見積りをお送りしましょうか？', zh: '关于从专业版升级到企业版：1. 管理后台申请 2. 年费差额 $23,700 3. 数据自动迁移约30分钟。询问是否需要详细报价。' },
      { tone: '热情', emoji: '🌟', reply: 'Sakura Systems 様\n\nお問い合わせありがとうございます！エンタープライズ版、素晴らしい選択ですね！\n\nアップグレードはとても簡単です：\n1. 管理画面からワンクリックで申請\n2. 差額のみのお支払い（年額 $23,700）\n3. データ移行は完全自動 — 約30分で完了！\n\nぜひお見積りをお送りさせてください。ご不明点があればいつでもお気軽にどうぞ！', zh: '热情推荐企业版升级，强调操作简单，语气积极。主动提供报价，欢迎随时咨询。' },
    ]), confidence: 85, model: 'gemini-2.0-flash', tokens_used: 380, duration_ms: 3200, status: 'pending', raw_response: '' },
  ];

  // tk-003: English export issue (in_progress)
  const tk3Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-003', field_name: 'language', old_value: '', new_value: '英语', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 40, duration_ms: 340, status: 'applied', raw_response: '英语' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-003', field_name: 'category', old_value: '', new_value: '数据问题', confidence: 94, model: 'gemini-2.0-flash', tokens_used: 32, duration_ms: 320, status: 'applied', raw_response: '数据问题' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-003', field_name: 'priority', old_value: '', new_value: 'P2-高', confidence: 91, model: 'gemini-2.0-flash', tokens_used: 33, duration_ms: 300, status: 'applied', raw_response: 'P2-高' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-003', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Dear GlobalTrade team,\n\nWe understand the urgency with your compliance report deadline.\n\nFor large exports (50K+ records), we recommend:\n1. Use the async export API: POST /api/export/async\n2. Split into batches of 10,000 records\n3. We have increased your timeout to 600s\n\nAlternatively, our team can generate the export directly. Shall we proceed?\n\nBest regards,\nSupport Team', zh: '针对5万+记录导出超时，提供3种方案：异步API、分批导出、已提升超时限制。也可以由团队直接导出。' },
      { tone: '紧急', emoji: '🚨', reply: 'Hi GlobalTrade,\n\nGot it — compliance deadline, can\'t wait. Here\'s the fastest path:\n\n→ POST /api/export/async with your filters\n→ We\'ve already bumped your timeout to 600s\n→ If still stuck, reply and we\'ll generate it for you within 1 hour\n\nLet us know which option works.\n\nSupport Team', zh: '理解合规截止日期紧迫。直接给最快路径，已提升超时，承诺1小时内兜底。语气高效果断。' },
    ]), confidence: 87, model: 'gemini-2.0-flash', tokens_used: 290, duration_ms: 2500, status: 'pending', raw_response: '' },
  ];

  // tk-004: Chinese workflow issue
  const tk4Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-004', field_name: 'language', old_value: '', new_value: '中文', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 35, duration_ms: 290, status: 'applied', raw_response: '中文' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-004', field_name: 'category', old_value: '', new_value: '软件问题', confidence: 93, model: 'gemini-2.0-flash', tokens_used: 30, duration_ms: 310, status: 'applied', raw_response: '软件问题' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-004', field_name: 'priority', old_value: '', new_value: 'P1-紧急', confidence: 95, model: 'gemini-2.0-flash', tokens_used: 28, duration_ms: 270, status: 'applied', raw_response: 'P1-紧急' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-004', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: '明创科技您好，\n\n感谢反馈工作流触发异常的问题。这是一个严重的业务风险，我们会优先处理。\n\n初步分析：\n1. 可能原因：审批金额条件判断存在并发冲突\n2. 临时措施：建议暂时将大额采购人工审批\n3. 我们的工程师将在2小时内远程排查\n\n请提供最近出问题的两笔采购单号，我们将进行详细分析。\n\n技术支持团队', zh: '确认问题严重性，初步分析原因，给临时措施和排查计划，请客户提供单号配合。' },
      { tone: '安抚', emoji: '🛡️', reply: '明创科技您好，\n\n非常理解您的担忧——审批流程异常确实可能造成损失，请放心，我们已将此问题升级为最高优先级。\n\n我们已经做了以下措施：\n1. ✅ 已通知核心工程师，预计2小时内排查\n2. ✅ 建议临时开启大额采购人工审批（金额 > ¥50,000）\n3. ✅ 会在排查后出具详细报告\n\n为了加快定位，麻烦提供最近出问题的采购单号。我们会全程跟进直到彻底解决。\n\n技术支持团队', zh: '强调已升级优先级，用✅标注已采取的措施让客户安心，承诺全程跟进和事后报告。语气更具安抚性。' },
      { tone: '简洁', emoji: '⚡', reply: '明创科技您好，\n\n已收到工作流异常反馈，优先处理中。\n\n临时方案：大额采购先走人工审批。\n工程师2小时内远程排查，请提供出问题的采购单号。\n\n技术支持团队', zh: '直奔主题，临时方案+排查时间+需要的信息，三句话解决。' },
    ]), confidence: 90, model: 'gemini-2.0-flash', tokens_used: 260, duration_ms: 2100, status: 'pending', raw_response: '' },
  ];

  // Also update ticket fields with AI results
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('设备维修', 'P1-紧急', 'tk-001');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('许可证问题', 'P3-中', 'tk-002');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('数据问题', 'P2-高', 'tk-003');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('软件问题', 'P1-紧急', 'tk-004');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('软件问题', 'P2-高', 'tk-006');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('功能咨询', 'P3-中', 'tk-007');
  db.prepare('UPDATE tickets SET category = ?, priority = ? WHERE id = ?').run('软件问题', 'P2-高', 'tk-008');

  // tk-005: Resolved — knowledge action pending (produced by workflow 2)
  const tk5Results = [
    { id: `res-${uid()}`, task_id: 'task-knowledge', task_name: '知识管家', action: 'decide', record_id: 'tk-005', field_name: 'next_action', old_value: '', new_value: JSON.stringify({
      workflow_id: wf2Id, workflow_name: '工单知识积累',
      summary: 'API 限流策略说明：标准限制 100 req/min，企业版可申请提升至 500 req/min，超限返回 429 状态码，建议客户端实现指数退避重试。',
      reason: '此问题涉及 API 集成基础知识，属于高频咨询问题，适合写入知识库和使用手册。',
      suggested_action: 'knowledge_base',
      category: 'API 集成',
      kb_title: 'API 限流策略与最佳实践',
      kb_content: '## API 限流策略\n\n### 限流规则\n- 标准版：100 req/min\n- 企业版：500 req/min（需申请）\n- 超限响应：HTTP 429 Too Many Requests\n\n### 客户端最佳实践\n1. 实现指数退避重试（初始 1s，最大 30s）\n2. 使用 X-RateLimit-Remaining 头检测余量\n3. 批量操作使用异步 API\n\n### 常见问题\n- Q: 如何申请提升限额？\n  A: 管理后台 → API 设置 → 限额申请',
      manual_section: '开发者指南 > API 参考 > 限流与配额',
      manual_content: '### 限流说明\n\n您的 API 请求受到以下限制：\n- **标准版**：每分钟 100 次请求\n- **企业版**：每分钟 500 次请求\n\n超过限制时，API 将返回 `429 Too Many Requests`。建议在代码中加入重试机制。\n\n详见 [API 限流最佳实践](/docs/api/rate-limiting)。',
    }), confidence: 92, model: 'gemini-2.0-flash', tokens_used: 450, duration_ms: 3200, status: 'pending', raw_response: '' },
  ];

  // tk-006: Japanese multi-tenant performance issue
  const tk6Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-006', field_name: 'language', old_value: '', new_value: '日语', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 36, duration_ms: 320, status: 'applied', raw_response: '日语' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-006', field_name: 'translated_content', old_value: '', new_value: '3家客户环境在同一实例上运行，但在高峰时段（日本时间9:00-11:00）响应显著下降。尤其是仪表盘加载有时超过10秒。请问是否有各租户的资源限制设置？', confidence: 94, model: 'gemini-2.0-flash', tokens_used: 158, duration_ms: 1100, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-006', field_name: 'category', old_value: '', new_value: '软件问题', confidence: 91, model: 'gemini-2.0-flash', tokens_used: 30, duration_ms: 290, status: 'applied', raw_response: '软件问题' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-006', field_name: 'priority', old_value: '', new_value: 'P2-高', confidence: 89, model: 'gemini-2.0-flash', tokens_used: 32, duration_ms: 280, status: 'applied', raw_response: 'P2-高' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-006', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Sakura Systems 様\n\nマルチテナント環境のパフォーマンス問題について、ご報告ありがとうございます。\n\nピーク時のパフォーマンス低下に対して、以下の対策をご提案いたします：\n1. テナントごとのリソース制限：管理画面 → システム設定 → テナント管理で設定可能です\n2. ダッシュボードキャッシュ：キャッシュTTLを5分に設定することで読み込み時間を短縮できます\n3. インスタンスのスケーリング：ピーク時の自動スケーリング設定を推奨します\n\n詳細な分析のため、パフォーマンスログの共有をお願いできますか？\n\nサポートチーム', zh: '针对多租户性能问题，提供3种方案：租户资源限制配置、仪表盘缓存优化、实例自动扩展。请求共享性能日志进行详细分析。' },
      { tone: '温和', emoji: '🤝', reply: 'Sakura Systems 様\n\nパフォーマンスの問題でご不便をおかけして申し訳ございません。\n\nご安心ください。マルチテナント環境でのリソース管理は十分に対応可能です：\n1. テナント別のCPU/メモリ制限が設定できます\n2. ダッシュボードのキャッシュ機能で読み込みを高速化\n3. 必要に応じて自動スケーリングも設定可能です\n\nまずはパフォーマンスログを拝見させていただければ、最適な設定をご提案いたします。\n\nサポートチーム', zh: '对性能问题表示歉意，语气亲和。说明资源管理完全可控，提供3种方案并请求日志以便给出最优配置建议。' },
    ]), confidence: 86, model: 'gemini-2.0-flash', tokens_used: 340, duration_ms: 3000, status: 'pending', raw_response: '' },
  ];

  // tk-007: English report scheduling
  const tk7Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-007', field_name: 'language', old_value: '', new_value: '英语', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 38, duration_ms: 330, status: 'applied', raw_response: '英语' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-007', field_name: 'category', old_value: '', new_value: '功能咨询', confidence: 95, model: 'gemini-2.0-flash', tokens_used: 29, duration_ms: 270, status: 'applied', raw_response: '功能咨询' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-007', field_name: 'priority', old_value: '', new_value: 'P3-中', confidence: 88, model: 'gemini-2.0-flash', tokens_used: 31, duration_ms: 260, status: 'applied', raw_response: 'P3-中' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-007', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Dear GlobalTrade team,\n\nGreat news — automated report scheduling is fully supported in our workflow system.\n\nHere\'s how to set it up:\n1. Go to Workflows → Create New → Scheduled Trigger\n2. Set schedule: Every Monday at 8:00 AM GMT\n3. Add report blocks:\n   - New Customer Acquisitions (filter: created_at >= last 7 days)\n   - Revenue by Region (aggregation: SUM by region field)\n   - Outstanding Invoices > 30 days (filter: due_date < today - 30 AND status != paid)\n4. Add Email Action: select recipients and template\n\nWe can also arrange a 30-minute walkthrough session if you prefer hands-on guidance.\n\nBest regards,\nSupport Team', zh: '确认自动报表调度功能可用，提供4步配置指南，涵盖定时触发、3种报表数据源和邮件发送。可以安排远程指导。' },
      { tone: '简洁', emoji: '⚡', reply: 'Hi GlobalTrade,\n\nYes, fully supported. Quick setup:\n\nWorkflows → Scheduled Trigger → Monday 8am GMT → add 3 report blocks (new customers, revenue by region, overdue invoices) → Email action to your team.\n\nNeed a walkthrough? Let us know.\n\nSupport Team', zh: '直接确认可行，一句话概括配置路径。询问是否需要指导。适合技术型客户。' },
    ]), confidence: 87, model: 'gemini-2.0-flash', tokens_used: 300, duration_ms: 2600, status: 'pending', raw_response: '' },
  ];

  // tk-008: English webhook payload issue (in_progress)
  const tk8Results = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '翻译专员', action: 'translate', record_id: 'tk-008', field_name: 'language', old_value: '', new_value: '英语', confidence: 99, model: 'gemini-2.0-flash', tokens_used: 40, duration_ms: 340, status: 'applied', raw_response: '英语' },
    { id: `res-${uid()}`, task_id: 'task-classify', task_name: '分类专员', action: 'classify', record_id: 'tk-008', field_name: 'category', old_value: '', new_value: '软件问题', confidence: 93, model: 'gemini-2.0-flash', tokens_used: 31, duration_ms: 300, status: 'applied', raw_response: '软件问题' },
    { id: `res-${uid()}`, task_id: 'task-priority', task_name: '优先级顾问', action: 'decide', record_id: 'tk-008', field_name: 'priority', old_value: '', new_value: 'P2-高', confidence: 90, model: 'gemini-2.0-flash', tokens_used: 33, duration_ms: 290, status: 'applied', raw_response: 'P2-高' },
    { id: `res-${uid()}`, task_id: 'task-reply-gen', task_name: '回复助手', action: 'generate', record_id: 'tk-008', field_name: 'reply_draft', old_value: '', new_value: JSON.stringify([
      { tone: '专业', emoji: '💼', reply: 'Dear StartupHub team,\n\nThank you for reporting the webhook payload size issue.\n\nWe have two solutions available:\n1. **Payload filtering**: In webhook settings, you can exclude specific fields including attachments:\n   Settings → Webhooks → Edit → Payload Fields → uncheck "attachments"\n2. **Payload size limit**: Add `max_payload_size: 512000` (512KB) to your webhook config\n3. **Reference mode**: Enable "reference only" for file fields — the webhook will include download URLs instead of base64 data\n\nOption 3 is recommended as it keeps your payloads lightweight while still providing access to attachments.\n\nLet us know if you need help with the configuration.\n\nBest regards,\nSupport Team', zh: '针对webhook载荷过大问题，提供3种方案：字段过滤排除附件、载荷大小限制、附件引用模式（推荐）。建议使用引用模式保持载荷轻量同时保留附件访问能力。' },
      { tone: '简洁', emoji: '⚡', reply: 'Hi StartupHub,\n\nQuick fix: Webhook settings → uncheck "attachments" in payload fields, or set `max_payload_size: 512000`.\n\nBetter fix: Enable "reference only" for file fields — sends download URLs instead of raw data.\n\nSupport Team', zh: '快速方案：取消附件字段或设大小限制。推荐方案：启用文件引用模式。简洁高效。' },
    ]), confidence: 89, model: 'gemini-2.0-flash', tokens_used: 310, duration_ms: 2700, status: 'pending', raw_response: '' },
  ];

  for (const r of [...tk1Results, ...tk2Results, ...tk3Results, ...tk4Results, ...tk5Results, ...tk6Results, ...tk7Results, ...tk8Results]) insertResult.run(enrichResult(r, 'tickets', 'workflow', `工单列表/${r.field_name}`));

  // ---- Customer AI Results (page_id = 'customers') ----
  const insertCustResult = db.prepare(`
    INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
      trigger_source, trigger_user, trigger_user_id, trigger_ip, trigger_action, trigger_page_path, trigger_block_pos,
      input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (@id, @task_id, @task_name, @action, 'customers', @record_id, @field_name,
      @trigger_source, @trigger_user, @trigger_user_id, @trigger_ip, @trigger_action, @trigger_page_path, @trigger_block_pos,
      @input_data, @prompt_used,
      @old_value, @new_value, @confidence, @model, @tokens_used, @duration_ms, @status, @raw_response)
  `);

  // cust-001 TechFlow GmbH
  const cust1Results = [
    { id: `res-${uid()}`, task_id: 'task-customer-bg', task_name: '\u{1F50D} \u60C5\u62A5\u5206\u6790\u5E08', action: 'investigate', record_id: 'cust-001', field_name: 'background', old_value: '', new_value: 'TechFlow GmbH \u662F\u5FB7\u56FD\u6155\u5C3C\u9ED1\u7684\u4E2D\u578B\u5236\u9020\u4E1A\u8F6F\u4EF6\u516C\u53F8\uFF0C\u6210\u7ACB\u4E8E2015\u5E74\uFF0C\u5458\u5DE5\u7EA6120\u4EBA\u3002\u4E3B\u8425ERP/MES\u96C6\u6210\u65B9\u6848\uFF0C\u5BA2\u6237\u7FA4\u4F53\u4E3A\u5FB7\u8BED\u533A\u4E2D\u5C0F\u5236\u9020\u4F01\u4E1A\u3002\u5F53\u524D\u4F7F\u7528SAP Business One\u505AERP\uFF0C\u6B63\u5728\u8BC4\u4F30NocoBase\u4F5C\u4E3A\u5185\u90E8\u8FD0\u8425\u7CFB\u7EDF\u3002\u5DF2\u786E\u8BA4\u6709SAP\u96C6\u6210\u9700\u6C42\u548C\u6570\u636E\u8FC1\u79FB\u8BA1\u5212\u3002', confidence: 88, model: 'gemini-2.0-flash', tokens_used: 280, duration_ms: 2100, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-satisfaction', task_name: '\u{1F60A} \u5BA2\u6237\u6210\u529F\u987E\u95EE', action: 'decide', record_id: 'cust-001', field_name: 'satisfaction_insight', old_value: '', new_value: '\u5BA2\u6237\u6D3B\u8DC3\u5EA6\u9AD8\uFF0C\u6EE1\u610F\u5EA6\u826F\u597D\u3002\u5EFA\u8BAE\u63A8\u52A8\u5347\u7EA7\u9500\u552E\u6216\u63A8\u8350\u8BA1\u5212\u3002\u6CE8\u610F\uFF1A\u751F\u4EA7\u73AF\u5883\u6B7B\u9501\u95EE\u9898\u5982\u672A\u53CA\u65F6\u89E3\u51B3\u53EF\u80FD\u5F71\u54CD\u7EED\u7EA6\u3002', confidence: 85, model: 'gemini-2.0-flash', tokens_used: 120, duration_ms: 890, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-violation', task_name: '\u{1F6E1}\uFE0F \u5408\u89C4\u5BA1\u67E5\u5458', action: 'validate', record_id: 'cust-001', field_name: 'compliance_check', old_value: '', new_value: '\u4F01\u4E1A\u7248\u6388\u6743\u6709\u6548\u3002\u5DE5\u5355\u9891\u7387\u8F83\u9AD8\uFF0C\u5EFA\u8BAE\u68C0\u67E5\u662F\u5426\u9700\u8981\u989D\u5916\u57F9\u8BAD\u652F\u6301\u3002', confidence: 92, model: 'gemini-2.0-flash', tokens_used: 85, duration_ms: 650, status: 'applied', raw_response: '' },
  ];
  // cust-002 Sakura Systems
  const cust2Results = [
    { id: `res-${uid()}`, task_id: 'task-customer-bg', task_name: '\u{1F50D} \u60C5\u62A5\u5206\u6790\u5E08', action: 'investigate', record_id: 'cust-002', field_name: 'background', old_value: '', new_value: 'Sakura Systems \u662F\u65E5\u672C\u4E1C\u4EAC\u7684IT\u89E3\u51B3\u65B9\u6848\u63D0\u4F9B\u5546\uFF0C\u662FNocoBase\u65E5\u672CTop 3\u6E20\u9053\u5408\u4F5C\u4F19\u4F34\u3002\u5F53\u524D\u67093\u5BB6\u5BA2\u6237\u8BA1\u5212\u5F15\u5165NocoBase\u3002\u5E74\u91C7\u8D2D$36K\uFF0C\u6B63\u8003\u8651\u5347\u7EA7\u66F4\u591ALicense\u3002\u5EFA\u8BAE\u4F18\u5148\u5B89\u6392\u5408\u4F5C\u4F19\u4F34\u4F1A\u8BAE\u3002', confidence: 90, model: 'gemini-2.0-flash', tokens_used: 310, duration_ms: 2400, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-satisfaction', task_name: '\u{1F60A} \u5BA2\u6237\u6210\u529F\u987E\u95EE', action: 'decide', record_id: 'cust-002', field_name: 'satisfaction_insight', old_value: '', new_value: '\u5BA2\u6237\u6EE1\u610F\u5EA6\u8F83\u9AD8(85\u5206)\uFF0C\u662F\u6838\u5FC3\u6E20\u9053\u5408\u4F5C\u4F19\u4F34\u3002\u5EFA\u8BAE\u63D0\u4F9B\u5408\u4F5C\u4F19\u4F34\u4E13\u5C5E\u652F\u6301\uFF0C\u52A0\u5FEB\u591A\u79DF\u6237\u529F\u80FD\u56DE\u590D\u3002', confidence: 87, model: 'gemini-2.0-flash', tokens_used: 95, duration_ms: 720, status: 'pending', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-violation', task_name: '\u{1F6E1}\uFE0F \u5408\u89C4\u5BA1\u67E5\u5458', action: 'validate', record_id: 'cust-002', field_name: 'compliance_check', old_value: '', new_value: '\u4E13\u4E1A\u7248\u6388\u6743\u6709\u6548\u3002\u5F53\u524D\u7528\u91CF\u5339\u914D\u5EA6\u826F\u597D\uFF0C\u4F46\u591A\u79DF\u6237\u9700\u6C42\u53EF\u80FD\u9700\u5347\u7EA7\u4F01\u4E1A\u7248\u3002', confidence: 91, model: 'gemini-2.0-flash', tokens_used: 78, duration_ms: 580, status: 'applied', raw_response: '' },
  ];
  // cust-003 \u6DF1\u5733\u660E\u521B\u79D1\u6280
  const cust3Results = [
    { id: `res-${uid()}`, task_id: 'task-customer-bg', task_name: '\u{1F50D} \u60C5\u62A5\u5206\u6790\u5E08', action: 'investigate', record_id: 'cust-003', field_name: 'background', old_value: '', new_value: '\u6DF1\u5733\u660E\u521B\u79D1\u6280\u662F\u56FD\u5185\u4E2D\u578B\u5236\u9020\u4F01\u4E1A\uFF0C\u4E3B\u8425\u7535\u5B50\u5143\u5668\u4EF6\u3002\u4F7F\u7528NocoBase\u4F5C\u4E3A\u91C7\u8D2D\u5BA1\u6279\u7CFB\u7EDF\u3002\u8FD1\u671F\u5DE5\u4F5C\u6D41\u5F02\u5E38\u5BFC\u81F4\u5BA1\u6279\u6D41\u7A0B\u53D7\u963B\uFF0C\u5BA2\u6237\u6EE1\u610F\u5EA665\u5206\uFF08\u4E0B\u964D\u8D8B\u52BF\uFF09\u3002', confidence: 86, model: 'qwen-max', tokens_used: 250, duration_ms: 1800, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-satisfaction', task_name: '\u{1F60A} \u5BA2\u6237\u6210\u529F\u987E\u95EE', action: 'decide', record_id: 'cust-003', field_name: 'satisfaction_insight', old_value: '', new_value: '\u{26A0}\uFE0F \u6D41\u5931\u98CE\u9669\u9884\u8B66\uFF01\u6EE1\u610F\u5EA665\u5206\uFF08\u4E0B\u964D\u8D8B\u52BF\uFF09\uFF0C\u8FD1\u671F\u5DE5\u4F5C\u6D41\u5F02\u5E38\u5DE5\u5355\u672A\u53CA\u65F6\u89E3\u51B3\uFF0C2\u5C01\u54A8\u8BE2\u90AE\u4EF6\u7B49\u5F85\u56DE\u590D\u3002\u5EFA\u8BAE\u5B89\u6392\u5BA2\u6237\u6210\u529F\u7ECF\u7406\u7D27\u6025\u8DDF\u8FDB\u3002', confidence: 93, model: 'gemini-2.0-flash', tokens_used: 140, duration_ms: 1050, status: 'pending', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-violation', task_name: '\u{1F6E1}\uFE0F \u5408\u89C4\u5BA1\u67E5\u5458', action: 'validate', record_id: 'cust-003', field_name: 'compliance_check', old_value: '', new_value: '\u4F01\u4E1A\u7248\u6388\u6743\u6709\u6548\u3002\u7528\u91CF\u6B63\u5E38\u3002', confidence: 95, model: 'gemini-2.0-flash', tokens_used: 45, duration_ms: 380, status: 'applied', raw_response: '' },
  ];
  // cust-005 StartupHub Inc
  const cust5Results = [
    { id: `res-${uid()}`, task_id: 'task-customer-bg', task_name: '\u{1F50D} \u60C5\u62A5\u5206\u6790\u5E08', action: 'investigate', record_id: 'cust-005', field_name: 'background', old_value: '', new_value: 'StartupHub Inc \u662F\u7F8E\u56FD\u521D\u521B\u516C\u53F8\uFF0C\u4F7F\u7528\u793E\u533A\u7248\u3002\u65E5\u5747API\u8C03\u75282,400\u6B21\uFF0C\u6570\u636E\u91CF12\u4E07\u6761\uFF0C\u8D85\u51FA\u793E\u533A\u7248\u9650\u5236\u3002\u5177\u5907\u5347\u7EA7\u6F5C\u529B\u3002', confidence: 89, model: 'gemini-2.0-flash', tokens_used: 200, duration_ms: 1500, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-violation', task_name: '\u{1F6E1}\uFE0F \u5408\u89C4\u5BA1\u67E5\u5458', action: 'validate', record_id: 'cust-005', field_name: 'compliance_check', old_value: '', new_value: '\u{26A0}\uFE0F \u793E\u533A\u7248\u7528\u6237\u4F7F\u7528\u8D85\u9650\uFF01\u65E5\u5747API\u8C03\u75282,400\u6B21\uFF08\u9650\u5236500\u6B21\uFF09\uFF0C\u6570\u636E\u91CF12\u4E07\u6761\uFF08\u9650\u52361\u4E07\u6761\uFF09\u3002\u5EFA\u8BAE\u6838\u5B9E\u4F7F\u7528\u60C5\u51B5\u5E76\u63A8\u52A8\u5347\u7EA7\u3002', confidence: 94, model: 'gemini-2.0-flash', tokens_used: 110, duration_ms: 820, status: 'pending', raw_response: '' },
  ];

  for (const r of [...cust1Results, ...cust2Results, ...cust3Results, ...cust5Results]) insertCustResult.run(enrichResult(r, 'customers', 'schedule', `客户管理/${r.field_name}`));

  // ---- Order AI Results (page_id = 'orders') ----
  const insertOrdResult = db.prepare(`
    INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
      trigger_source, trigger_user, trigger_user_id, trigger_ip, trigger_action, trigger_page_path, trigger_block_pos,
      input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (@id, @task_id, @task_name, @action, 'orders', @record_id, @field_name,
      @trigger_source, @trigger_user, @trigger_user_id, @trigger_ip, @trigger_action, @trigger_page_path, @trigger_block_pos,
      @input_data, @prompt_used,
      @old_value, @new_value, @confidence, @model, @tokens_used, @duration_ms, @status, @raw_response)
  `);

  // ord-003 already analyzed
  const ord3Results = [
    { id: `res-${uid()}`, task_id: 'task-voucher', task_name: '\u{1F4B0} \u8D22\u52A1\u6838\u5BF9\u5458', action: 'validate', record_id: 'ord-003', field_name: 'voucher_analysis', old_value: '', new_value: '{"match":true,"confidence":96,"voucher_amount":"CNY 88,000","voucher_payer":"\u6DF1\u5733\u660E\u521B\u79D1\u6280\u6709\u9650\u516C\u53F8","discrepancies":[],"recommendation":"\u51ED\u8BC1\u4E0E\u8BA2\u5355\u5339\u914D\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u4ED8\u6B3E\u3002"}', confidence: 96, model: 'gemini-2.0-flash', tokens_used: 180, duration_ms: 1400, status: 'applied', raw_response: '' },
  ];
  // ord-005 has mismatch
  const ord5Results = [
    { id: `res-${uid()}`, task_id: 'task-voucher', task_name: '\u{1F4B0} \u8D22\u52A1\u6838\u5BF9\u5458', action: 'validate', record_id: 'ord-005', field_name: 'voucher_analysis', old_value: '', new_value: '{"match":false,"confidence":72,"voucher_amount":"EUR 14,800","voucher_payer":"TechFlow GmbH","discrepancies":["\u8BA2\u5355\u91D1\u989D EUR 15,200 \u4E0E\u51ED\u8BC1\u91D1\u989D EUR 14,800 \u5DEE\u989D EUR 400","\u53EF\u80FD\u539F\u56E0\uFF1A\u5BA2\u6237\u6263\u9664\u4E86\u94F6\u884C\u624B\u7EED\u8D39"],"recommendation":"\u5EFA\u8BAE\u4E0E\u5BA2\u6237\u786E\u8BA4\u5DEE\u989D\u539F\u56E0\uFF0C\u786E\u8BA4\u540E\u53EF\u624B\u52A8\u6807\u8BB0\u4ED8\u6B3E\u3002"}', confidence: 72, model: 'gemini-2.0-flash', tokens_used: 220, duration_ms: 1800, status: 'pending', raw_response: '' },
  ];

  for (const r of [...ord3Results, ...ord5Results]) insertOrdResult.run(enrichResult(r, 'orders', 'frontend', `订单管理/凭证上传`));

  // ---- Email Translation AI Results (page_id = 'emails') ----
  const insertEmailResult = db.prepare(`
    INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
      trigger_source, trigger_user, trigger_user_id, trigger_ip, trigger_action, trigger_page_path, trigger_block_pos,
      input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (@id, @task_id, @task_name, @action, 'emails', @record_id, @field_name,
      @trigger_source, @trigger_user, @trigger_user_id, @trigger_ip, @trigger_action, @trigger_page_path, @trigger_block_pos,
      @input_data, @prompt_used,
      @old_value, @new_value, @confidence, @model, @tokens_used, @duration_ms, @status, @raw_response)
  `);

  const emailTransResults = [
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-tf-01', field_name: 'translation', old_value: '', new_value: '\u5C0A\u6562\u7684\u5148\u751F/\u5973\u58EB\uFF0C\u6211\u4EEC\u60F3\u4E86\u89E3\u8D35\u5E73\u53F0\u662F\u5426\u652F\u6301\u4E0ESAP Business One\u7684\u96C6\u6210\u3002', confidence: 95, model: 'gemini-2.0-flash', tokens_used: 86, duration_ms: 680, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-tf-03', field_name: 'translation', old_value: '', new_value: '\u611F\u8C22\u60A8\u63D0\u4F9B\u7684\u4FE1\u606F\u3002\u6211\u4EEC\u8BA1\u5212\u4E0B\u4E2A\u6708\u8FDB\u884C\u8FC1\u79FB\u3002', confidence: 94, model: 'gemini-2.0-flash', tokens_used: 92, duration_ms: 720, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-tf-05', field_name: 'translation', old_value: '', new_value: '\u6211\u4EEC\u6B63\u5728\u8003\u8651\u5347\u7EA7\u5230\u4F01\u4E1A\u7248\u3002\u80FD\u5426\u8BF4\u660E\u4E13\u4E1A\u7248\u548C\u4F01\u4E1A\u7248\u4E4B\u95F4\u7684\u533A\u522B\uFF1F', confidence: 93, model: 'gemini-2.0-flash', tokens_used: 78, duration_ms: 610, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-tf-06', field_name: 'translation', old_value: '', new_value: '\u6211\u4EEC\u7684\u751F\u4EA7\u73AF\u5883\u51FA\u73B0Transaction deadlock\u9519\u8BEF\uFF0C\u751F\u4EA7\u7EBF\u5DF2\u963B\u585E\u3002\u8BF7\u7D27\u6025\u5E2E\u52A9\u3002', confidence: 96, model: 'gemini-2.0-flash', tokens_used: 104, duration_ms: 780, status: 'pending', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-sk-01', field_name: 'translation', old_value: '', new_value: '\u6211\u53F8\u5BF9\u5728\u65E5\u672C\u5E02\u573A\u6210\u4E3ANocoBase\u7684\u7ECF\u9500\u5546\u5408\u4F5C\u4F19\u4F34\u975E\u5E38\u611F\u5174\u8DA3\u3002', confidence: 92, model: 'gemini-2.0-flash', tokens_used: 98, duration_ms: 750, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-translate', task_name: '\u{1F310} \u7FFB\u8BD1\u4E13\u5458', action: 'translate', record_id: 'email-sk-03', field_name: 'translation', old_value: '', new_value: '\u5173\u4E8E\u4F01\u4E1A\u7248\u7684\u591A\u79DF\u6237\u529F\u80FD\u6709\u4E00\u4E2A\u95EE\u9898\u3002', confidence: 91, model: 'gemini-2.0-flash', tokens_used: 72, duration_ms: 560, status: 'applied', raw_response: '' },
  ];

  for (const r of emailTransResults) insertEmailResult.run(enrichResult(r, 'emails', 'workflow', `邮件管理/翻译`));

  // ---- Email Summary AI Results (page_id = 'email-summaries') ----
  const insertSumResult = db.prepare(`
    INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
      trigger_source, trigger_user, trigger_user_id, trigger_ip, trigger_action, trigger_page_path, trigger_block_pos,
      input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (@id, @task_id, @task_name, @action, 'email-summaries', @record_id, @field_name,
      @trigger_source, @trigger_user, @trigger_user_id, @trigger_ip, @trigger_action, @trigger_page_path, @trigger_block_pos,
      @input_data, @prompt_used,
      @old_value, @new_value, @confidence, @model, @tokens_used, @duration_ms, @status, @raw_response)
  `);

  const sumResults = [
    { id: `res-${uid()}`, task_id: 'task-email-summary', task_name: '\u{1F4E7} \u90AE\u4EF6\u79D8\u4E66', action: 'summarize', record_id: 'cust-001', field_name: 'email_summary', old_value: '', new_value: '\u57FA\u4E8E6\u5C01\u90AE\u4EF6\u751F\u6210\u6458\u8981\uFF0C\u542B\u5173\u952E\u4E8B\u9879\u3001\u5F85\u529E\u3001\u5546\u4E1A\u6D1E\u5BDF\u3002', confidence: 90, model: 'gemini-2.0-flash', tokens_used: 350, duration_ms: 2600, status: 'applied', raw_response: '' },
    { id: `res-${uid()}`, task_id: 'task-email-summary', task_name: '\u{1F4E7} \u90AE\u4EF6\u79D8\u4E66', action: 'summarize', record_id: 'cust-004', field_name: 'email_summary', old_value: '', new_value: '\u57FA\u4E8E5\u5C01\u90AE\u4EF6\u751F\u6210\u6458\u8981\uFF0C\u542B\u7EED\u7EA6/GDPR/\u5BFC\u51FA\u9700\u6C42\u3002', confidence: 88, model: 'gemini-2.0-flash', tokens_used: 320, duration_ms: 2400, status: 'applied', raw_response: '' },
  ];

  for (const r of sumResults) insertSumResult.run(enrichResult(r, 'email-summaries', 'schedule', `邮件摘要/自动生成`));

  // Also insert audit log entries for the results
  const insertAudit = db.prepare('INSERT INTO audit_log (id, result_id, action, user_name, user_id, user_role, user_ip, detail, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const allResults = [...tk1Results, ...tk2Results, ...tk3Results, ...tk4Results, ...tk5Results,
    ...tk6Results, ...tk7Results, ...tk8Results,
    ...cust1Results, ...cust2Results, ...cust3Results, ...cust5Results,
    ...ord3Results, ...ord5Results, ...emailTransResults, ...sumResults];
  for (const r of allResults) {
    insertAudit.run(`aud-${uid()}`, r.id, 'created', 'system', 'sys-001', 'admin', '10.0.1.10',
      `AI ${r.action}: ${r.field_name}`, '');
  }
  // Add "applied" audit entries with operator notes
  const REVIEW_NOTES = [
    '翻译结果准确，术语与客户历史用语一致',
    '分类结果与人工判断一致',
    '优先级评估合理，客户影响范围已确认',
    '已核实凭证信息，金额与系统记录匹配',
    '客户背景调查结果已与 CRM 数据交叉验证',
    '满意度评估准确，已列入重点关注名单',
    '合规检查通过，无异常',
    '',
  ];
  let noteIdx = 0;
  for (const r of allResults.filter(r => r.status === 'applied')) {
    const note = REVIEW_NOTES[noteIdx % REVIEW_NOTES.length];
    insertAudit.run(`aud-${uid()}`, r.id, 'applied', '张明', 'user-001', 'operator', '192.168.1.105',
      `人工采纳 AI ${r.action} 结果`, note);
    noteIdx++;
  }

  // ---- Block Templates (reusable interactive blocks for AI chat) ----
  const insertTemplate = db.prepare(`
    INSERT INTO block_templates (id, name, description, category, icon, color, blocks, tags, use_count)
    VALUES (@id, @name, @description, @category, @icon, @color, @blocks, @tags, @use_count)
  `);

  const blockTemplates = [
    {
      id: 'tpl-ticket-form', name: '工单快速建单', description: '一句话描述自动预填工单表单',
      category: 'form', icon: '📝', color: '#1677ff',
      blocks: JSON.stringify([
        { type: 'text', config: { content: '请填写工单信息，AI 将辅助补全分类和优先级。' } },
        { type: 'form', config: {
          fields: [
            { name: 'customer_name', label: '客户名称', type: 'text', required: true },
            { name: 'subject', label: '主题', type: 'text', required: true },
            { name: 'content', label: '问题描述', type: 'textarea', required: true },
            { name: 'category', label: '分类', type: 'select', options: ['设备维修', '软件问题', '账户问题', '功能咨询', '投诉建议', '许可证问题'], ai_fill: true },
            { name: 'priority', label: '优先级', type: 'select', options: ['P1-紧急', 'P2-高', 'P3-中', 'P4-低'], ai_fill: true },
          ],
          submit_label: '创建工单',
          submit_action: 'create_ticket',
        }},
      ]),
      tags: '["工单","表单","建单"]', use_count: 42,
    },
    {
      id: 'tpl-approval', name: '采购审批单', description: '多级审批流程表单，含金额校验和风险提示',
      category: 'approval', icon: '✅', color: '#52c41a',
      blocks: JSON.stringify([
        { type: 'stat', config: {
          items: [
            { label: '申请金额', value: '{{amount}}', prefix: '¥', color: '#1677ff' },
            { label: '预算余额', value: '{{budget_remaining}}', prefix: '¥', color: '#52c41a' },
            { label: '风险等级', value: '{{risk_level}}', color: '{{risk_color}}' },
          ],
        }},
        { type: 'form', config: {
          fields: [
            { name: 'department', label: '申请部门', type: 'text', required: true },
            { name: 'item_name', label: '采购物品', type: 'text', required: true },
            { name: 'amount', label: '金额', type: 'number', required: true },
            { name: 'reason', label: '采购理由', type: 'textarea', required: true },
            { name: 'urgency', label: '紧急程度', type: 'select', options: ['普通', '紧急', '特急'] },
          ],
          submit_label: '提交审批',
          submit_action: 'submit_approval',
        }},
        { type: 'approval', config: {
          steps: [
            { role: '部门主管', status: 'pending' },
            { role: '财务经理', status: 'waiting', condition: 'amount > 10000' },
            { role: 'CEO', status: 'waiting', condition: 'amount > 50000' },
          ],
        }},
      ]),
      tags: '["审批","采购","财务"]', use_count: 28,
    },
    {
      id: 'tpl-morning-brief', name: '管理晨报', description: '每日管理数据汇总，含关键指标和待办事项',
      category: 'report', icon: '📊', color: '#722ed1',
      blocks: JSON.stringify([
        { type: 'text', config: { content: '## 管理晨报 — {{date}}', style: 'heading' } },
        { type: 'stat', config: {
          items: [
            { label: '新增工单', value: '{{new_tickets}}', trend: '{{ticket_trend}}' },
            { label: '待处理', value: '{{pending_tickets}}', color: '#faad14' },
            { label: '本周收入', value: '{{weekly_revenue}}', prefix: '¥', trend: '{{revenue_trend}}' },
            { label: '客户满意度', value: '{{avg_satisfaction}}', suffix: '%', color: '#52c41a' },
          ],
        }},
        { type: 'table', config: {
          title: '紧急事项',
          columns: ['事项', '负责人', '截止时间', '状态'],
          data_source: 'urgent_items',
        }},
        { type: 'text', config: { content: '{{ai_insights}}', style: 'insight' } },
        { type: 'action', config: {
          buttons: [
            { label: '查看全部工单', action: 'navigate', target: 'tickets' },
            { label: '导出报告', action: 'export', format: 'pdf' },
          ],
        }},
      ]),
      tags: '["报告","管理","晨报","数据"]', use_count: 156,
    },
    {
      id: 'tpl-customer-360', name: '客户 360 卡片', description: '客户全景视图，整合工单/订单/邮件/满意度数据',
      category: 'card', icon: '👤', color: '#13c2c2',
      blocks: JSON.stringify([
        { type: 'stat', config: {
          items: [
            { label: '满意度', value: '{{satisfaction_score}}', suffix: '%', color: '{{score_color}}' },
            { label: '工单数', value: '{{ticket_count}}' },
            { label: '订单总额', value: '{{total_orders}}', prefix: '¥' },
            { label: '邮件往来', value: '{{email_count}}' },
          ],
        }},
        { type: 'table', config: {
          title: '近期工单',
          columns: ['标题', '状态', '优先级', '日期'],
          data_source: 'recent_tickets',
          max_rows: 5,
        }},
        { type: 'text', config: { content: '{{ai_summary}}', style: 'insight' } },
        { type: 'action', config: {
          buttons: [
            { label: '发起沟通', action: 'compose_email' },
            { label: '查看详情', action: 'navigate', target: 'customer_detail' },
          ],
        }},
      ]),
      tags: '["客户","卡片","CRM"]', use_count: 89,
    },
    {
      id: 'tpl-file-verify', name: '三单核对', description: '上传发票/装箱单/报关单，AI 自动比对差异',
      category: 'form', icon: '📄', color: '#fa541c',
      blocks: JSON.stringify([
        { type: 'text', config: { content: '上传三份单据文件，AI 将自动解析并逐项比对。' } },
        { type: 'form', config: {
          fields: [
            { name: 'invoice', label: '发票', type: 'file', accept: '.pdf,.jpg,.png,.xlsx', required: true },
            { name: 'packing_list', label: '装箱单', type: 'file', accept: '.pdf,.jpg,.png,.xlsx', required: true },
            { name: 'customs_dec', label: '报关单', type: 'file', accept: '.pdf,.jpg,.png,.xlsx', required: true },
          ],
          submit_label: '开始核对',
          submit_action: 'verify_documents',
        }},
        { type: 'table', config: {
          title: '核对结果',
          columns: ['字段', '发票', '装箱单', '报关单', '状态'],
          data_source: 'verify_results',
          highlight_mismatch: true,
        }},
      ]),
      tags: '["核对","文件","外贸","财务"]', use_count: 35,
    },
    {
      id: 'tpl-email-compose', name: '邮件生成', description: '输入中文意图，AI 自动生成多语言正式商务邮件',
      category: 'form', icon: '✉️', color: '#597ef7',
      blocks: JSON.stringify([
        { type: 'form', config: {
          fields: [
            { name: 'recipient', label: '收件人', type: 'text', required: true },
            { name: 'language', label: '目标语言', type: 'select', options: ['英语', '日语', '德语', '法语', '韩语'], required: true },
            { name: 'intent', label: '表达意图（中文）', type: 'textarea', placeholder: '例如：感谢对方的耐心，告知问题已修复...', required: true },
            { name: 'tone', label: '语气', type: 'select', options: ['专业', '友好', '紧急', '正式'] },
          ],
          submit_label: 'AI 生成邮件',
          submit_action: 'generate_email',
        }},
        { type: 'text', config: { content: '{{generated_email}}', style: 'preview' } },
        { type: 'action', config: {
          buttons: [
            { label: '发送邮件', action: 'send_email', style: 'primary' },
            { label: '复制内容', action: 'copy' },
            { label: '重新生成', action: 'regenerate' },
          ],
        }},
      ]),
      tags: '["邮件","生成","翻译","沟通"]', use_count: 67,
    },
    {
      id: 'tpl-contract-renewal', name: '合同续约准备', description: '自动生成续约准备包：回顾、建议、风险分析',
      category: 'report', icon: '📑', color: '#eb2f96',
      blocks: JSON.stringify([
        { type: 'text', config: { content: '## 合同续约准备 — {{customer_name}}', style: 'heading' } },
        { type: 'stat', config: {
          items: [
            { label: '当前合同', value: '{{contract_type}}' },
            { label: '到期日', value: '{{expiry_date}}', color: '#faad14' },
            { label: '使用量', value: '{{usage_pct}}', suffix: '%' },
            { label: '续约概率', value: '{{renewal_prob}}', suffix: '%', color: '#52c41a' },
          ],
        }},
        { type: 'text', config: { content: '{{usage_review}}', style: 'insight' } },
        { type: 'table', config: {
          title: '推荐方案对比',
          columns: ['方案', '价格', '变化', '适用场景'],
          data_source: 'renewal_options',
        }},
        { type: 'text', config: { content: '{{risk_analysis}}', style: 'warning' } },
        { type: 'action', config: {
          buttons: [
            { label: '生成续约邮件', action: 'generate_renewal_email', style: 'primary' },
            { label: '创建续约工单', action: 'create_renewal_ticket' },
          ],
        }},
      ]),
      tags: '["合同","续约","客户","分析"]', use_count: 23,
    },
  ];

  for (const t of blockTemplates) insertTemplate.run(t);

  console.log('Seed data inserted successfully');
}
