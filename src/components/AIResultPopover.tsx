/**
 * AIResultPopover — Unified AI result interaction component
 *
 * Appears everywhere AI avatars show. Supports:
 * - Single field view (table cell) or multi-field form view (detail page)
 * - Retry / Edit / Accept / Reject per result
 * - Expand conversation with full context
 * - Full context panel (collapsible)
 */
import { useState } from 'react';
import { Popover, Button, Space, Tag, Input, message, Divider } from 'antd';
import {
  CheckOutlined, CloseOutlined, RedoOutlined, EditOutlined,
  MessageOutlined, CopyOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { updateResultStatus, retryResult, type AIResultRow, type AITask } from '../api';
import { AIAvatar, AIFusedAvatar } from './AIAvatar';
import { AIChatModal, type ChatMessage } from './AIChatModal';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'blue', label: '待处理' },
  applied: { color: 'green', label: '已采纳' },
  rejected: { color: 'red', label: '已拒绝' },
  modified: { color: 'orange', label: '已修改' },
  expired: { color: 'default', label: '已过期' },
  failed: { color: 'red', label: '失败' },
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
                {r.status !== 'pending' && (
                  <Button size="small" type="text" icon={<RedoOutlined />}
                    style={{ fontSize: 11, color: '#8b5cf6' }}
                    onClick={() => handleRetry(r.id)}>重跑</Button>
                )}
                {r.status === 'pending' && (
                  <Button size="small" type="text" icon={<RedoOutlined />}
                    style={{ fontSize: 11, color: '#8b5cf6' }}
                    onClick={() => handleRetry(r.id)}>重跑</Button>
                )}
                <Button size="small" type="text" icon={<CopyOutlined />}
                  style={{ fontSize: 11 }}
                  onClick={() => handleCopy(r.new_value)} />
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
        placeholder="补充要求或提问，可添加附件或语音..."
        context={context}
      />
    </>
  );
}
