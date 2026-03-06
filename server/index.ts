// ============================================================
// API Server — Hono + SQLite + Gemini
// ============================================================

// Load .env FIRST before any other imports that read env vars
import { config } from 'dotenv';
config();

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import crypto from 'crypto';
import db from './db.js';
import { seed } from './seed.js';
import * as ai from './ai.js';

const app = new Hono();
app.use('*', cors());

const uid = () => crypto.randomUUID().slice(0, 8);

// ---- Seed on first start ----
seed();

// ============================================================
// AI Tasks CRUD
// ============================================================

app.get('/api/tasks', (c) => {
  const { action, tag, search } = c.req.query();
  let sql = 'SELECT * FROM ai_tasks WHERE 1=1';
  const params: unknown[] = [];
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (tag) { sql += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY action, created_at';
  return c.json(db.prepare(sql).all(...params).map(parseTaskRow));
});

app.get('/api/tasks/:id', (c) => {
  const row = db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(c.req.param('id'));
  return row ? c.json(parseTaskRow(row)) : c.json({ error: 'not found' }, 404);
});

app.post('/api/tasks', async (c) => {
  const body = await c.req.json();
  const id = body.id || `task-${uid()}`;
  db.prepare(`
    INSERT INTO ai_tasks (id, name, description, category, tags, trigger_type, trigger_config, action, model_tier,
      prompt_template, prompt_system, input_fields, output_fields, output_format, retry_count, timeout_ms, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, body.name, body.description || '', body.category || 'custom',
    JSON.stringify(body.tags || []), body.trigger_type, JSON.stringify(body.trigger_config || {}),
    body.action, body.model_tier || 'fast', body.prompt_template, body.prompt_system || '',
    JSON.stringify(body.input_fields || []), JSON.stringify(body.output_fields || []),
    body.output_format || 'text', body.retry_count ?? 0, body.timeout_ms ?? 30000,
    body.enabled !== false ? 1 : 0);
  return c.json(parseTaskRow(db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id)));
});

app.put('/api/tasks/:id', async (c) => {
  const body = await c.req.json();
  const id = c.req.param('id');
  db.prepare(`UPDATE ai_tasks SET
    name=?, description=?, category=?, tags=?, trigger_type=?, trigger_config=?,
    action=?, model_tier=?, prompt_template=?, prompt_system=?,
    input_fields=?, output_fields=?, output_format=?, retry_count=?, timeout_ms=?,
    enabled=?, updated_at=datetime('now') WHERE id=?`)
    .run(body.name, body.description || '', body.category || 'custom',
      JSON.stringify(body.tags || []), body.trigger_type, JSON.stringify(body.trigger_config || {}),
      body.action, body.model_tier || 'fast', body.prompt_template, body.prompt_system || '',
      JSON.stringify(body.input_fields || []), JSON.stringify(body.output_fields || []),
      body.output_format || 'text', body.retry_count ?? 0, body.timeout_ms ?? 30000,
      body.enabled !== false ? 1 : 0, id);
  return c.json(parseTaskRow(db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id)));
});

app.patch('/api/tasks/:id/toggle', async (c) => {
  const { enabled } = await c.req.json();
  db.prepare('UPDATE ai_tasks SET enabled = ?, updated_at = datetime("now") WHERE id = ?')
    .run(enabled ? 1 : 0, c.req.param('id'));
  return c.json({ ok: true });
});

app.delete('/api/tasks/:id', (c) => {
  db.prepare('DELETE FROM ai_tasks WHERE id = ?').run(c.req.param('id'));
  return c.json({ ok: true });
});

// ============================================================
// AI Results — query by page/record/field
// ============================================================

app.get('/api/results', (c) => {
  const { page_id, record_id, field_name, status, task_id } = c.req.query();
  let sql = 'SELECT * FROM ai_results WHERE 1=1';
  const params: unknown[] = [];
  if (page_id) { sql += ' AND page_id = ?'; params.push(page_id); }
  if (record_id) { sql += ' AND record_id = ?'; params.push(record_id); }
  if (field_name) { sql += ' AND field_name = ?'; params.push(field_name); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (task_id) { sql += ' AND task_id = ?'; params.push(task_id); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return c.json(db.prepare(sql).all(...params));
});

app.patch('/api/results/:id/status', async (c) => {
  const { status, user } = await c.req.json();
  const id = c.req.param('id');
  db.prepare('UPDATE ai_results SET status = ?, applied_by = ?, applied_at = datetime("now") WHERE id = ?')
    .run(status, user || 'user', id);
  // Audit
  db.prepare('INSERT INTO audit_log (id, result_id, action, user_name, detail) VALUES (?, ?, ?, ?, ?)')
    .run(`aud-${uid()}`, id, status, user || 'user', `Status → ${status}`);
  return c.json({ ok: true });
});

// ============================================================
// Audit Log
// ============================================================

app.get('/api/audit', (c) => {
  const { result_id } = c.req.query();
  const sql = result_id
    ? 'SELECT * FROM audit_log WHERE result_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100';
  const rows = result_id ? db.prepare(sql).all(result_id) : db.prepare(sql).all();
  return c.json(rows);
});

// ============================================================
// Alerts
// ============================================================

app.get('/api/alerts', (c) => {
  const { status, type } = c.req.query();
  let sql = 'SELECT * FROM alerts WHERE 1=1';
  const params: unknown[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  return c.json(db.prepare(sql).all(...params));
});

app.patch('/api/alerts/:id', async (c) => {
  const { status } = await c.req.json();
  db.prepare('UPDATE alerts SET status = ?, handled_by = "user" WHERE id = ?')
    .run(status, c.req.param('id'));
  return c.json({ ok: true });
});

// ============================================================
// Workflows
// ============================================================

app.get('/api/workflows', (c) => {
  const wfs = db.prepare('SELECT * FROM workflows ORDER BY created_at').all();
  return c.json(wfs.map((w: any) => ({
    ...w, trigger_config: JSON.parse(w.trigger_config || '{}'), enabled: !!w.enabled,
  })));
});

app.get('/api/workflows/:id', (c) => {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(c.req.param('id')) as any;
  if (!wf) return c.json({ error: 'not found' }, 404);
  const nodes = db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY sort_order').all(c.req.param('id'));
  return c.json({
    ...wf, trigger_config: JSON.parse(wf.trigger_config || '{}'), enabled: !!wf.enabled,
    nodes: nodes.map((n: any) => ({ ...n, config: JSON.parse(n.config || '{}') })),
  });
});

app.post('/api/workflows', async (c) => {
  const body = await c.req.json();
  const id = `wf-${uid()}`;
  db.prepare('INSERT INTO workflows (id, name, description, trigger_type, trigger_config) VALUES (?, ?, ?, ?, ?)')
    .run(id, body.name, body.description || '', body.trigger_type, JSON.stringify(body.trigger_config || {}));
  return c.json({ id });
});

app.put('/api/workflows/:id', async (c) => {
  const body = await c.req.json();
  const id = c.req.param('id');
  db.prepare('UPDATE workflows SET name=?, description=?, trigger_type=?, trigger_config=?, enabled=?, updated_at=datetime("now") WHERE id=?')
    .run(body.name, body.description || '', body.trigger_type, JSON.stringify(body.trigger_config || {}), body.enabled ? 1 : 0, id);
  return c.json({ ok: true });
});

// Workflow nodes CRUD
app.post('/api/workflows/:id/nodes', async (c) => {
  const body = await c.req.json();
  const nodeId = `nd-${uid()}`;
  db.prepare(`INSERT INTO workflow_nodes (id, workflow_id, type, title, config, sort_order, position_x, position_y, next_node_id, branch_true, branch_false)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(nodeId, c.req.param('id'), body.type, body.title || '', JSON.stringify(body.config || {}),
      body.sort_order ?? 0, body.position_x ?? 0, body.position_y ?? 0,
      body.next_node_id || '', body.branch_true || '', body.branch_false || '');
  return c.json({ id: nodeId });
});

app.put('/api/workflow-nodes/:id', async (c) => {
  const body = await c.req.json();
  db.prepare(`UPDATE workflow_nodes SET type=?, title=?, config=?, sort_order=?, position_x=?, position_y=?,
    next_node_id=?, branch_true=?, branch_false=? WHERE id=?`)
    .run(body.type, body.title || '', JSON.stringify(body.config || {}),
      body.sort_order ?? 0, body.position_x ?? 0, body.position_y ?? 0,
      body.next_node_id || '', body.branch_true || '', body.branch_false || '', c.req.param('id'));
  return c.json({ ok: true });
});

app.delete('/api/workflow-nodes/:id', (c) => {
  db.prepare('DELETE FROM workflow_nodes WHERE id = ?').run(c.req.param('id'));
  return c.json({ ok: true });
});

// ============================================================
// Executions — Full traceability
// ============================================================

app.get('/api/executions', (c) => {
  const { workflow_id, status, limit: lim } = c.req.query();
  let sql = 'SELECT * FROM workflow_executions WHERE 1=1';
  const params: unknown[] = [];
  if (workflow_id) { sql += ' AND workflow_id = ?'; params.push(workflow_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(parseInt(lim || '50'));
  return c.json(db.prepare(sql).all(...params).map((e: any) => ({
    ...e, trigger_data: JSON.parse(e.trigger_data || '{}'),
  })));
});

app.get('/api/executions/:id', (c) => {
  const exec = db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(c.req.param('id')) as any;
  if (!exec) return c.json({ error: 'not found' }, 404);
  const nodeExecs = db.prepare('SELECT * FROM node_executions WHERE execution_id = ? ORDER BY started_at').all(c.req.param('id'));
  const aiResults = db.prepare('SELECT * FROM ai_results WHERE execution_id = ? ORDER BY created_at').all(c.req.param('id'));
  const auditLogs = db.prepare('SELECT * FROM audit_log WHERE execution_id = ? ORDER BY created_at').all(c.req.param('id'));
  return c.json({
    ...exec, trigger_data: JSON.parse(exec.trigger_data || '{}'),
    nodeExecutions: nodeExecs.map((n: any) => ({
      ...n, input_data: JSON.parse(n.input_data || '{}'), output_data: JSON.parse(n.output_data || '{}'),
    })),
    aiResults,
    auditLogs,
  });
});

// Retry a specific AI result
app.post('/api/results/:id/retry', async (c) => {
  const original = db.prepare('SELECT * FROM ai_results WHERE id = ?').get(c.req.param('id')) as any;
  if (!original) return c.json({ error: 'not found' }, 404);

  const task = db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(original.task_id) as any;
  // Re-execute with same input
  const prompt = original.prompt_used || task?.prompt_template || original.old_value;
  try {
    const result = await ai.callGemini(prompt, task?.model_tier || 'fast');
    const newId = `res-${uid()}`;
    db.prepare(`INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name, block_id,
      execution_id, node_execution_id, input_data, prompt_used,
      old_value, new_value, confidence, model, tokens_used, duration_ms, raw_response, status, retry_of)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 90, ?, ?, ?, ?, 'pending', ?)`)
      .run(newId, original.task_id, original.task_name, original.action,
        original.page_id, original.record_id, original.field_name, original.block_id,
        original.execution_id, original.node_execution_id, original.input_data, prompt,
        original.old_value, result.text, result.model, result.tokens_used, result.duration_ms, result.text,
        original.id);
    // Mark original as expired
    db.prepare('UPDATE ai_results SET status = "expired" WHERE id = ?').run(original.id);
    addAudit(newId, 'retried', 'user', `Retry of ${original.id}`);
    return c.json({ id: newId, ...result });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Get full execution context for a result (for the bubble)
app.get('/api/results/:id/context', (c) => {
  const result = db.prepare('SELECT * FROM ai_results WHERE id = ?').get(c.req.param('id')) as any;
  if (!result) return c.json({ error: 'not found' }, 404);

  const audit = db.prepare('SELECT * FROM audit_log WHERE result_id = ? ORDER BY created_at').all(result.id);
  const retries = db.prepare('SELECT * FROM ai_results WHERE retry_of = ? ORDER BY created_at').all(result.id);
  const retryOf = result.retry_of ? db.prepare('SELECT id, status, created_at FROM ai_results WHERE id = ?').get(result.retry_of) : null;

  let nodeExec = null;
  let workflowExec = null;
  if (result.node_execution_id) {
    nodeExec = db.prepare('SELECT * FROM node_executions WHERE id = ?').get(result.node_execution_id);
  }
  if (result.execution_id) {
    workflowExec = db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(result.execution_id);
  }

  return c.json({
    result: { ...result, input_data: JSON.parse(result.input_data || '{}') },
    audit,
    retries,
    retryOf,
    nodeExecution: nodeExec ? { ...(nodeExec as any), input_data: JSON.parse((nodeExec as any).input_data || '{}'), output_data: JSON.parse((nodeExec as any).output_data || '{}') } : null,
    workflowExecution: workflowExec ? { ...(workflowExec as any), trigger_data: JSON.parse((workflowExec as any).trigger_data || '{}') } : null,
  });
});

// ============================================================
// Business Data — Tickets
// ============================================================

app.get('/api/tickets', (c) => {
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all() as Record<string, unknown>[];
  // Attach AI results per ticket for inline display
  const stmtAI = db.prepare('SELECT * FROM ai_results WHERE record_id = ? ORDER BY created_at DESC');
  for (const t of tickets) {
    t.aiResults = stmtAI.all(t.id as string);
  }
  return c.json(tickets);
});

app.get('/api/tickets/:id', (c) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(c.req.param('id'));
  if (!ticket) return c.json({ error: 'not found' }, 404);
  const replies = db.prepare('SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at').all(c.req.param('id'));
  const aiResults = db.prepare('SELECT * FROM ai_results WHERE record_id = ? ORDER BY created_at DESC').all(c.req.param('id'));
  return c.json({ ...ticket as object, replies, aiResults });
});

app.post('/api/tickets', async (c) => {
  const body = await c.req.json();
  const id = `tk-${uid()}`;
  db.prepare(`INSERT INTO tickets (id, customer_name, customer_email, subject, content, language, status)
    VALUES (?, ?, ?, ?, ?, ?, 'open')`)
    .run(id, body.customer_name, body.customer_email || '', body.subject, body.content, body.language || '');

  // Trigger background AI processing
  triggerTicketAI(id, body.content).catch(console.error);

  return c.json({ id, ...body });
});

app.post('/api/tickets/:id/replies', async (c) => {
  const body = await c.req.json();
  const replyId = `reply-${uid()}`;
  const ticketId = c.req.param('id');
  db.prepare('INSERT INTO ticket_replies (id, ticket_id, sender, content, language) VALUES (?, ?, ?, ?, ?)')
    .run(replyId, ticketId, body.sender || 'customer', body.content, body.language || '');
  db.prepare('UPDATE tickets SET updated_at = datetime("now") WHERE id = ?').run(ticketId);

  // Trigger AI for new reply
  if (body.sender === 'customer') {
    triggerReplyAI(ticketId, body.content).catch(console.error);
  }

  return c.json({ id: replyId });
});

app.patch('/api/tickets/:id', async (c) => {
  const body = await c.req.json();
  const id = c.req.param('id');
  if (body.status) {
    db.prepare('UPDATE tickets SET status = ?, resolution = ?, updated_at = datetime("now") WHERE id = ?')
      .run(body.status, body.resolution || '', id);
    // If resolved → trigger knowledge analysis
    if (body.status === 'resolved' && body.resolution) {
      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, string>;
      triggerKnowledgeAnalysis(id, ticket.content, body.resolution).catch(console.error);
    }
  }
  return c.json({ ok: true });
});

// ============================================================
// Business Data — Customers
// ============================================================

app.get('/api/customers', (c) => {
  return c.json(db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all());
});

app.get('/api/customers/:id', (c) => {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(c.req.param('id'));
  return cust ? c.json(cust) : c.json({ error: 'not found' }, 404);
});

// ============================================================
// Business Data — Orders
// ============================================================

app.get('/api/orders', (c) => {
  return c.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all());
});

// ============================================================
// Business Data — Emails
// ============================================================

app.get('/api/emails', (c) => {
  const { customer_id } = c.req.query();
  if (customer_id) {
    return c.json(db.prepare('SELECT * FROM emails WHERE customer_id = ? ORDER BY created_at').all(customer_id));
  }
  return c.json(db.prepare('SELECT * FROM emails ORDER BY created_at DESC').all());
});

// ============================================================
// Email Translations — auto-generated by 🌐 翻译专员
// ============================================================

app.get('/api/email-translations', (c) => {
  const { email_id, customer_id } = c.req.query();
  if (email_id) {
    return c.json(db.prepare('SELECT * FROM email_translations WHERE email_id = ?').all(email_id));
  }
  if (customer_id) {
    // Get all translations for a customer's emails
    return c.json(db.prepare(`
      SELECT et.* FROM email_translations et
      JOIN emails e ON et.email_id = e.id
      WHERE e.customer_id = ?
      ORDER BY e.created_at
    `).all(customer_id));
  }
  return c.json(db.prepare('SELECT * FROM email_translations ORDER BY created_at DESC LIMIT 100').all());
});

// ============================================================
// Email Summaries — auto-generated by 📧 邮件秘书
// ============================================================

app.get('/api/email-summaries', (c) => {
  const { customer_id } = c.req.query();
  if (customer_id) {
    return c.json(db.prepare('SELECT * FROM email_summaries WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1').all(customer_id));
  }
  return c.json(db.prepare('SELECT * FROM email_summaries ORDER BY updated_at DESC').all());
});

// ============================================================
// Order Voucher Upload — trigger 💰 财务核对员
// ============================================================

app.post('/api/orders/:id/voucher', async (c) => {
  const { voucher_text } = await c.req.json();
  const id = c.req.param('id');
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!order) return c.json({ error: 'not found' }, 404);

  // Save voucher text
  db.prepare('UPDATE orders SET voucher_text = ? WHERE id = ?').run(voucher_text, id);

  // Trigger AI analysis
  try {
    const result = await ai.analyzeVoucher(voucher_text, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      customerName: order.customer_name,
    });

    // Save analysis
    db.prepare('UPDATE orders SET voucher_analysis = ? WHERE id = ?').run(result.text, id);

    // Save as AI result
    const resultId = saveResult('validate', '凭证核对', 'orders', id, 'voucher_analysis', '', result, { taskId: 'task-voucher' });

    // Parse to check match
    let parsed: any = {};
    try {
      const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {}

    // If mismatch, create alert
    if (parsed.match === false || (parsed.confidence && parsed.confidence < 80)) {
      db.prepare('INSERT INTO alerts (id, type, source_type, source_id, title, detail, severity) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(`alert-${uid()}`, 'payment', 'order', id,
          `💰 凭证核对异常: ${order.customer_name} (${id})`,
          `财务核对员发现：${parsed.recommendation || '凭证与订单信息不完全匹配，建议人工复核。'}`,
          'warning');
    }

    return c.json({ id: resultId, analysis: result.text, model: result.model });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Mark order as paid (after voucher verification)
app.patch('/api/orders/:id', async (c) => {
  const body = await c.req.json();
  const id = c.req.param('id');
  if (body.status) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(body.status, id);
  }
  return c.json({ ok: true });
});

// ============================================================
// Email Reply Assistant — 📧 邮件秘书 + ✍️ 回复助手
// ============================================================

app.post('/api/ai/email-reply', async (c) => {
  const { customer_id, email_id, intent } = await c.req.json();
  // Get the email and customer context
  const email = email_id
    ? db.prepare('SELECT * FROM emails WHERE id = ?').get(email_id) as any
    : null;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id) as any;

  const customerLang = email?.language || '英语';
  const context = email
    ? `来自 ${email.from_addr} 的邮件：\n主题：${email.subject}\n内容：${email.body}`
    : `客户：${customer?.name || customer_id}`;

  const result = await ai.callGemini(
    `你是邮件回复助手。根据用户的中文大意，用${customerLang}写正式商务回复邮件。
同时提供一份中文版本供审查。

${context}

用户想表达：
${intent}

格式：
=== ${customerLang}版 ===
（正式邮件回复）

=== 中文版 ===
（对应中文翻译）`,
    'fast',
  );

  return c.json({ text: result.text, model: result.model, tokens_used: result.tokens_used, duration_ms: result.duration_ms });
});

// ============================================================
// Knowledge Suggestions
// ============================================================

app.get('/api/knowledge-suggestions', (c) => {
  const { status } = c.req.query();
  const sql = status
    ? 'SELECT * FROM knowledge_suggestions WHERE status = ? ORDER BY created_at DESC'
    : 'SELECT * FROM knowledge_suggestions ORDER BY created_at DESC';
  return c.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

app.patch('/api/knowledge-suggestions/:id', async (c) => {
  const { action } = await c.req.json();
  const id = c.req.param('id');
  db.prepare('UPDATE knowledge_suggestions SET status = "accepted", accepted_action = ? WHERE id = ?')
    .run(action, id);
  return c.json({ ok: true });
});

// ============================================================
// AI Actions — Manual triggers
// ============================================================

/** Reply assistant: user gives Chinese intent, AI writes formal reply */
app.post('/api/ai/reply-assist', async (c) => {
  const { ticket_id, intent } = await c.req.json();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket_id) as Record<string, string>;
  if (!ticket) return c.json({ error: 'ticket not found' }, 404);

  const result = await ai.replyFromIntent(ticket.content, ticket.language || '英语', intent);

  const resultId = `res-${uid()}`;
  db.prepare(`INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
    old_value, new_value, confidence, model, tokens_used, duration_ms, status)
    VALUES (?, 'manual', '回复助手', 'generate', 'tickets', ?, 'reply', '', ?, 90, ?, ?, ?, 'pending')`)
    .run(resultId, ticket_id, result.text, result.model, result.tokens_used, result.duration_ms);

  addAudit(resultId, 'created', 'user', 'Manual reply assist');

  return c.json({ id: resultId, ...result });
});

/** Email Q&A */
app.post('/api/ai/email-qa', async (c) => {
  const { customer_id, question } = await c.req.json();
  const emails = db.prepare('SELECT * FROM emails WHERE customer_id = ? ORDER BY created_at')
    .all(customer_id || '') as { from_addr: string; created_at: string; subject: string; body: string }[];

  const mapped = emails.map(e => ({
    from: e.from_addr, date: e.created_at, subject: e.subject, body: e.body,
  }));

  const result = await ai.askAboutEmails(mapped, question);
  return c.json(result);
});

/** Trigger all AI processing for a ticket (manual re-run) */
app.post('/api/ai/process-ticket/:id', async (c) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(c.req.param('id')) as Record<string, string>;
  if (!ticket) return c.json({ error: 'not found' }, 404);
  await triggerTicketAI(ticket.id, ticket.content);
  return c.json({ ok: true });
});

/** AI generates task definition from a short description */
app.post('/api/ai/generate-task', async (c) => {
  const { description } = await c.req.json();
  if (!description) return c.json({ error: 'description required' }, 400);
  try {
    const result = await ai.callGemini(
      `你是一个AI任务配置助手。根据用户的描述，生成一个AI任务的配置。
输出严格的JSON格式（不要markdown）：
{
  "name": "任务名（简短）",
  "description": "一句话描述",
  "tags": ["标签1", "标签2"],
  "model_tier": "lite|fast|pro（根据复杂度选择）",
  "prompt_system": "System Prompt — 角色设定",
  "prompt_template": "Prompt 模板 — 使用 {{field}} 引用输入字段",
  "input_fields": ["field1", "field2"],
  "output_fields": ["output1"],
  "retry_count": 0或1,
  "timeout_ms": 10000-60000
}

用户描述：${description}`,
      'fast'
    );
    // Parse JSON from response
    let text = result.text.trim();
    if (text.startsWith('```')) text = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const task = JSON.parse(text);
    return c.json(task);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ============================================================
// Background AI Processing Functions
// ============================================================

async function triggerTicketAI(ticketId: string, content: string) {
  try {
    // 1. Detect language
    const lang = await ai.detectLanguage(content);
    db.prepare('UPDATE tickets SET language = ? WHERE id = ?').run(lang, ticketId);

    // 2. Translate to Chinese (if not Chinese)
    if (!lang.includes('中文')) {
      const tr = await ai.translateText(content, '中文');
      saveResult('translate', '工单翻译', 'tickets', ticketId, 'translated_content', content, tr);
    }

    // 3. Classify
    const cat = await ai.classifyTicket(content);
    db.prepare('UPDATE tickets SET category = ? WHERE id = ?').run(cat.text.trim(), ticketId);
    saveResult('classify', '工单分类', 'tickets', ticketId, 'category', '', cat);

    // 4. Priority
    const pri = await ai.assessPriority(content, cat.text.trim());
    db.prepare('UPDATE tickets SET priority = ? WHERE id = ?').run(pri.text.trim(), ticketId);
    saveResult('decide', '优先级判定', 'tickets', ticketId, 'priority', '', pri);

    // 5. Pre-generate reply
    const reply = await ai.generateTicketReply(content, lang || '英语');
    saveResult('generate', '工单预回复', 'tickets', ticketId, 'reply_draft', '', reply);

    console.log(`[AI] Ticket ${ticketId} processed: lang=${lang}, cat=${cat.text.trim()}, pri=${pri.text.trim()}`);
  } catch (e) {
    console.error(`[AI] Error processing ticket ${ticketId}:`, e);
  }
}

async function triggerReplyAI(ticketId: string, replyContent: string) {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as Record<string, string>;
    const lang = ticket?.language || '英语';

    // Translate reply if not Chinese
    if (!lang.includes('中文')) {
      const tr = await ai.translateText(replyContent, '中文');
      saveResult('translate', '回复翻译', 'tickets', ticketId, 'reply_translated', replyContent, tr);
    }

    // Re-generate suggested reply
    const reply = await ai.generateTicketReply(
      `${ticket?.content}\n\n最新回复：${replyContent}`,
      lang,
    );
    saveResult('generate', '工单预回复', 'tickets', ticketId, 'reply_draft', '', reply);
  } catch (e) {
    console.error(`[AI] Error processing reply for ${ticketId}:`, e);
  }
}

async function triggerKnowledgeAnalysis(ticketId: string, content: string, resolution: string) {
  try {
    const result = await ai.analyzeForKnowledge(content, resolution);
    let parsed: { worth_action?: boolean; suggested_action?: string; summary?: string; category?: string; reason?: string };
    try {
      // Strip markdown code fences if present
      const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { worth_action: true, suggested_action: 'knowledge_base', summary: result.text, category: '未分类' };
    }

    if (parsed.worth_action) {
      db.prepare(`INSERT INTO knowledge_suggestions (id, ticket_id, ticket_summary, resolution, ai_analysis, suggested_action, summary, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(`ks-${uid()}`, ticketId, content.slice(0, 200), resolution, result.text,
          parsed.suggested_action || 'knowledge_base', parsed.summary || '', parsed.category || '');
    }

    saveResult('decide', '知识积累分析', 'tickets', ticketId, 'knowledge_analysis', '', result);
  } catch (e) {
    console.error(`[AI] Error analyzing knowledge for ${ticketId}:`, e);
  }
}

// ============================================================
// Helpers
// ============================================================

function saveResult(
  action: string, taskName: string, pageId: string, recordId: string,
  fieldName: string, oldValue: string, aiResult: ai.AICallResult,
  opts?: { taskId?: string; executionId?: string; inputData?: string; promptUsed?: string },
) {
  const id = `res-${uid()}`;
  db.prepare(`INSERT INTO ai_results (id, task_id, task_name, action, page_id, record_id, field_name,
    execution_id, input_data, prompt_used,
    old_value, new_value, confidence, model, tokens_used, duration_ms, status, raw_response)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 90, ?, ?, ?, 'pending', ?)`)
    .run(id, opts?.taskId || '', taskName, action, pageId, recordId, fieldName,
      opts?.executionId || '', opts?.inputData || '{}', opts?.promptUsed || '',
      oldValue, aiResult.text, aiResult.model, aiResult.tokens_used, aiResult.duration_ms, aiResult.text);
  addAudit(id, 'created', 'system', `AI ${action}: ${fieldName}`);
  return id;
}

function addAudit(resultId: string, action: string, user: string, detail: string) {
  db.prepare('INSERT INTO audit_log (id, result_id, action, user_name, detail) VALUES (?, ?, ?, ?, ?)')
    .run(`aud-${uid()}`, resultId, action, user, detail);
}

function parseTaskRow(row: unknown): unknown {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    tags: JSON.parse(r.tags as string || '[]'),
    trigger_config: JSON.parse(r.trigger_config as string || '{}'),
    input_fields: JSON.parse(r.input_fields as string || '[]'),
    output_fields: JSON.parse(r.output_fields as string || '[]'),
    enabled: !!(r.enabled as number),
  };
}

// ============================================================
// Start
// ============================================================

const port = 3001;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});
