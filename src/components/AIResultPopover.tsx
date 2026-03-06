/**
 * AIResultPopover — Unified AI result interaction component
 *
 * Appears everywhere AI avatars show. Supports:
 * - Single field view (table cell) or multi-field form view (detail page)
 * - Retry / Edit / Accept / Reject per result
 * - Expand to full execution detail drawer (trigger source, basis, audit trail)
 * - Expand conversation with full context
 * - Full context panel (collapsible)
 */
import { useState } from 'react';
import {
  Popover, Button, Space, Tag, Input, message, Divider,
  Drawer, Descriptions, Timeline, Card, Empty,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, RedoOutlined, EditOutlined,
  MessageOutlined, CopyOutlined, InfoCircleOutlined,
  EyeOutlined, AimOutlined, DesktopOutlined, CloudOutlined,
  ClockCircleOutlined, ApiOutlined, FileTextOutlined,
  LinkOutlined, UserOutlined, SendOutlined,
} from '@ant-design/icons';
import {
  updateResultStatus, retryResult, getResultContext, addAuditNote,
  type AIResultRow, type AITask, type ResultContext,
} from '../api';
import { AIAvatar, AIFusedAvatar } from './AIAvatar';
import { AIChatModal, type ChatMessage } from './AIChatModal';
import type { BlockTemplate } from '../api';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'blue', label: '待处理' },
  applied: { color: 'green', label: '已采纳' },
  rejected: { color: 'red', label: '已拒绝' },
  modified: { color: 'orange', label: '已修改' },
  expired: { color: 'default', label: '已过期' },
  failed: { color: 'red', label: '失败' },
};

const ACTION_LABELS: Record<string, string> = {
  translate: '翻译', classify: '分类', fill: '填充', extract: '提取',
  generate: '生成', validate: '校验', summarize: '摘要', decide: '决策', investigate: '调查',
};

const TRIGGER_SOURCE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  frontend: { icon: <DesktopOutlined />, label: '前端', color: 'blue' },
  backend: { icon: <CloudOutlined />, label: '后端', color: 'cyan' },
  workflow: { icon: <AimOutlined />, label: '工作流', color: 'purple' },
  schedule: { icon: <ClockCircleOutlined />, label: '定时', color: 'orange' },
  api: { icon: <ApiOutlined />, label: 'API', color: 'green' },
};

const PAGE_LABELS: Record<string, string> = {
  tickets: '工单管理', customers: '客户管理', orders: '订单管理',
  emails: '邮件管理', 'email-summaries': '邮件摘要',
};

interface AIResultPopoverProps {
  /** AI results for this cell/field (could be 1 or more) */
  results: AIResultRow[];
  /** All tasks — to resolve task_id → avatar/name */
  tasks?: AITask[];
  /** Refresh parent after status change */
  onRefresh?: () => void;
  /** Popover placement */
  placement?: 'bottomLeft' | 'bottomRight' | 'rightTop' | 'topLeft';
  /** The trigger element (avatar, icon, etc) */
  children: React.ReactNode;
  /** Full context object — field values, record content, etc */
  context?: string;
  /** Context label for display */
  contextLabel?: string;
  /** Show as expanded form (multiple fields) vs compact (single field) */
  mode?: 'compact' | 'form';
}

