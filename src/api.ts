// ============================================================
// API Client — Frontend to Backend
// ============================================================

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Tasks
export const getTasks = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<AITask[]>('/tasks' + qs);
};
export const getTask = (id: string) => request<AITask>('/tasks/' + id);
export const createTask = (data: Partial<AITask>) => request<AITask>('/tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (id: string, data: Partial<AITask>) => request<AITask>('/tasks/' + id, { method: 'PUT', body: JSON.stringify(data) });
export const toggleTask = (id: string, enabled: boolean) => request('/tasks/' + id + '/toggle', { method: 'PATCH', body: JSON.stringify({ enabled }) });
export const deleteTask = (id: string) => request('/tasks/' + id, { method: 'DELETE' });

// AI Results
export const getResults = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<AIResultRow[]>('/results' + qs);
};
export const updateResultStatus = (id: string, status: string, user = 'user') =>
  request('/results/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, user }) });

// Audit
export const getAuditLogs = (resultId?: string) => {
  const qs = resultId ? '?result_id=' + resultId : '';
  return request<AuditLogRow[]>('/audit' + qs);
};
export const addAuditNote = (resultId: string, note: string, user = 'user') =>
  request<{ id: string }>('/audit', { method: 'POST', body: JSON.stringify({ result_id: resultId, note, user }) });

// Alerts
export const getAlerts = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<AlertRow[]>('/alerts' + qs);
};
export const updateAlert = (id: string, status: string) =>
  request('/alerts/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });

// Tickets
export const getTickets = () => request<TicketListRow[]>('/tickets');
export const getTicket = (id: string) => request<TicketDetail>('/tickets/' + id);
export const createTicket = (data: Partial<TicketRow>) => request<TicketRow>('/tickets', { method: 'POST', body: JSON.stringify(data) });
export const updateTicket = (id: string, data: Partial<TicketRow>) => request('/tickets/' + id, { method: 'PATCH', body: JSON.stringify(data) });
export const addReply = (ticketId: string, data: { content: string; sender: string; language?: string }) =>
  request('/tickets/' + ticketId + '/replies', { method: 'POST', body: JSON.stringify(data) });

// Customers
export const getCustomers = () => request<CustomerRow[]>('/customers');
export const getCustomer = (id: string) => request<CustomerRow>('/customers/' + id);

// Orders
export const getOrders = () => request<OrderRow[]>('/orders');

// Emails
export const getEmails = (customerId?: string) => {
  const qs = customerId ? '?customer_id=' + customerId : '';
  return request<EmailRow[]>('/emails' + qs);
};

// Knowledge Suggestions
export const getKnowledgeSuggestions = (status?: string) => {
  const qs = status ? '?status=' + status : '';
  return request<KnowledgeSuggestionRow[]>('/knowledge-suggestions' + qs);
};
export const handleKnowledgeSuggestion = (id: string, action: string) =>
  request('/knowledge-suggestions/' + id, { method: 'PATCH', body: JSON.stringify({ action }) });

// Email Translations & Summaries
export const getEmailTranslations = (params: { email_id?: string; customer_id?: string }) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<EmailTranslationRow[]>('/email-translations?' + qs);
};
export const getEmailSummaries = (customerId: string) =>
  request<EmailSummaryRow[]>('/email-summaries?customer_id=' + customerId);

// Order actions
export const uploadVoucher = (orderId: string, voucherText: string) =>
  request<{ id: string; analysis: string; model: string }>('/orders/' + orderId + '/voucher', { method: 'POST', body: JSON.stringify({ voucher_text: voucherText }) });
export const updateOrder = (orderId: string, data: Partial<OrderRow>) =>
  request('/orders/' + orderId, { method: 'PATCH', body: JSON.stringify(data) });

// AI Actions
export const replyAssist = (ticketId: string, intent: string) =>
  request<{ id: string; text: string; model: string; tokens_used: number; duration_ms: number }>(
    '/ai/reply-assist', { method: 'POST', body: JSON.stringify({ ticket_id: ticketId, intent }) });
