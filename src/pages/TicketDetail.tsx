import { useEffect, useState, useCallback } from 'react';
import {
  Button, Card, Tag, Space, Input, Descriptions, Divider, message, Spin, Timeline,
} from 'antd';
import {
  ArrowLeftOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined, ThunderboltOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAITriggers } from '../components/AITriggers';
import {
  getTicket, addReply, updateResultStatus, replyAssist, processTicket, getTasks,
  type TicketDetail as TicketDetailType, type AIResultRow, type AITask,
} from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { AIResultPopover } from '../components/AIResultPopover';
import { AIFloatingButton } from '../components/AIFloatingButton';
import { RuleConfigPanel } from '../components/RuleConfigPanel';
import { AIEmployeeCard, AIField } from '../components/AIEmployeeCard';

export default function TicketDetail({
  ticketId, onBack,
}: {
  ticketId: string;
  onBack: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [allTasks, setAllTasks] = useState<AITask[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [draftText, setDraftText] = useState('');
  const [intent, setIntent] = useState('');
  const [assistLoading, setAssistLoading] = useState(false);
  const [ruleDrawer, setRuleDrawer] = useState(false);
  const [selectedTone, setSelectedTone] = useState<{ emoji: string; tone: string; zh: string } | null>(null);
  const [aiFillText, setAiFillText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [data, tasks] = await Promise.all([getTicket(ticketId), getTasks()]);
    setTicket(data);
    setAllTasks(tasks);
    const draft = data.aiResults.find(r => r.field_name === 'reply_draft' && r.status === 'pending');
    if (draft) setDraftText(draft.new_value);
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const { AITriggerWrapper } = useAITriggers(
    allTasks,
    (action, ctx) => {
      message.info(`AI 操作: ${action}${ctx.selectedText ? ` — "${ctx.selectedText.slice(0, 30)}..."` : ''}`);
    },
  );

  if (loading || !ticket) return <Spin style={{ padding: 40 }} />;

  const aiByField: Record<string, AIResultRow[]> = {};
  for (const r of ticket.aiResults) {
    (aiByField[r.field_name] ??= []).push(r);
  }
  const latestAI = (field: string) => aiByField[field]?.[0];

  const replyDraft = latestAI('reply_draft');

  const handleApply = async (resultId: string, value: string, field: string) => {
    const status = value !== replyDraft?.new_value ? 'modified' : 'applied';
    await updateResultStatus(resultId, status);
    if (field === 'reply_draft') setReplyText(value);
    message.success(status === 'modified' ? '已修改后采纳' : '已采纳');
    load();
  };

  const handleReject = async (resultId: string) => {
    await updateResultStatus(resultId, 'rejected');
    message.info('已拒绝，AI 将从后续回复中学习');
    load();
  };

  const handleReplyAssist = async (text?: string) => {
    const input = text || intent;
    if (!input.trim()) return;
    setAssistLoading(true);
    try {
      const result = await replyAssist(ticketId, input);
      setReplyText(result.text);
      message.success(`回复已生成 (${result.duration_ms}ms, ${result.tokens_used} tokens)`);
      setIntent('');
      load();
    } catch (e) {
      message.error('生成失败: ' + String(e));
    }
    setAssistLoading(false);
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    await addReply(ticketId, { content: replyText, sender: 'agent' });
    setReplyText('');
    message.success('回复已发送');
    load();
  };

  const handleReprocess = async () => {
    message.loading({ content: '重新处理中...', key: 'rp' });
    await processTicket(ticketId);
    message.success({ content: '处理完成', key: 'rp' });
    load();
  };

  const translationResult = latestAI('translated_content');
  const categoryResult = latestAI('category');
  const priorityResult = latestAI('priority');
  const pendingCount = ticket.aiResults.filter(r => r.status === 'pending').length;

  return (
    <AITriggerWrapper style={{ padding: 24, position: 'relative' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <Button icon={<ThunderboltOutlined />} onClick={handleReprocess}>重新处理</Button>
        <Button icon={<SettingOutlined />} onClick={() => setRuleDrawer(true)}>联动规则</Button>
      </Space>

      {/* Main content — full width now */}
      <Card title={ticket.subject} size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="客户">{ticket.customer_name}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{ticket.customer_email}</Descriptions.Item>
          <Descriptions.Item label="语言">
            <AIField value={ticket.language} results={aiByField['language']}
              tasks={allTasks} onRefresh={load} context={ticket.content} />
          </Descriptions.Item>
          <Descriptions.Item label="分类">
            <AIField value={ticket.category} results={aiByField['category']}
              tasks={allTasks} onRefresh={load} context={ticket.content} />
          </Descriptions.Item>
          <Descriptions.Item label="优先级">
            <AIField value={ticket.priority} results={aiByField['priority']}
              tasks={allTasks} onRefresh={load} context={ticket.content} />
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={ticket.status === 'open' ? 'blue' : ticket.status === 'resolved' ? 'green' : 'orange'}>
              {ticket.status}
            </Tag>
          </Descriptions.Item>
        </Descriptions>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ fontWeight: 600, marginBottom: 8 }}>原文</div>
        <div style={{
          background: '#fafafa', padding: 12, borderRadius: 6,
          whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8,
        }}>
          {ticket.content}
        </div>

        {translationResult && (() => {
          const translateTask = allTasks.find(t => t.id === translationResult.task_id);
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {translateTask && <AIAvatar avatar={translateTask.avatar} color={translateTask.avatar_color} size={20} />}
                中文翻译
              </div>
              <div className="ai-cell-wrapper" style={{
                background: '#faf8ff', borderLeft: '3px solid #8b5cf6',
                padding: 12, borderRadius: '0 6px 6px 0',
                whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8,
                position: 'relative',
              }}>
                {translationResult.new_value}
                <AIResultPopover results={[translationResult]} tasks={allTasks} onRefresh={load}
                  context={ticket.content} placement="rightTop">
                  <span className="ai-cell-icon" style={{
                    position: 'absolute', right: 8, top: 8, cursor: 'pointer',
                  }}>
                    {translateTask
                      ? <AIAvatar avatar={translateTask.avatar} color={translateTask.avatar_color} size={22} />
                      : <span style={{ color: '#8b5cf6', fontSize: 11, fontWeight: 700 }}>AI</span>
                    }
                  </span>
                </AIResultPopover>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Replies */}
      {ticket.replies.length > 0 && (
        <Card title="对话记录" size="small" style={{ marginTop: 16 }}>
          <Timeline items={ticket.replies.map(r => ({
            color: r.sender === 'agent' ? 'blue' : 'green',
            children: (
              <div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                  {r.sender === 'agent' ? '客服' : '客户'} · {r.created_at}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{r.content}</div>
              </div>
            ),
          }))} />
        </Card>
      )}

      {/* Reply area — left: textarea, right: AI card */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        {/* Left: reply textarea */}
        <Card title="回复" size="small" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <Input.TextArea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={8}
              placeholder="输入回复内容..."
              style={{
                fontSize: 13, lineHeight: 1.8, paddingBottom: 36,
                ...(aiFillText && replyText === aiFillText ? {
                  borderColor: '#d8b4fe', background: '#faf8ff',
                } : {}),
              }}
            />
            <div style={{
              position: 'absolute', bottom: 6, right: 8,
              display: 'flex', alignItems: 'center',
            }}>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleSendReply}
                disabled={!replyText.trim()}>
                发送
              </Button>
            </div>
          </div>

          {/* Selected tone explanation */}
          {selectedTone && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 6,
              background: '#faf8ff', border: '1px solid #f0ecff',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1.4 }}>{selectedTone.emoji}</span>
              <div style={{ flex: 1 }}>
                <Tag color="purple" style={{ fontSize: 10, margin: '0 0 4px' }}>{selectedTone.tone}</Tag>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{selectedTone.zh}</div>
              </div>
              <CloseOutlined
                style={{ fontSize: 10, color: '#bbb', cursor: 'pointer', marginTop: 2 }}
                onClick={() => setSelectedTone(null)}
              />
            </div>
          )}
        </Card>

        {/* Right: AI reply card */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <AIReplyCard
            replyDraft={replyDraft}
            allTasks={allTasks}
            intent={intent}
            onIntentChange={setIntent}
            assistLoading={assistLoading}
            onGenerate={handleReplyAssist}
            onSelectTone={(opt) => {
              setReplyText(opt.reply);
              setAiFillText(opt.reply);
              setSelectedTone({ emoji: opt.emoji, tone: opt.tone, zh: opt.zh });
            }}
            selectedTone={selectedTone}
            onRefresh={load}
          />
        </div>
      </div>

      {/* AI Floating Button — replaces right sidebar */}
      <AIFloatingButton
        aiResults={ticket.aiResults}
        pendingCount={pendingCount}
        allTasks={allTasks}
        onStatusChange={load}
      />

      {/* Rule Config Drawer */}
      <RuleConfigPanel
        open={ruleDrawer}
        onClose={() => setRuleDrawer(false)}
        pageId="tickets"
        recordId={ticketId}
      />
    </AITriggerWrapper>
  );
}

function AIReplyCard({
  replyDraft, allTasks, intent, onIntentChange, assistLoading,
  onGenerate, onSelectTone, selectedTone, onRefresh,
}: {
  replyDraft?: AIResultRow;
  allTasks: AITask[];
  intent: string;
  onIntentChange: (v: string) => void;
  assistLoading: boolean;
  onGenerate: (text?: string) => void;
  onSelectTone: (opt: { tone: string; emoji: string; reply: string; zh: string }) => void;
  selectedTone: { emoji: string; tone: string; zh: string } | null;
  onRefresh: () => void;
}) {
  const [hoveredTone, setHoveredTone] = useState<number | null>(null);

  const replyTask = allTasks.find(t => t.id === replyDraft?.task_id);
  let draftOptions: { tone: string; emoji: string; reply: string; zh: string }[] = [];
  if (replyDraft?.status === 'pending') {
    try { draftOptions = JSON.parse(replyDraft.new_value); } catch { /* plain text fallback */ }
    if (!Array.isArray(draftOptions)) draftOptions = [];
  }
  const hasDrafts = replyDraft?.status === 'pending';
  const plainDraft = hasDrafts && draftOptions.length === 0;

  return (
    <AIEmployeeCard
      avatar={replyTask?.avatar || '\u270D\uFE0F'}
      color={replyTask?.avatar_color || '#8b5cf6'}
      name={replyTask?.name || '回复助手'}
      description={hasDrafts
        ? `已生成 ${draftOptions.length || 1} 个建议回复`
        : '用中文说大意，AI 用客户语言生成回复'}
      results={replyDraft ? [replyDraft] : undefined}
      tasks={allTasks}
      onRefresh={onRefresh}
      showChat={false}
      showActions={false}
    >
      {/* Tone option cards */}
      {draftOptions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {draftOptions.map((opt, i) => {
            const isSelected = selectedTone?.tone === opt.tone;
            const isHovered = hoveredTone === i;
            const showFull = isSelected || isHovered;
            return (
              <div
                key={i}
                style={{
                  border: '1px solid ' + (isSelected ? '#8b5cf6' : isHovered ? '#c4b5fd' : '#e8e0f7'),
                  borderRadius: 8, cursor: 'pointer',
                  background: isSelected ? '#ede9fe' : '#fff',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? '0 2px 8px rgba(139,92,246,0.12)' : 'none',
                  overflow: 'hidden',
                }}
                onMouseEnter={() => setHoveredTone(i)}
                onMouseLeave={() => setHoveredTone(null)}
                onClick={() => onSelectTone(opt)}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 10px',
                  borderBottom: showFull ? '1px solid ' + (isSelected ? '#c4b5fd' : '#f0ecff') : 'none',
                }}>
                  <span style={{ fontSize: 15 }}>{opt.emoji}</span>
                  <Tag color={isSelected ? 'purple' : 'default'} style={{ margin: 0, fontSize: 10 }}>{opt.tone}</Tag>
                  <span style={{ fontSize: 11, color: '#888', flex: 1 }}>{opt.zh}</span>
                  {isSelected && <CheckOutlined style={{ fontSize: 10, color: '#8b5cf6' }} />}
                  {!showFull && (
                    <span style={{ fontSize: 10, color: '#ccc' }}>hover 预览</span>
                  )}
                </div>
                {showFull && (
                  <div style={{
                    padding: '8px 10px',
                    fontSize: 11, color: '#555', lineHeight: 1.6,
                    maxHeight: 150, overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    animation: isHovered && !isSelected ? 'fadeIn 0.15s ease' : undefined,
                  }}>
                    {opt.reply}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Plain text draft fallback */}
      {plainDraft && (
        <div style={{
          background: '#fff', border: '1px solid #f0ecff', borderRadius: 6,
          padding: '8px 10px', cursor: 'pointer', marginBottom: 12,
        }}
          onClick={() => onSelectTone({ tone: '默认', emoji: '\u{1F4DD}', reply: replyDraft!.new_value, zh: 'AI 默认生成' })}
        >
          <div style={{
            fontSize: 11, color: '#666', lineHeight: 1.5, whiteSpace: 'pre-wrap',
            maxHeight: 120, overflowY: 'auto',
          }}>
            {replyDraft!.new_value}
          </div>
          <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>点击使用此回复</div>
        </div>
      )}

      {/* Chat input — generate or refine */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Input.TextArea
          value={intent}
          onChange={e => onIntentChange(e.target.value)}
          rows={2}
          placeholder={hasDrafts ? '补充要求，如：更正式一点...' : '如：告诉他正在排查，预计2小时内回复'}
          style={{ fontSize: 12, flex: 1, resize: 'none' }}
          onPressEnter={(e) => {
            if (!e.shiftKey) { e.preventDefault(); onGenerate(); }
          }}
        />
        <Button
          type="primary" size="small"
          loading={assistLoading}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6', height: 52 }}
          onClick={() => {
            if (!intent.trim()) { message.info('请输入回复大意'); return; }
            onGenerate(intent);
          }}
        >
          {hasDrafts ? '重新生成' : '生成'}
        </Button>
      </div>
    </AIEmployeeCard>
  );
}