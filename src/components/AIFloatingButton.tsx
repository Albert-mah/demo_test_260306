/**
 * AIFloatingButton — Top-right floating team avatar button
 *
 * - Shows stacked team avatars (not generic robot icon)
 * - Panel: avatar filter, notifications, history
 * - Click avatar to filter or start new conversation
 */
import { useState, useRef, useEffect } from 'react';
import {
  Badge, Tabs, List, Tag, Button, Space, Empty, Input, Tooltip, Timeline, message, Modal,
} from 'antd';
import {
  BellOutlined, HistoryOutlined,
  CheckOutlined, CloseOutlined, MessageOutlined, SendOutlined,
  UnorderedListOutlined, NodeIndexOutlined,
  BookOutlined, FileTextOutlined, EditOutlined,
} from '@ant-design/icons';
import { updateResultStatus, type AIResultRow, type AITask } from '../api';
import { AIAvatar, AIFusedAvatar, AITeamAvatars } from './AIAvatar';
import { AIResultPopover } from './AIResultPopover';

const STATUS_COLORS: Record<string, string> = {
  pending: 'blue', applied: 'green', rejected: 'red', modified: 'orange', failed: 'red',
};

export function AIFloatingButton({
  aiResults,
  pendingCount,
  allTasks = [],
  onStatusChange,
}: {
  aiResults: AIResultRow[];
  pendingCount: number;
  allTasks?: AITask[];
  onStatusChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [chatMode, setChatMode] = useState(false);
  const [chatTarget, setChatTarget] = useState<AITask | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string; task?: AITask }[]>([]);
  const [historyMode, setHistoryMode] = useState<'timeline' | 'list'>('timeline');
  const [editModal, setEditModal] = useState<{
    open: boolean; resultId: string; action: string;
    title: string; section: string; content: string; task?: AITask;
  }>({ open: false, resultId: '', action: '', title: '', section: '', content: '' });
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  // All selected by default
  const allSelected = selectedTaskIds.size === 0;

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Filter results by selected tasks
  const filteredResults = allSelected
    ? aiResults
    : aiResults.filter(r => selectedTaskIds.has(r.task_id));

  const notifications = filteredResults
    .filter(r => r.status === 'pending')
    .map(r => {
      const task = allTasks.find(t => t.id === r.task_id);
      return { ...r, task };
    });

  const handleStatus = async (id: string, status: string) => {
    await updateResultStatus(id, status);
    onStatusChange();
  };

  const toggleTaskFilter = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const startChat = (task?: AITask) => {
    setChatMode(true);
    setChatTarget(task || null);
    setChatHistory([]);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setChatHistory(prev => [...prev, { role: 'user', text: chatInput }]);
    const target = chatTarget;
    setTimeout(() => {
      setChatHistory(prev => [...prev, {
        role: 'ai',
        text: '(对话功能接入中... 实际会携带页面上下文调用 AI)',
        task: target || undefined,
      }]);
    }, 500);
    setChatInput('');
  };

  // Collect involved tasks from results
  const involvedTaskIds = [...new Set(aiResults.map(r => r.task_id))];
  const involvedTasks = involvedTaskIds
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean) as AITask[];
  const avatarMembers = involvedTasks.length > 0
    ? involvedTasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }))
    : [{ avatar: '🤖', color: '#8b5cf6' }];

  return (
    <>
      {/* Floating team avatar button */}
      <div
        ref={btnRef}
        onClick={() => { setOpen(!open); setChatMode(false); }}
        style={{
          position: 'fixed', right: 24, top: 80,
          cursor: 'pointer', zIndex: 1000,
          transition: 'transform 0.2s', userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Badge count={pendingCount} size="small" offset={[2, -2]}>
          {involvedTasks.length > 1
            ? <AIFusedAvatar members={avatarMembers} size={42} />
            : <AIAvatar avatar={avatarMembers[0].avatar} color={avatarMembers[0].color} size={42}
                style={{ boxShadow: '0 4px 12px rgba(139,92,246,0.4)' }} />
          }
        </Badge>
      </div>

      {/* Floating panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed', right: 24, top: 132,
            width: 400, maxHeight: 'calc(100vh - 160px)',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
            zIndex: 999, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            border: '1px solid #f0f0f0',
          }}
        >
          {/* Header with team avatars */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
            background: '#faf8ff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>AI 团队</span>
              {pendingCount > 0 && (
                <Tag color="purple" style={{ fontSize: 11 }}>{pendingCount} 项待处理</Tag>
              )}
              <span style={{ flex: 1 }} />
              <Tooltip title="新建对话">
                <Button size="small" type="text" icon={<MessageOutlined />}
                  style={{ color: '#8b5cf6' }}
                  onClick={() => startChat()} />
              </Tooltip>
            </div>

            {/* Avatar filter row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {involvedTasks.map(t => {
                const isActive = allSelected || selectedTaskIds.has(t.id);
                const count = aiResults.filter(r => r.task_id === t.id).length;
                return (
                  <Tooltip key={t.id} title={`${t.name} (${count})`}>
                    <span
                      onClick={() => toggleTaskFilter(t.id)}
                      style={{
                        cursor: 'pointer', opacity: isActive ? 1 : 0.35,
                        transition: 'opacity 0.2s', position: 'relative',
                      }}
                    >
                      <AIAvatar avatar={t.avatar} color={t.avatar_color} size={28} />
                      {count > 0 && (
                        <span style={{
                          position: 'absolute', top: -2, right: -4,
                          background: '#8b5cf6', color: '#fff', borderRadius: 8,
                          fontSize: 9, padding: '0 4px', lineHeight: '14px',
                          minWidth: 14, textAlign: 'center',
                        }}>{count}</span>
                      )}
                    </span>
                  </Tooltip>
                );
              })}
              {/* Extra tasks for new conversation */}
              {allTasks.filter(t => !involvedTaskIds.includes(t.id)).slice(0, 4).map(t => (
                <Tooltip key={t.id} title={`${t.name} — 点击开始对话`}>
                  <span onClick={() => startChat(t)}
                    style={{ cursor: 'pointer', opacity: 0.3 }}>
                    <AIAvatar avatar={t.avatar} color={t.avatar_color} size={28} />
                  </span>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
            {chatMode ? (
              /* Chat mode */
              <div style={{ padding: '12px 12px' }}>
                <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageOutlined />
                  {chatTarget
                    ? <><AIAvatar avatar={chatTarget.avatar} color={chatTarget.avatar_color} size={20} /> 与 {chatTarget.name} 对话</>
                    : '自由对话'
                  }
                  <span style={{ flex: 1 }} />
                  <Button size="small" type="text" onClick={() => setChatMode(false)}
                    style={{ fontSize: 11, color: '#999' }}>返回列表</Button>
                </div>

                {/* Chat history */}
                <div style={{ minHeight: 100, maxHeight: 300, overflow: 'auto', marginBottom: 8 }}>
                  {chatHistory.length === 0 && (
                    <div style={{ color: '#bbb', fontSize: 12, textAlign: 'center', padding: 20 }}>
                      {chatTarget
                        ? `向 ${chatTarget.name} 提问，AI 将携带页面上下文回答`
                        : '输入问题，AI 团队将协作回答'
                      }
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 6, marginBottom: 8,
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}>
                      {msg.role === 'ai' && msg.task && (
                        <AIAvatar avatar={msg.task.avatar} color={msg.task.avatar_color} size={24} />
                      )}
                      <div style={{
                        maxWidth: '75%', padding: '6px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                        ...(msg.role === 'user'
                          ? { background: '#8b5cf6', color: '#fff' }
                          : { background: '#f5f5f5', color: '#333' }
                        ),
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="输入问题..."
                    onPressEnter={sendChat}
                  />
                  <Button type="primary" icon={<SendOutlined />}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                    onClick={sendChat} />
                </Space.Compact>
              </div>
            ) : (
              /* Results tabs */
              <Tabs
                size="small"
                style={{ padding: '0 12px' }}
                items={[
                  {
                    key: 'pending',
                    label: <Badge count={notifications.length} size="small" offset={[8, 0]}>
                      <Space size={4}><BellOutlined /> 待处理</Space>
                    </Badge>,
                    children: notifications.length === 0 ? (
                      <Empty description="暂无待处理" image={Empty.PRESENTED_IMAGE_SIMPLE}
                        style={{ padding: '20px 0' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                        {notifications.map(item => {
                          const isNextAction = item.field_name === 'next_action';
                          let actionData: any = {};
                          if (isNextAction) { try { actionData = JSON.parse(item.new_value); } catch {} }

                          return (
                            <div key={item.id} style={{
                              background: '#faf8ff', border: '1px solid #f0ecff', borderRadius: 8,
                              padding: '10px 12px',
                            }}>
                              {/* Header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                {item.task && <AIAvatar avatar={item.task.avatar} color={item.task.avatar_color} size={22} />}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{item.task?.name || item.task_name}</span>
                                  <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>
                                    {isNextAction ? '建议下一步' : `→ ${item.field_name}`}
                                  </span>
                                </div>
                              </div>

                              {/* Content preview */}
                              <div style={{
                                fontSize: 11, color: '#444', background: '#fff', padding: '6px 8px',
                                borderRadius: 6, marginBottom: 8, lineHeight: 1.5,
                                border: '1px solid #f0f0f0',
                              }}>
                                {isNextAction
                                  ? (actionData.reason || actionData.summary || '').slice(0, 120)
                                  : (item.new_value || '').slice(0, 80)
                                }
                                {((isNextAction ? (actionData.reason || '').length : (item.new_value || '').length) > (isNextAction ? 120 : 80)) && '...'}
                              </div>

                              {/* Action buttons — same style for all types */}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {isNextAction ? (
                                  <>
                                    <Button size="small" type="text" icon={<BookOutlined />}
                                      style={{ fontSize: 11, color: '#8b5cf6' }}
                                      onClick={() => setEditModal({
                                        open: true, resultId: item.id, action: 'knowledge_base',
                                        title: actionData.kb_title || '知识条目',
                                        section: actionData.category || '',
                                        content: actionData.kb_content || actionData.summary || '',
                                        task: item.task,
                                      })}>
                                      知识库
                                    </Button>
                                    <Button size="small" type="text" icon={<FileTextOutlined />}
                                      style={{ fontSize: 11, color: '#52c41a' }}
                                      onClick={() => setEditModal({
                                        open: true, resultId: item.id, action: 'user_manual',
                                        title: actionData.manual_section || '使用手册',
                                        section: actionData.manual_section || '',
                                        content: actionData.manual_content || actionData.summary || '',
                                        task: item.task,
                                      })}>
                                      手册
                                    </Button>
                                    <Button size="small" type="text" icon={<CloseOutlined />}
                                      style={{ fontSize: 11 }} danger
                                      onClick={() => handleStatus(item.id, 'rejected')}>
                                      跳过
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="small" type="text" icon={<CheckOutlined />}
                                      style={{ fontSize: 11, color: '#52c41a' }}
                                      onClick={() => handleStatus(item.id, 'applied')}>
                                      采纳
                                    </Button>
                                    <Button size="small" type="text" icon={<CloseOutlined />}
                                      style={{ fontSize: 11 }} danger
                                      onClick={() => handleStatus(item.id, 'rejected')}>
                                      拒绝
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ),
                  },
                  {
                    key: 'history',
                    label: <Space size={4}><HistoryOutlined /> 全部</Space>,
                    children: filteredResults.length === 0 ? (
                      <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE}
                        style={{ padding: '20px 0' }} />
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                          <Space size={2}>
                            <Button size="small" type={historyMode === 'timeline' ? 'primary' : 'text'}
                              icon={<NodeIndexOutlined />}
                              style={historyMode === 'timeline' ? { background: '#8b5cf6', borderColor: '#8b5cf6', fontSize: 10 } : { fontSize: 10 }}
                              onClick={() => setHistoryMode('timeline')} />
                            <Button size="small" type={historyMode === 'list' ? 'primary' : 'text'}
                              icon={<UnorderedListOutlined />}
                              style={historyMode === 'list' ? { background: '#8b5cf6', borderColor: '#8b5cf6', fontSize: 10 } : { fontSize: 10 }}
                              onClick={() => setHistoryMode('list')} />
                          </Space>
                        </div>
                        {historyMode === 'timeline' ? (
                          <Timeline
                            items={[...filteredResults]
                              .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                              .map(r => {
                                const task = allTasks.find(t => t.id === r.task_id);
                                return {
                                  color: r.status === 'pending' ? 'blue' : r.status === 'applied' ? 'green' : r.status === 'rejected' ? 'red' : 'gray',
                                  dot: task ? <AIAvatar avatar={task.avatar} color={task.avatar_color} size={20} /> : undefined,
                                  content: (
                                    <AIResultPopover results={[r]} tasks={allTasks} onRefresh={onStatusChange} placement="bottomLeft">
                                      <div style={{ paddingBottom: 2, cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: 11, fontWeight: 500 }}>{r.task_name}</span>
                                          <Tag color={STATUS_COLORS[r.status]} style={{ fontSize: 9, margin: 0 }}>{r.status}</Tag>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                                          {r.field_name && <span style={{ color: '#8b5cf6' }}>{r.field_name}</span>}
                                          {r.new_value && (
                                            <span style={{ color: '#999', marginLeft: 4 }}>
                                              {r.new_value.length > 40 ? r.new_value.slice(0, 40) + '...' : r.new_value}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>
                                          {r.model} · {r.tokens_used}t · {r.created_at?.slice(11, 19)}
                                        </div>
                                      </div>
                                    </AIResultPopover>
                                  ),
                                };
                              })}
                          />
                        ) : (
                          <List
                            size="small"
                            dataSource={[...filteredResults].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))}
                            renderItem={r => {
                              const task = allTasks.find(t => t.id === r.task_id);
                              return (
                                <AIResultPopover results={[r]} tasks={allTasks} onRefresh={onStatusChange} placement="bottomLeft">
                                  <List.Item style={{ padding: '6px 0', cursor: 'pointer' }}>
                                    <List.Item.Meta
                                      avatar={task && <AIAvatar avatar={task.avatar} color={task.avatar_color} size={22} />}
                                      title={<Space size={4}>
                                        <span style={{ fontSize: 11 }}>{r.task_name}</span>
                                        <Tag color={STATUS_COLORS[r.status]} style={{ fontSize: 9 }}>{r.status}</Tag>
                                      </Space>}
                                      description={<span style={{ fontSize: 10, color: '#bbb' }}>
                                        {r.field_name || '记录'} · {r.model} · {r.tokens_used}t · {r.created_at?.slice(11, 19)}
                                      </span>}
                                    />
                                  </List.Item>
                                </AIResultPopover>
                              );
                            }}
                          />
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {/* Edit & confirm modal for knowledge actions */}
      <Modal
        open={editModal.open}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editModal.task && <AIAvatar avatar={editModal.task.avatar} color={editModal.task.avatar_color} size={24} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {editModal.action === 'knowledge_base' ? '积累到知识库' : '补充到使用手册'}
              </div>
              {editModal.section && (
                <div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>→ {editModal.section}</div>
              )}
            </div>
          </div>
        }
        width={560}
        okText="确认提交"
        cancelText="取消"
        okButtonProps={{ style: { background: '#8b5cf6', borderColor: '#8b5cf6' } }}
        onOk={async () => {
          await updateResultStatus(editModal.resultId, 'applied');
          message.success(editModal.action === 'knowledge_base' ? '已积累到知识库' : '已补充到使用手册');
          setEditModal(prev => ({ ...prev, open: false }));
          onStatusChange();
        }}
        onCancel={() => setEditModal(prev => ({ ...prev, open: false }))}
      >
        <Input
          value={editModal.title}
          onChange={e => setEditModal(prev => ({ ...prev, title: e.target.value }))}
          style={{ marginBottom: 8, fontWeight: 600 }}
          placeholder="标题"
        />
        <Input.TextArea
          value={editModal.content}
          onChange={e => setEditModal(prev => ({ ...prev, content: e.target.value }))}
          rows={12}
          style={{ fontSize: 13, lineHeight: 1.8, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          AI 已生成内容，可直接编辑后确认提交。支持 Markdown 格式。
        </div>
      </Modal>
    </>
  );
}