export const processTicket = (ticketId: string) =>
  request('/ai/process-ticket/' + ticketId, { method: 'POST' });
export const emailQA = (customerId: string, question: string) =>
  request<{ text: string; model: string }>('/ai/email-qa', { method: 'POST', body: JSON.stringify({ customer_id: customerId, question }) });
export const emailReply = (customerId: string, intent: string, emailId?: string) =>
  request<{ text: string; model: string; tokens_used: number; duration_ms: number }>(
    '/ai/email-reply', { method: 'POST', body: JSON.stringify({ customer_id: customerId, email_id: emailId, intent }) });
export const generateTaskDef = (description: string) =>
  request<Partial<AITask>>('/ai/generate-task', { method: 'POST', body: JSON.stringify({ description }) });

// Workflows
export const getWorkflows = () => request<WorkflowRow[]>('/workflows');
export const getWorkflow = (id: string) => request<WorkflowDetail>('/workflows/' + id);
export const createWorkflow = (data: Partial<WorkflowRow>) => request<{ id: string }>('/workflows', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflow = (id: string, data: Partial<WorkflowRow>) => request('/workflows/' + id, { method: 'PUT', body: JSON.stringify(data) });
export const createWorkflowNode = (wfId: string, data: Partial<WorkflowNodeRow>) => request<{ id: string }>('/workflows/' + wfId + '/nodes', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflowNode = (nodeId: string, data: Partial<WorkflowNodeRow>) => request('/workflow-nodes/' + nodeId, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorkflowNode = (nodeId: string) => request('/workflow-nodes/' + nodeId, { method: 'DELETE' });

// Executions
export const getExecutions = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<ExecutionRow[]>('/executions' + qs);
};
export const getExecution = (id: string) => request<ExecutionDetail>('/executions/' + id);
export const retryResult = (resultId: string) => request<{ id: string; text: string }>('/results/' + resultId + '/retry', { method: 'POST' });
export const getResultContext = (resultId: string) => request<ResultContext>('/results/' + resultId + '/context');

// Block Templates
export const getBlockTemplates = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<BlockTemplate[]>('/block-templates' + qs);
};
export const getBlockTemplate = (id: string) => request<BlockTemplate>('/block-templates/' + id);
export const createBlockTemplate = (data: Partial<BlockTemplate>) =>
  request<{ id: string }>('/block-templates', { method: 'POST', body: JSON.stringify(data) });
export const updateBlockTemplate = (id: string, data: Partial<BlockTemplate>) =>
  request('/block-templates/' + id, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBlockTemplate = (id: string) =>
  request('/block-templates/' + id, { method: 'DELETE' });
export const useBlockTemplate = (id: string) =>
  request('/block-templates/' + id + '/use', { method: 'POST' });

// ---- Types ----

export interface AITask {
  id: string; name: string; description: string;
  category: string; tags: string[];
  trigger_type: string; trigger_config: Record<string, unknown>;
  action: string; model_tier: string;
  prompt_template: string; prompt_system: string;
  input_fields: string[]; output_fields: string[];
  output_format: string; retry_count: number; timeout_ms: number;
  avatar: string; avatar_color: string;
  enabled: boolean; created_at: string; updated_at: string;
}

export interface AIResultRow {
  id: string; task_id: string; task_name: string; action: string;
  page_id: string; record_id: string; field_name: string; block_id: string;
  trigger_source: string; trigger_user: string; trigger_user_id: string;
  trigger_ip: string; trigger_action: string;
  trigger_page_path: string; trigger_block_pos: string;
  execution_id: string; node_execution_id: string;
  input_data: string; prompt_used: string;
  old_value: string; new_value: string; confidence: number;
  model: string; tokens_used: number; duration_ms: number;
  raw_response: string; status: string;
  applied_by: string; applied_at: string;
  retry_of: string; conversation_id: string;
  created_at: string;
}

export interface WorkflowRow {
  id: string; name: string; description: string;
  trigger_type: string; trigger_config: Record<string, unknown>;
  enabled: boolean; created_at: string; updated_at: string;
}

export interface WorkflowNodeRow {
  id: string; workflow_id: string; type: string; title: string;
  config: Record<string, unknown>;
  position_x: number; position_y: number;
  next_node_id: string; branch_true: string; branch_false: string;
  sort_order: number; created_at: string;
}

export interface WorkflowDetail extends WorkflowRow {
  nodes: WorkflowNodeRow[];
}

export interface ExecutionRow {
  id: string; workflow_id: string; workflow_name: string;
  trigger_data: Record<string, unknown>;
  status: string; started_at: string; completed_at: string; error: string;
}

export interface NodeExecutionRow {
  id: string; execution_id: string; node_id: string; node_type: string; node_title: string;
  input_data: Record<string, unknown>; output_data: Record<string, unknown>;
  status: string; duration_ms: number; error: string; result_id: string;
  started_at: string; completed_at: string;
}

export interface ExecutionDetail extends ExecutionRow {
  nodeExecutions: NodeExecutionRow[];
  aiResults: AIResultRow[];
  auditLogs: AuditLogRow[];
}

export interface ResultContext {
  result: AIResultRow & { input_data: Record<string, unknown> };
  audit: AuditLogRow[];
  retries: AIResultRow[];
  retryOf: { id: string; status: string; created_at: string } | null;
  nodeExecution: NodeExecutionRow | null;
  workflowExecution: ExecutionRow | null;
}

export interface AuditLogRow {
  id: string; result_id: string; action: string;
  user_name: string; user_id: string; user_role: string;
  user_ip: string; detail: string; note: string; created_at: string;
}

export interface AlertRow {
  id: string; type: string; source_type: string; source_id: string;
  title: string; detail: string; severity: string;
  status: string; handled_by: string; created_at: string;
}

export interface TicketRow {
  id: string; customer_name: string; customer_email: string;
  subject: string; content: string; language: string;
  category: string; priority: string; status: string;
  resolution: string; created_at: string; updated_at: string;
}

export interface TicketReply {
  id: string; ticket_id: string; sender: string;
  content: string; language: string; created_at: string;
}

export interface TicketListRow extends TicketRow {
  aiResults: AIResultRow[];
}

export interface TicketDetail extends TicketRow {
  replies: TicketReply[];
  aiResults: AIResultRow[];
}

export interface CustomerRow {
  id: string; name: string; email: string; country: string;
  company: string; license_type: string; background: string;
  satisfaction_score: number; tags: string; created_at: string;
}

export interface OrderRow {
  id: string; customer_id: string; customer_name: string;
  amount: number; currency: string; status: string;
  voucher_text: string; voucher_analysis: string; created_at: string;
}

export interface EmailRow {
  id: string; customer_id: string; customer_name: string;
  from_addr: string; to_addr: string; subject: string;
  body: string; language: string; direction: string; created_at: string;
}

export interface KnowledgeSuggestionRow {
  id: string; ticket_id: string; ticket_summary: string;
  resolution: string; ai_analysis: string;
  suggested_action: string; summary: string; category: string;
  status: string; accepted_action: string; created_at: string;
}

export interface EmailTranslationRow {
  id: string; email_id: string; translated_text: string;
  source_lang: string; target_lang: string; model: string;
  created_at: string;
}

export interface EmailSummaryRow {
  id: string; customer_id: string; summary: string;
  email_count: number; model: string;
  created_at: string; updated_at: string;
}

export interface BlockTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  blocks: TemplateBlock[];
  tags: string[];
  use_count: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateBlock {
  type: 'form' | 'approval' | 'table' | 'stat' | 'text' | 'action';
  config: Record<string, unknown>;
}