export function AIResultPopover({
  results, tasks = [], onRefresh, placement = 'bottomLeft',
  children, context, contextLabel, mode = 'compact',
}: AIResultPopoverProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showContext, setShowContext] = useState(false);

  // Detail drawer state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCtx, setDetailCtx] = useState<ResultContext | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const resolveTask = (taskId: string) => tasks.find(t => t.id === taskId);

  const handleStatus = async (id: string, status: string) => {
    await updateResultStatus(id, status);
    message.success(status === 'applied' ? '已采纳' : status === 'rejected' ? '已拒绝' : '已更新');
    onRefresh?.();
  };

  const handleRetry = async (id: string) => {
    message.loading({ content: '重新执行中...', key: 'retry' });
    try {
      await retryResult(id);
      message.success({ content: '执行完成', key: 'retry' });
      onRefresh?.();
    } catch {
      message.error({ content: '执行失败', key: 'retry' });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const handleStartEdit = (r: AIResultRow) => {
    setEditingId(r.id);
    setEditValue(r.new_value);
  };

  const handleSaveEdit = async (id: string) => {
    await handleStatus(id, 'modified');
    setEditingId(null);
  };

  const handleChatSend = async (text: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setChatMessages(prev => [...prev, {
      role: 'ai',
      text: '(AI 对话功能接入中... 实际使用时会携带完整上下文调用 AI)',
    }]);
    setChatLoading(false);
  };

  const handleTemplateSelect = (tpl: BlockTemplate) => {
    setChatMessages(prev => [...prev, { role: 'user', text: `使用模板: ${tpl.icon} ${tpl.name}` }]);
    setChatLoading(true);
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'ai', text: `已加载「${tpl.name}」模板，请填写以下内容：`, template: tpl,
      }]);
      setChatLoading(false);
    }, 600);
  };

  // Open detail drawer
  const openDetail = async (resultId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setNoteInput('');
    setDetailCtx(await getResultContext(resultId));
    setDetailLoading(false);
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !detailCtx) return;
    setAddingNote(true);
    await addAuditNote(detailCtx.result.id, noteInput.trim());
    message.success('备注已添加');
    setNoteInput('');
    setAddingNote(false);
    openDetail(detailCtx.result.id);
  };

  // Resolve first task for chat avatar
  const firstResult = results[0];
  const chatTask = firstResult ? resolveTask(firstResult.task_id) : null;

  const isForm = mode === 'form' || results.length > 2;
  const popoverWidth = isForm ? 420 : 360;

  const content = (
    <div style={{ width: popoverWidth, fontSize: 12, maxHeight: 520, overflow: 'auto' }}>
      {/* Results list */}
      {results.map((r, idx) => {
        const task = resolveTask(r.task_id);
        const statusInfo = STATUS_MAP[r.status] || STATUS_MAP.pending;
        const isEditing = editingId === r.id;
        const isLongValue = (r.new_value?.length || 0) > 100;

        return (
          <div key={r.id} style={{
            padding: '8px 0',
            borderBottom: idx < results.length - 1 ? '1px solid #f0f0f0' : 'none',
          }}>
            {/* Header: avatar + name + field + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {task && <AIAvatar avatar={task.avatar} color={task.avatar_color} size={22} />}
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{r.task_name}</span>
                {r.field_name && (
                  <span style={{ color: '#999', marginLeft: 4, fontSize: 11 }}>→ {r.field_name}</span>
                )}
              </div>
              <Tag color={statusInfo.color} style={{ fontSize: 10, margin: 0 }}>{statusInfo.label}</Tag>
            </div>

            {/* Result value — editable */}
            {isEditing ? (
              <div style={{ marginBottom: 6 }}>
                <Input.TextArea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  rows={isLongValue ? 5 : 2}
                  style={{ fontSize: 12, marginBottom: 4 }}
                  autoFocus
                />
                <Space size={4}>
                  <Button size="small" type="primary" onClick={() => handleSaveEdit(r.id)}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontSize: 11 }}>
                    修改后采纳
                  </Button>
                  <Button size="small" onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>取消</Button>
                </Space>
              </div>
            ) : (
              <div style={{
                color: '#444', whiteSpace: 'pre-wrap', marginBottom: 6,
                background: '#faf8ff', borderLeft: '2px solid #d8b4fe',
                padding: '4px 8px', borderRadius: '0 4px 4px 0',
                maxHeight: isForm ? 120 : 80, overflow: 'auto', lineHeight: 1.5,
              }}>
                {r.new_value}
              </div>
            )}

            {/* Metadata */}
            <div style={{ color: '#bbb', marginBottom: 4, display: 'flex', gap: 8, fontSize: 11 }}>
              <span>{r.model}</span>
              <span>{r.confidence}%</span>
              <span>{r.tokens_used}t</span>
              <span>{r.duration_ms}ms</span>
            </div>

            {/* Action bar */}
            {!isEditing && (
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {r.status === 'pending' && (
                  <>
                    <Button size="small" type="text" icon={<CheckOutlined />}
                      style={{ color: '#52c41a', fontSize: 11 }}
                      onClick={() => handleStatus(r.id, 'applied')}>采纳</Button>
                    <Button size="small" type="text" danger icon={<CloseOutlined />}
                      style={{ fontSize: 11 }}
                      onClick={() => handleStatus(r.id, 'rejected')}>拒绝</Button>
                    <Button size="small" type="text" icon={<EditOutlined />}
                      style={{ fontSize: 11 }}
                      onClick={() => handleStartEdit(r)}>编辑</Button>
                  </>
                )}
                <Button size="small" type="text" icon={<RedoOutlined />}
                  style={{ fontSize: 11, color: '#8b5cf6' }}
                  onClick={() => handleRetry(r.id)}>重跑</Button>
                <Button size="small" type="text" icon={<CopyOutlined />}
                  style={{ fontSize: 11 }}
                  onClick={() => handleCopy(r.new_value)} />
                <Button size="small" type="text" icon={<EyeOutlined />}
                  style={{ fontSize: 11, color: '#8b5cf6' }}
                  onClick={() => openDetail(r.id)}>详情</Button>
              </div>
            )}
          </div>
        );
      })}

      <Divider style={{ margin: '6px 0' }} />

      {/* Context panel — collapsible */}
      {context && (
        <div style={{ marginBottom: 6 }}>
          <Button size="small" type="text" icon={<InfoCircleOutlined />}
            style={{ fontSize: 11, color: '#999', padding: '2px 4px' }}
            onClick={() => setShowContext(!showContext)}>
            {showContext ? '收起上下文' : '查看完整上下文'}
          </Button>
          {showContext && (
            <div style={{
              background: '#f9f9f9', padding: 8, borderRadius: 4, marginTop: 4,
              maxHeight: 120, overflow: 'auto', fontSize: 11, color: '#666',
              whiteSpace: 'pre-wrap', lineHeight: 1.5, border: '1px solid #f0f0f0',
            }}>
              {contextLabel && <div style={{ fontWeight: 600, marginBottom: 4 }}>{contextLabel}</div>}
              {context}
            </div>
          )}
        </div>
      )}

      {/* Chat trigger — opens floating AIChatModal */}
      <Button size="small" type="text" icon={<MessageOutlined />}
        style={{ color: '#8b5cf6', fontSize: 11, padding: '2px 4px' }}
        onClick={() => setChatOpen(true)}>
        对话微调
        {context && <span style={{ color: '#bbb' }}> (含上下文)</span>}
      </Button>
    </div>
  );

  // Title with avatars
  const titleAvatars = results.map(r => {
    const task = resolveTask(r.task_id);
    return { avatar: task?.avatar || '🤖', color: task?.avatar_color || '#8b5cf6' };
  });
  const uniqueAvatars = titleAvatars.filter((a, i, arr) =>
    arr.findIndex(b => b.avatar === a.avatar) === i
  );

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {uniqueAvatars.length > 1
        ? <AIFusedAvatar members={uniqueAvatars} size={22} />
        : uniqueAvatars[0] && <AIAvatar avatar={uniqueAvatars[0].avatar} color={uniqueAvatars[0].color} size={22} />
      }
      <span>AI 处理详情</span>
      {results.length > 1 && <span style={{ fontSize: 11, color: '#999' }}>{results.length} 条</span>}
    </div>
  );

  return (
    <>
      <Popover
        content={content}
        title={title}
        trigger="click"
        placement={placement}
        overlayStyle={{ maxWidth: popoverWidth + 40 }}
      >
        {children}
      </Popover>

      <AIChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        avatar={chatTask?.avatar || '\u{1F916}'}
        color={chatTask?.avatar_color || '#8b5cf6'}
        name={chatTask?.name || 'AI'}
        subtitle="对话微调"
        messages={chatMessages}
        loading={chatLoading}
        onSend={handleChatSend}
        onTemplateSelect={handleTemplateSelect}
        placeholder="补充要求或提问，可添加附件或语音..."
        context={context}
      />

      {/* Execution Detail Drawer */}
      <Drawer
        title={detailCtx ? `执行详情: ${detailCtx.result.task_name}` : '加载中...'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={640}
        loading={detailLoading}
      >
        {detailCtx && (() => {
          const dr = detailCtx.result;
          const src = TRIGGER_SOURCE_CONFIG[dr.trigger_source] || TRIGGER_SOURCE_CONFIG.backend;
          return (
            <div>
              {/* 基本信息 */}
              <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="ID"><span style={{ fontSize: 11 }}>{dr.id}</span></Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={STATUS_MAP[dr.status]?.color}>{STATUS_MAP[dr.status]?.label || dr.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="操作">
                  <Tag color="purple">{ACTION_LABELS[dr.action] || dr.action}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="模型">{dr.model}</Descriptions.Item>
                <Descriptions.Item label="Token">{dr.tokens_used}</Descriptions.Item>
                <Descriptions.Item label="耗时">{dr.duration_ms}ms</Descriptions.Item>
                <Descriptions.Item label="置信度">{dr.confidence}%</Descriptions.Item>
                <Descriptions.Item label="创建时间">{dr.created_at}</Descriptions.Item>
              </Descriptions>

              {/* 触发来源 & 定位 */}
              <Card size="small" title={<><AimOutlined style={{ color: '#8b5cf6' }} /> 触发来源 & 定位</>} style={{ marginBottom: 16 }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="触发方式">
                    <Tag icon={src.icon} color={src.color}>{src.label}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="触发动作">{dr.trigger_action || '-'}</Descriptions.Item>
                  <Descriptions.Item label="触发用户">
                    <Space size={4}>
                      <UserOutlined style={{ fontSize: 11 }} />
                      <span>{dr.trigger_user || 'system'}</span>
                      {dr.trigger_user_id && <span style={{ color: '#bbb', fontSize: 10 }}>({dr.trigger_user_id})</span>}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="来源 IP">{dr.trigger_ip || '-'}</Descriptions.Item>
                  <Descriptions.Item label="目标页面">
                    <Space size={4}>
                      <LinkOutlined style={{ fontSize: 11 }} />
                      <span>{PAGE_LABELS[dr.page_id] || dr.page_id || '-'}</span>
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="目标字段">{dr.field_name || '(记录级)'}</Descriptions.Item>
                  <Descriptions.Item label="记录 ID">{dr.record_id}</Descriptions.Item>
                  <Descriptions.Item label="区块位置">{dr.trigger_block_pos || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 执行依据 */}
              <Card size="small" title={<><FileTextOutlined style={{ color: '#fa8c16' }} /> 执行依据</>} style={{ marginBottom: 16 }}>
                {dr.prompt_used ? (
                  <div style={{ marginBottom: dr.input_data && Object.keys(dr.input_data).length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>Prompt 模板（渲染后）</div>
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#fffbe6', padding: 10, borderRadius: 4, margin: 0, border: '1px solid #ffe58f' }}>
                      {dr.prompt_used}
                    </pre>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#ccc', marginBottom: 8 }}>无 Prompt 记录</div>
                )}
                {dr.input_data && Object.keys(dr.input_data).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>输入参数</div>
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#f6ffed', padding: 10, borderRadius: 4, margin: 0, border: '1px solid #b7eb8f' }}>
                      {JSON.stringify(dr.input_data, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>

              {/* 输出结果 */}
              <Card size="small" title="输出结果" style={{ marginBottom: 16 }}>
                {dr.old_value && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>原值</div>
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto', background: '#fff7e6', padding: 8, borderRadius: 4, margin: 0 }}>
                      {dr.old_value}
                    </pre>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>新值</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#faf8ff', padding: 10, borderRadius: 4, borderLeft: '3px solid #8b5cf6', margin: 0 }}>
                    {dr.new_value}
                  </pre>
                </div>
              </Card>

              {/* 重试链 */}
              {detailCtx.retryOf && (
                <Card size="small" title="重试来源" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12 }}>
                    此结果是 <a onClick={() => openDetail(detailCtx.retryOf!.id)}>{detailCtx.retryOf.id}</a> 的重试
                    <Tag style={{ marginLeft: 8 }}>{detailCtx.retryOf.status}</Tag>
                  </div>
                </Card>
              )}
              {detailCtx.retries.length > 0 && (
                <Card size="small" title={`重试记录 (${detailCtx.retries.length})`} style={{ marginBottom: 16 }}>
                  {detailCtx.retries.map(rt => (
                    <div key={rt.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <a onClick={() => openDetail(rt.id)}>{rt.id}</a>
                      <Tag color={STATUS_MAP[rt.status]?.color} style={{ marginLeft: 8 }}>{rt.status}</Tag>
                      <span style={{ color: '#999' }}>{rt.created_at}</span>
                    </div>
                  ))}
                </Card>
              )}

              {/* 工作流上下文 */}
              {detailCtx.workflowExecution && (
                <Card size="small" title="工作流上下文" style={{ marginBottom: 16 }}>
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="工作流">{detailCtx.workflowExecution.workflow_name}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={detailCtx.workflowExecution.status === 'completed' ? 'green' : 'blue'}>
                        {detailCtx.workflowExecution.status}
                      </Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              )}

              {/* 操作栏 */}
              <Divider style={{ margin: '12px 0' }} />
              <Space wrap style={{ marginBottom: 16 }}>
                <Button icon={<RedoOutlined />} onClick={() => { handleRetry(dr.id); }}>重试</Button>
                {dr.status === 'pending' && (
                  <>
                    <Button type="primary" onClick={() => handleStatus(dr.id, 'applied')}
                      style={{ background: '#52c41a', borderColor: '#52c41a' }}>采纳</Button>
                    <Button danger onClick={() => handleStatus(dr.id, 'rejected')}>拒绝</Button>
                  </>
                )}
                <Button icon={<LinkOutlined />}
                  onClick={() => message.info(`目标: ${PAGE_LABELS[dr.page_id] || dr.page_id} → ${dr.record_id} → ${dr.field_name || '(记录)'}`)}>
                  定位目标
                </Button>
                <Button icon={<MessageOutlined />}
                  onClick={() => { setDetailOpen(false); setChatOpen(true); }}>
                  展开会话
                </Button>
              </Space>

              {/* 审计记录 */}
              <Card size="small" title={`审计记录 (${detailCtx.audit.length})`}>
                {detailCtx.audit.length === 0 ? (
                  <Empty description="暂无审计记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Timeline items={detailCtx.audit.map(log => ({
                    color: log.action === 'applied' ? 'green' : log.action === 'rejected' ? 'red' :
                      log.action === 'retried' ? 'orange' : log.action === 'note' ? 'gray' : 'blue',
                    children: (
                      <div style={{ fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <Tag style={{ fontSize: 10 }}>{log.action}</Tag>
                          <span style={{ fontWeight: 500 }}>{log.user_name}</span>
                          {log.user_role && <Tag style={{ fontSize: 9 }}>{log.user_role}</Tag>}
                          {log.user_ip && <span style={{ color: '#ccc', fontSize: 10 }}>{log.user_ip}</span>}
                        </div>
                        <div style={{ color: '#666', marginTop: 2 }}>{log.detail}</div>
                        {log.note && (
                          <div style={{ background: '#fafafa', padding: '4px 8px', borderRadius: 4, marginTop: 4, borderLeft: '2px solid #d9d9d9', color: '#555' }}>
                            <EditOutlined style={{ fontSize: 10, marginRight: 4, color: '#bbb' }} />
                            {log.note}
                          </div>
                        )}
                        <div style={{ color: '#bbb', marginTop: 2 }}>{log.created_at}</div>
                      </div>
                    ),
                  }))} />
                )}
                {/* 添加备注 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Input size="small" placeholder="添加审计备注..."
                    value={noteInput} onChange={e => setNoteInput(e.target.value)}
                    onPressEnter={handleAddNote} style={{ flex: 1, fontSize: 12 }} />
                  <Button size="small" type="primary" icon={<SendOutlined />}
                    loading={addingNote} onClick={handleAddNote}
                    disabled={!noteInput.trim()}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                    备注
                  </Button>
                </div>
              </Card>
            </div>
          );
        })()}
      </Drawer>
    </>
  );
}
