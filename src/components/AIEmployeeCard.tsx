/**
 * AIEmployeeCard — Global reusable AI employee card
 *
 * Three variants:
 * - "card" (default): Full card with gradient header, content area, actions, chat
 * - "insight": Compact block for inside panels (360 view, sidebar)
 * - "field": Inline field marker with hover avatar + popover
 *
 * All variants support:
 * - Clickable avatar → AIResultPopover (accept/reject/edit/retry/conversation)
 * - Purple (#faf8ff) background for AI-generated content
 * - Consistent visual language (紫色 = AI)
 */
import { useState } from 'react';
import {
  Button, Tag, Input, Space, Spin, message, Tooltip,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, RedoOutlined, EditOutlined,
  MessageOutlined, SendOutlined, CopyOutlined,
} from '@ant-design/icons';
import { updateResultStatus, retryResult, type AIResultRow, type AITask } from '../api';
import { AIAvatar, AITeamAvatars } from './AIAvatar';
import { AIResultPopover } from './AIResultPopover';

// ============================================================
// Shared types & helpers
// ============================================================

interface AIMember {
  avatar: string;
  color: string;
}

const STATUS_DISPLAY: Record<string, { color: string; label: string }> = {
  pending: { color: 'blue', label: '待处理' },
  applied: { color: 'green', label: '已采纳' },
  rejected: { color: 'red', label: '已拒绝' },
  modified: { color: 'orange', label: '已修改' },
  expired: { color: 'default', label: '已过期' },
  failed: { color: 'red', label: '失败' },
};

// ============================================================
// AIEmployeeCard — Full card variant
// ============================================================

interface AIEmployeeCardProps {
  // Employee identity
  avatar: string;
  color: string;
  name: string;
  description?: string;

  // Optional: team mode (overrides single avatar)
  team?: AIMember[];
  teamMode?: 'parallel' | 'collaborative';

  // AI interaction
  results?: AIResultRow[];
  tasks?: AITask[];
  onRefresh?: () => void;
  context?: string;

  // Content — AI-generated text displayed with purple bg
  // If children is provided, it replaces the content area entirely
  content?: string;
  children?: React.ReactNode;

  // Feature toggles
  showActions?: boolean;       // accept/reject/edit/retry bar (default: true when results exist)
  showChat?: boolean;          // expandable conversation (default: true)
  showMetadata?: boolean;      // model/tokens/duration (default: true when results exist)
  chatPlaceholder?: string;
  onChat?: (text: string) => Promise<string> | void;

  // Extra elements
  extraActions?: React.ReactNode;  // Below action bar (e.g. "confirm payment" button)
  statusTag?: React.ReactNode;     // Override status tag in header

  // Style overrides
  borderColor?: string;
  bgColor?: string;
  gradientFrom?: string;
  gradientTo?: string;

  style?: React.CSSProperties;
}

export function AIEmployeeCard({
  avatar, color, name, description,
  team, teamMode = 'parallel',
  results, tasks = [], onRefresh, context,
  content, children,
  showActions, showChat = true, showMetadata, chatPlaceholder,
  onChat, extraActions, statusTag,
  borderColor = '#e8e0f7', bgColor = '#fcfaff',
  gradientFrom = '#faf8ff', gradientTo = '#f5f0ff',
  style,
}: AIEmployeeCardProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const latestResult = results?.[0];
  const hasResults = results && results.length > 0;
  const effectiveShowActions = showActions ?? !!hasResults;
  const effectiveShowMetadata = showMetadata ?? !!hasResults;

  // Resolve task for the latest result
  const resolvedTask = latestResult ? tasks.find(t => t.id === latestResult.task_id) : null;
  const displayAvatar = resolvedTask?.avatar || avatar;
  const displayColor = resolvedTask?.avatar_color || color;

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

  const handleSaveEdit = async (id: string) => {
    await handleStatus(id, 'modified');
    setEditingId(null);
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatHistory(prev => [...prev, { role: 'user', text }]);
    setChatInput('');

    if (onChat) {
      const reply = await onChat(text);
      if (reply) {
        setChatHistory(prev => [...prev, { role: 'ai', text: reply }]);
      }
    } else {
      // Default mock response
      setTimeout(() => {
        setChatHistory(prev => [...prev, {
          role: 'ai',
          text: '(AI 对话功能接入中... 实际使用时会携带完整上下文调用 AI)',
        }]);
      }, 500);
    }
  };

  // Status display
  const statusDisplay = latestResult
    ? STATUS_DISPLAY[latestResult.status] || STATUS_DISPLAY.pending
    : null;

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${borderColor}`,
      background: bgColor,
      overflow: 'hidden',
      ...style,
    }}>
      {/* ---- Header: gradient bg + avatar + name ---- */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: `1px solid ${borderColor}`,
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
      }}>
        {/* Avatar — clickable with AIResultPopover when results exist */}
        {hasResults && onRefresh ? (
          <AIResultPopover
            results={results!}
            tasks={tasks}
            onRefresh={onRefresh}
            context={context}
            placement="bottomLeft"
          >
            <span style={{ cursor: 'pointer' }}>
              {team ? (
                <AITeamAvatars members={team} size={24} mode={teamMode} />
              ) : (
                <AIAvatar avatar={displayAvatar} color={displayColor} size={28} />
              )}
            </span>
          </AIResultPopover>
        ) : team ? (
          <AITeamAvatars members={team} size={24} mode={teamMode} />
        ) : (
          <AIAvatar avatar={displayAvatar} color={displayColor} size={28} />
        )}

        {/* Name + description */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{name}</div>
          {description && (
            <div style={{ fontSize: 11, color: '#999' }}>{description}</div>
          )}
        </div>

        {/* Status tag */}
        {statusTag || (statusDisplay && latestResult?.status === 'pending' && (
          <Tag color={statusDisplay.color} style={{ fontSize: 10, margin: 0 }}>
            {statusDisplay.label}
          </Tag>
        ))}
      </div>

      {/* ---- Body ---- */}
      <div style={{ padding: '10px 14px' }}>
        {/* AI content area — purple background, editable */}
        {children ? children : content && (
          editingId === latestResult?.id ? (
            <div style={{ marginBottom: 8 }}>
              <Input.TextArea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={6}
                style={{ fontSize: 12, marginBottom: 4 }}
                autoFocus
              />
              <Space size={4}>
                <Button size="small" type="primary" onClick={() => handleSaveEdit(latestResult!.id)}
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontSize: 11 }}>
                  修改后采纳
                </Button>
                <Button size="small" onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>取消</Button>
              </Space>
            </div>
          ) : (
            <div style={{
              background: '#faf8ff',
              borderLeft: `2px solid ${displayColor || '#d8b4fe'}`,
              padding: '6px 10px',
              borderRadius: '0 6px 6px 0',
              marginBottom: 8,
              fontSize: 12, lineHeight: 1.8, color: '#444',
              whiteSpace: 'pre-wrap',
              maxHeight: 200, overflowY: 'auto',
            }}>
              {content}
            </div>
          )
        )}

        {/* Metadata — model / confidence / tokens / duration */}
        {effectiveShowMetadata && latestResult && !editingId && (
          <div style={{ color: '#bbb', marginBottom: 6, display: 'flex', gap: 8, fontSize: 11 }}>
            <span>{latestResult.model}</span>
            {latestResult.confidence > 0 && <span>{latestResult.confidence}%</span>}
            {latestResult.tokens_used > 0 && <span>{latestResult.tokens_used}t</span>}
            {latestResult.duration_ms > 0 && <span>{latestResult.duration_ms}ms</span>}
          </div>
        )}

        {/* Action bar — accept/reject/edit/retry */}
        {effectiveShowActions && latestResult && !editingId && (
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 8 }}>
            {latestResult.status === 'pending' && (
              <>
                <Button size="small" type="text" icon={<CheckOutlined />}
                  style={{ color: '#52c41a', fontSize: 11 }}
                  onClick={() => handleStatus(latestResult.id, 'applied')}>采纳</Button>
                <Button size="small" type="text" danger icon={<CloseOutlined />}
                  style={{ fontSize: 11 }}
                  onClick={() => handleStatus(latestResult.id, 'rejected')}>拒绝</Button>
                <Button size="small" type="text" icon={<EditOutlined />}
                  style={{ fontSize: 11 }}
                  onClick={() => { setEditingId(latestResult.id); setEditValue(latestResult.new_value); }}>
                  编辑
                </Button>
              </>
            )}
            <Button size="small" type="text" icon={<RedoOutlined />}
              style={{ fontSize: 11, color: '#8b5cf6' }}
              onClick={() => handleRetry(latestResult.id)}>重跑</Button>
            <Button size="small" type="text" icon={<CopyOutlined />}
              style={{ fontSize: 11 }}
              onClick={() => { navigator.clipboard.writeText(latestResult.new_value); message.success('已复制'); }} />
          </div>
        )}

        {/* Extra actions (e.g. "confirm payment" button) */}
        {extraActions && <div style={{ marginBottom: 8 }}>{extraActions}</div>}

        {/* Conversation area */}
        {showChat && (
          chatOpen ? (
            <div style={{ background: '#faf8ff', borderRadius: 6, padding: 8, border: '1px solid #f0ecff' }}>
              <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 6 }}>
                <MessageOutlined /> 对话微调
                {context && <span style={{ color: '#bbb', fontWeight: 400 }}> · 已携带上下文</span>}
              </div>

              {chatHistory.length > 0 && (
                <div style={{ maxHeight: 160, overflow: 'auto', marginBottom: 6 }}>
                  {chatHistory.map((msg, i) => (
                    <div key={i} style={{
                      padding: '4px 8px', marginBottom: 4, borderRadius: 4,
                      fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      ...(msg.role === 'user'
                        ? { background: '#e8e0ff', color: '#4c1d95', textAlign: 'right' as const }
                        : { background: '#fff', color: '#444', border: '1px solid #f0f0f0' }
                      ),
                    }}>
                      {msg.text}
                    </div>
                  ))}
                </div>
              )}

              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={chatPlaceholder || '补充要求或提问...'}
                  onPressEnter={handleChat}
                />
                <Button size="small" type="primary" icon={<SendOutlined />}
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  onClick={handleChat} />
              </Space.Compact>
            </div>
          ) : (
            <Button size="small" type="text" icon={<MessageOutlined />}
              style={{ color: '#8b5cf6', fontSize: 11, padding: '2px 4px' }}
              onClick={() => setChatOpen(true)}>
              展开对话微调
              {context && <span style={{ color: '#bbb' }}> (含上下文)</span>}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================
// AIInsightBlock — Compact block for inside panels
// ============================================================

interface AIInsightBlockProps {
  avatar?: string;
  color?: string;
  name?: string;
  result?: AIResultRow;
  tasks: AITask[];
  onRefresh: () => void;
  context?: string;
  children: React.ReactNode;
}

export function AIInsightBlock({
  avatar: avatarProp, color: colorProp, name: nameProp,
  result, tasks, onRefresh, context, children,
}: AIInsightBlockProps) {
  const task = result ? tasks.find(t => t.id === result.task_id) : null;
  const avatar = avatarProp || task?.avatar || '\u{1F916}';
  const color = colorProp || task?.avatar_color || '#8b5cf6';
  const name = nameProp || task?.name || result?.task_name || 'AI';
  const isPending = result?.status === 'pending';

  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6, marginBottom: 8,
      background: isPending ? '#faf8ff' : '#f9f9f9',
      border: `1px solid ${isPending ? '#e8e0f7' : '#f0f0f0'}`,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {result ? (
          <AIResultPopover results={[result]} tasks={tasks} onRefresh={onRefresh}
            context={context} placement="bottomLeft">
            <span style={{ cursor: 'pointer' }}>
              <AIAvatar avatar={avatar} color={color} size={18} />
            </span>
          </AIResultPopover>
        ) : (
          <AIAvatar avatar={avatar} color={color} size={18} />
        )}
        <span style={{ color, fontWeight: 600, fontSize: 11 }}>{name}</span>
        {isPending && (
          <Tag color="purple" style={{ fontSize: 9, margin: 0, marginLeft: 'auto' }}>待处理</Tag>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// AIField — Inline field marker with hover avatar + popover
// ============================================================

interface AIFieldProps {
  value: React.ReactNode;
  results?: AIResultRow[];
  tasks: AITask[];
  onRefresh: () => void;
  context?: string;
  color?: string;
}

export function AIField({
  value, results, tasks, onRefresh, context, color = '#8b5cf6',
}: AIFieldProps) {
  if (!value) return <span style={{ color: '#ccc' }}>-</span>;

  const hasAI = results && results.length > 0;
  if (!hasAI) return <>{value}</>;

  const task = tasks.find(t => t.id === results[0].task_id);
  const displayColor = task?.avatar_color || color;

  return (
    <span className="ai-cell-wrapper" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#faf8ff',
      borderLeft: `3px solid ${displayColor}`,
      padding: '2px 8px',
      borderRadius: '0 4px 4px 0',
      position: 'relative',
    }}>
      {value}
      <AIResultPopover results={results} tasks={tasks} onRefresh={onRefresh} context={context}>
        <span className="ai-cell-icon" style={{ cursor: 'pointer', display: 'inline-flex' }}>
          {task
            ? <AIAvatar avatar={task.avatar} color={task.avatar_color} size={18} style={{ border: '1.5px solid #fff' }} />
            : <span style={{ color: '#8b5cf6', fontSize: 11, fontWeight: 700 }}>AI</span>
          }
        </span>
      </AIResultPopover>
    </span>
  );
}
