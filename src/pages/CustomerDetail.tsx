import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Button, Card, Tag, Space, Input, Descriptions, Divider, message, Spin,
  Row, Col, Progress, Tabs, List, Empty, Tooltip, Drawer,
} from 'antd';
import {
  ArrowLeftOutlined, ReloadOutlined, CustomerServiceOutlined,
  ShoppingCartOutlined, MailOutlined, SendOutlined,
  SwapRightOutlined, UserOutlined, TranslationOutlined, EditOutlined,
} from '@ant-design/icons';
import {
  getCustomer, getTickets, getOrders, getEmails, getResults, getTasks,
  getEmailTranslations, getEmailSummaries, emailQA, emailReply,
  type CustomerRow, type TicketListRow, type OrderRow, type EmailRow,
  type EmailTranslationRow, type EmailSummaryRow, type AIResultRow, type AITask,
} from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { AIResultPopover } from '../components/AIResultPopover';
import { AIFloatingButton } from '../components/AIFloatingButton';
import { AIEmployeeCard, AIInsightBlock, AIField } from '../components/AIEmployeeCard';
import { useAITriggers } from '../components/AITriggers';

const LICENSE_COLORS: Record<string, string> = {
  enterprise: 'purple', professional: 'blue', community: 'green',
};
const COUNTRY_FLAGS: Record<string, string> = {
  '德国': '🇩🇪', '日本': '🇯🇵', '中国': '🇨🇳', '英国': '🇬🇧', '美国': '🇺🇸',
};
const LANG_COLORS: Record<string, string> = {
  '英语': 'blue', '德语': 'orange', '中文': 'green', '日语': 'red',
};
const DIR_MAP: Record<string, { color: string; label: string }> = {
  inbound: { color: 'green', label: '收件' },
  outbound: { color: 'blue', label: '发件' },
};

function scoreColor(s: number) {
  if (s >= 80) return '#52c41a';
  if (s >= 60) return '#faad14';
  return '#f5222d';
}

interface ChatMessage { role: 'user' | 'ai'; text: string }

export default function CustomerDetail({
  customerId, onBack,
}: {
  customerId: string;
  onBack: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [translations, setTranslations] = useState<Map<string, EmailTranslationRow>>(new Map());
  const [summary, setSummary] = useState<EmailSummaryRow | null>(null);
  const [aiResults, setAiResults] = useState<AIResultRow[]>([]);
  const [emailAiResults, setEmailAiResults] = useState<AIResultRow[]>([]);
  const [allTasks, setAllTasks] = useState<AITask[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailRow | null>(null);
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});

  // Email Q&A state
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Email Reply state
  const [replyMode, setReplyMode] = useState(false);
  const [replyIntent, setReplyIntent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyResult, setReplyResult] = useState<string | null>(null);

  const { AITriggerWrapper } = useAITriggers(
    allTasks,
    (action, ctx) => {
      message.info(`AI 操作: ${action}${ctx.selectedText ? ` — "${ctx.selectedText.slice(0, 30)}..."` : ''}`);
    },
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [c, ts, os, tasks] = await Promise.all([
      getCustomer(customerId), getTickets(), getOrders(), getTasks(),
    ]);
    setCustomer(c);
    setAllTasks(tasks);
    setTickets(ts.filter(t => t.customer_name === c.name));
    setOrders(os.filter(o => o.customer_id === c.id));

    // Load AI results for this customer
    const results = await getResults({ page_id: 'customers', record_id: customerId });
    setAiResults(results);

    setLoading(false);

    // Load emails + translations + summaries + email AI results
    setEmailLoading(true);
    try {
      const [ems, trs, sums] = await Promise.all([
        getEmails(c.id),
        getEmailTranslations({ customer_id: c.id }),
        getEmailSummaries(c.id),
      ]);
      setEmails(ems);
      const tMap = new Map<string, EmailTranslationRow>();
      trs.forEach(t => tMap.set(t.email_id, t));
      setTranslations(tMap);
      setSummary(sums.length > 0 ? sums[0] : null);

      // Load email translation AI results
      const emailIds = ems.map(e => e.id);
      if (emailIds.length > 0) {
        const emailRes = await getResults({ page_id: 'emails' });
        setEmailAiResults(emailRes.filter(r => emailIds.includes(r.record_id)));
      }
    } catch { setEmails([]); }
    setEmailLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Helpers — group AI results by field
  const aiByField: Record<string, AIResultRow[]> = {};
  for (const r of aiResults) {
    (aiByField[r.field_name] ??= []).push(r);
  }
  const latestAI = (field: string) => aiByField[field]?.[0];

  // Email AI results by email_id
  const emailResultMap = new Map<string, AIResultRow[]>();
  for (const r of emailAiResults) {
    const arr = emailResultMap.get(r.record_id) || [];
    arr.push(r);
    emailResultMap.set(r.record_id, arr);
  }

  // All AI results combined for floating button
  const allAiResults = [...aiResults, ...emailAiResults];
  const pendingCount = allAiResults.filter(r => r.status === 'pending').length;

  // Email Q&A
  const handleAsk = async () => {
    if (!customer || !qaInput.trim()) return;
    const question = qaInput.trim();
    setChatHistory(prev => [...prev, { role: 'user', text: question }]);
    setQaInput('');
    setQaLoading(true);
    try {
      const res = await emailQA(customer.id, question);
      setChatHistory(prev => [...prev, { role: 'ai', text: res.text }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', text: '抱歉，查询失败，请重试。' }]);
    }
    setQaLoading(false);
  };

  // Email Reply
  const handleReply = async () => {
    if (!customer || !replyIntent.trim()) return;
    setReplyLoading(true);
    try {
      const res = await emailReply(customer.id, replyIntent.trim(), selectedEmail?.id);
      setReplyResult(res.text);
      message.success('回复已生成');
    } catch {
      message.error('生成失败');
    }
    setReplyLoading(false);
  };

  if (loading || !customer) return <Spin style={{ padding: 40 }} />;

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress');
  const totalOrderAmount = orders.reduce((sum, o) => sum + o.amount, 0);
  const sat = customer.satisfaction_score;
  const riskLevel = sat >= 80 ? 'low' : sat >= 60 ? 'medium' : 'high';
  const riskLabels: Record<string, string> = { low: '流失风险低', medium: '需关注', high: '高流失风险' };
  const riskColors: Record<string, string> = { low: '#52c41a', medium: '#faad14', high: '#f5222d' };

  const toggleTranslation = (emailId: string) => {
    setShowTranslation(prev => ({ ...prev, [emailId]: !prev[emailId] }));
  };

  const backgroundResult = latestAI('background');
  const satisfactionResult = latestAI('satisfaction_insight');
  const complianceResult = latestAI('compliance_check');

  return (
    <AITriggerWrapper style={{ padding: 24, position: 'relative' }}>
      {/* Top bar */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>

      {/* Customer info card */}
      <Card title={customer.name} size="small"
        extra={<Tag color={LICENSE_COLORS[customer.license_type]}>{customer.license_type}</Tag>}
      >
        <Descriptions column={2} size="small">
          <Descriptions.Item label="公司">{customer.company}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{customer.email}</Descriptions.Item>
          <Descriptions.Item label="地区">
            {COUNTRY_FLAGS[customer.country] || ''} {customer.country}
          </Descriptions.Item>
          <Descriptions.Item label="满意度">
            {satisfactionResult ? (
              <AIField value={
                <Space size={6}>
                  <Progress percent={sat} size="small" strokeColor={scoreColor(sat)}
                    style={{ width: 80, margin: 0 }} format={() => ''} />
                  <span style={{ fontWeight: 600, color: scoreColor(sat) }}>{sat}</span>
                  <Tag color={riskColors[riskLevel]} style={{ fontSize: 10, margin: 0 }}>
                    {riskLabels[riskLevel]}
                  </Tag>
                </Space>
              } results={[satisfactionResult]} tasks={allTasks} onRefresh={load} />
            ) : (
              <Space size={6}>
                <Progress percent={sat} size="small" strokeColor={scoreColor(sat)}
                  style={{ width: 80, margin: 0 }} format={() => ''} />
                <span style={{ fontWeight: 600, color: scoreColor(sat) }}>{sat}</span>
                <Tag color={riskColors[riskLevel]} style={{ fontSize: 10, margin: 0 }}>
                  {riskLabels[riskLevel]}
                </Tag>
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>

        {/* Background — AI-filled field with interactive popover */}
        {customer.background && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div className="ai-cell-wrapper" style={{
              background: '#faf8ff', borderLeft: '3px solid #13c2c2',
              padding: 12, borderRadius: '0 6px 6px 0',
              fontSize: 13, lineHeight: 1.8, color: '#333',
              position: 'relative',
            }}>
              {customer.background}
              {backgroundResult && (
                <AIResultPopover results={[backgroundResult]} tasks={allTasks} onRefresh={load}
                  context={`客户: ${customer.name}\n地区: ${customer.country}\n许可: ${customer.license_type}`}
                  placement="bottomRight">
                  <span className="ai-cell-icon" style={{
                    position: 'absolute', right: 8, top: 8, cursor: 'pointer',
                  }}>
                    <AIAvatar avatar="🔍" color="#13c2c2" size={22} />
                  </span>
                </AIResultPopover>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Main layout: left tabs + right AI panel */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        {/* Left: Tabs */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs
            size="small"
            items={[
              {
                key: 'emails',
                label: (
                  <Space size={4}>
                    <MailOutlined /> {'邮件'} ({emailLoading ? '...' : emails.length})
                    {translations.size > 0 && (
                      <AIAvatar avatar="🌐" color="#1677ff" size={14}
                        style={{ opacity: 0.6 }} />
                    )}
                  </Space>
                ),
                children: (
                  <Card size="small">
                    {emailLoading ? (
                      <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                    ) : emails.length === 0 ? (
                      <Empty description="暂无邮件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ) : (
                      <List size="small" dataSource={emails}
                        renderItem={em => {
                          const tr = translations.get(em.id);
                          const isOpen = showTranslation[em.id];
                          const isSelected = selectedEmail?.id === em.id;
                          const emResults = emailResultMap.get(em.id) || [];
                          const translateTask = allTasks.find(t => t.id === 'task-translate');
                          return (
                            <List.Item
                              style={{
                                cursor: 'pointer', display: 'block',
                                background: isSelected ? '#f0ebff' : undefined,
                              }}
                              onClick={() => {
                                setSelectedEmail(isSelected ? null : em);
                                setReplyMode(false);
                                setReplyResult(null);
                              }}
                            >
                              {/* Email header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                <Tag color={DIR_MAP[em.direction]?.color || 'default'} style={{ fontSize: 10 }}>
                                  {DIR_MAP[em.direction]?.label || em.direction}
                                </Tag>
                                <Tag color={LANG_COLORS[em.language] || 'default'} style={{ fontSize: 10 }}>
                                  {em.language}
                                </Tag>
                                <span style={{ fontWeight: 500, fontSize: 12, flex: 1 }}>{em.subject}</span>
                                {tr && emResults.length > 0 ? (
                                  <AIResultPopover results={emResults} tasks={allTasks} onRefresh={load}
                                    context={`邮件: ${em.subject}\n语言: ${em.language}`}
                                    placement="bottomRight">
                                    <Tooltip title={isOpen ? '隐藏翻译' : '查看翻译 (点击查看详情)'}>
                                      <span
                                        onClick={(e) => { e.stopPropagation(); toggleTranslation(em.id); }}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        <AIAvatar
                                          avatar={translateTask?.avatar || '🌐'}
                                          color={translateTask?.avatar_color || '#1677ff'}
                                          size={18}
                                          style={{ opacity: isOpen ? 1 : 0.5 }}
                                        />
                                      </span>
                                    </Tooltip>
                                  </AIResultPopover>
                                ) : tr ? (
                                  <Tooltip title={isOpen ? '隐藏翻译' : '查看翻译'}>
                                    <Button type="text" size="small"
                                      icon={<TranslationOutlined />}
                                      onClick={(e) => { e.stopPropagation(); toggleTranslation(em.id); }}
                                      style={{ color: isOpen ? '#1677ff' : '#bbb', fontSize: 14 }}
                                    />
                                  </Tooltip>
                                ) : null}
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {em.from_addr} <SwapRightOutlined style={{ color: '#bbb' }} /> {em.to_addr}
                                <span style={{ marginLeft: 8 }}>
                                  {new Date(em.created_at).toLocaleString('zh-CN')}
                                </span>
                              </div>

                              {/* Translation side-by-side */}
                              {tr && isOpen && (
                                <div style={{
                                  display: 'flex', gap: 8, marginTop: 8,
                                  padding: 8, borderRadius: 6, background: '#fafafa',
                                }}>
                                  <div style={{ flex: 1, padding: 8, borderRadius: 4, fontSize: 12, lineHeight: 1.6 }}>
                                    <Tag color={LANG_COLORS[em.language] || 'default'} style={{ fontSize: 10, marginBottom: 4 }}>
                                      {em.language} 原文
                                    </Tag>
                                    <div style={{ whiteSpace: 'pre-wrap', color: '#444' }}>{em.body}</div>
                                  </div>
                                  <div className="ai-cell-wrapper" style={{
                                    flex: 1, padding: 8, borderRadius: 4, fontSize: 12, lineHeight: 1.6,
                                    background: '#f0f7ff', borderLeft: '3px solid #1677ff',
                                    position: 'relative',
                                  }}>
                                    <Space size={4} style={{ marginBottom: 4 }}>
                                      <AIAvatar avatar="🌐" color="#1677ff" size={14} />
                                      <Tag color="blue" style={{ fontSize: 10 }}>
                                        {tr.target_lang} 翻译
                                      </Tag>
                                    </Space>
                                    <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{tr.translated_text}</div>
                                  </div>
                                </div>
                              )}
                            </List.Item>
                          );
                        }}
                      />
                    )}
                  </Card>
                ),
              },
              {
                key: 'tickets',
                label: <span><CustomerServiceOutlined /> 工单 ({tickets.length})</span>,
                children: (
                  <Card size="small">
                    {tickets.length === 0 ? (
                      <Empty description="暂无工单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ) : (
                      <List size="small" dataSource={tickets}
                        renderItem={t => (
                          <List.Item>
                            <List.Item.Meta
                              title={<span style={{ fontSize: 13 }}>{t.subject}</span>}
                              description={
                                <Space size={4}>
                                  <Tag color={t.status === 'open' ? 'blue' : t.status === 'resolved' ? 'green' : 'orange'}>
                                    {t.status}
                                  </Tag>
                                  {t.priority && <Tag>{t.priority}</Tag>}
                                  {t.category && <Tag color="default">{t.category}</Tag>}
                                  <span style={{ fontSize: 11, color: '#999' }}>{t.created_at?.slice(0, 10)}</span>
                                </Space>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    )}
                  </Card>
                ),
              },
              {
                key: 'orders',
                label: <span><ShoppingCartOutlined /> 订单 ({orders.length})</span>,
                children: (
                  <Card size="small">
                    {orders.length === 0 ? (
                      <Empty description="暂无订单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ) : (
                      <List size="small" dataSource={orders}
                        renderItem={o => (
                          <List.Item>
                            <List.Item.Meta
                              title={<span style={{ fontSize: 13 }}>{o.currency} {o.amount.toLocaleString()}</span>}
                              description={
                                <Space size={4}>
                                  <Tag color={o.status === 'paid' ? 'green' : o.status === 'pending' ? 'orange' : 'default'}>
                                    {o.status === 'paid' ? '已付款' : o.status === 'pending' ? '待付款' : o.status}
                                  </Tag>
                                  <span style={{ fontSize: 11, color: '#999' }}>{o.created_at?.slice(0, 10)}</span>
                                </Space>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    )}
                  </Card>
                ),
              },
            ]}
          />
        </div>

        {/* Right: AI panel */}
        <div style={{ width: 360, flexShrink: 0 }}>
          {/* AI Customer 360 — interactive card */}
          <AIEmployeeCard
            avatar="🔍"
            color="#13c2c2"
            name="AI 客户 360"
            description="3 位 AI 员工协作分析"
            team={[
              { avatar: '🔍', color: '#13c2c2' },
              { avatar: '😊', color: '#52c41a' },
              { avatar: '🛡️', color: '#f5222d' },
            ]}
            teamMode="parallel"
            showActions={false}
            showChat={false}
            style={{ marginBottom: 16 }}
          >
            <div style={{ padding: '12px 14px' }}>
              <Row gutter={8}>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: 10, marginBottom: 2 }}><CustomerServiceOutlined /> 工单</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{tickets.length}</div>
                  {openTickets.length > 0 && (
                    <Tag color="orange" style={{ fontSize: 10 }}>{openTickets.length} 待处理</Tag>
                  )}
                </Col>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: 10, marginBottom: 2 }}><ShoppingCartOutlined /> 订单</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{orders.length}</div>
                  {totalOrderAmount > 0 && (
                    <div style={{ fontSize: 10, color: '#888' }}>${totalOrderAmount.toLocaleString()}</div>
                  )}
                </Col>
                <Col span={8} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: 10, marginBottom: 2 }}><MailOutlined /> 邮件</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{emailLoading ? '-' : emails.length}</div>
                </Col>
              </Row>

              <Divider style={{ margin: '10px 0' }} />

              {/* 客户成功顾问 insight — with popover */}
              <AIInsightBlock
                result={satisfactionResult}
                tasks={allTasks}
                onRefresh={load}
                context={`客户: ${customer.name}\n满意度: ${sat}`}
              >
                <Space size={4} style={{ marginBottom: 4 }}>
                  <Progress percent={sat} size="small" strokeColor={scoreColor(sat)}
                    style={{ width: 60, margin: 0 }} format={() => ''} />
                  <span style={{ fontWeight: 600, color: scoreColor(sat) }}>{sat}分</span>
                  <Tag color={riskColors[riskLevel]} style={{ fontSize: 10, margin: 0 }}>
                    {riskLabels[riskLevel]}
                  </Tag>
                </Space>
                <div style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>
                  {satisfactionResult?.new_value || (
                    riskLevel === 'low'
                      ? '客户活跃度高，满意度良好。建议推动升级销售或推荐计划。'
                      : riskLevel === 'medium'
                        ? '满意度一般，建议主动跟进工单解决情况，安排客户成功经理回访。'
                        : '满意度偏低，存在流失风险。建议优先解决未完成工单，安排高级主管介入。'
                  )}
                </div>
              </AIInsightBlock>

              {/* 合规审查员 — with popover */}
              <AIInsightBlock
                result={complianceResult}
                tasks={allTasks}
                onRefresh={load}
                context={`客户: ${customer.name}\n许可证: ${customer.license_type}`}
              >
                <div style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>
                  {complianceResult?.new_value || (
                    customer.license_type === 'community'
                      ? `社区版用户，当前用量正常。${orders.length > 0 ? '已有订单记录，具备升级潜力。' : '暂无商业订单。'}`
                      : customer.license_type === 'enterprise'
                        ? `企业版授权有效。${tickets.length > 3 ? '工单频率较高，建议检查是否需要额外培训支持。' : '使用状况正常。'}`
                        : `专业版授权有效。${totalOrderAmount > 50000 ? '业务量较大，可推荐企业版升级。' : '当前版本匹配度良好。'}`
                  )}
                </div>
              </AIInsightBlock>
            </div>
          </AIEmployeeCard>

          {/* Email Summary — interactive card */}
          {summary && (
            <AIEmployeeCard
              avatar="📧"
              color="#eb2f96"
              name="邮件秘书 — 邮件摘要"
              description={`基于 ${summary.email_count} 封邮件自动生成`}
              borderColor="#f5c2de"
              bgColor="#fff9fb"
              gradientFrom="#fff9fb"
              gradientTo="#fdf0f6"
              results={aiResults.filter(r => r.task_id === 'task-email-summary')}
              tasks={allTasks}
              onRefresh={load}
            >
              <div style={{
                padding: '10px 14px', fontSize: 12, lineHeight: 1.8, color: '#444',
                maxHeight: 300, overflowY: 'auto',
              }}>
                {summary.summary.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 700, fontSize: 13, marginTop: 8, marginBottom: 4, color: '#333' }}>{line.slice(3)}</div>;
                  if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 600, fontSize: 12, marginTop: 6, marginBottom: 2, color: '#555' }}>{line.slice(4)}</div>;
                  if (line.startsWith('- [ ] ')) return <div key={i} style={{ paddingLeft: 12, color: '#fa541c' }}>☐ {line.slice(6)}</div>;
                  if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 12 }}>• {line.slice(2)}</div>;
                  if (line.match(/^\d+\./)) return <div key={i} style={{ paddingLeft: 8 }}>{line}</div>;
                  if (line.trim() === '') return <div key={i} style={{ height: 4 }} />;
                  return <div key={i}>{line}</div>;
                })}
              </div>
            </AIEmployeeCard>
          )}

        </div>
      </div>

      {/* Email detail Drawer */}
      <Drawer
        title={selectedEmail?.subject}
        open={!!selectedEmail}
        onClose={() => { setSelectedEmail(null); setReplyMode(false); setReplyResult(null); setChatHistory([]); }}
        width={640}
        extra={
          selectedEmail?.direction === 'inbound' && (
            <Button size="small" type={replyMode ? 'primary' : 'default'}
              icon={<EditOutlined />}
              onClick={() => { setReplyMode(!replyMode); setReplyResult(null); }}
              style={replyMode ? { background: '#52c41a', borderColor: '#52c41a' } : {}}>
              AI 回复
            </Button>
          )
        }
      >
        {selectedEmail && (
          <div>
            {/* Email metadata */}
            <div style={{ marginBottom: 12 }}>
              <Space size={4}>
                <Tag color={DIR_MAP[selectedEmail.direction]?.color || 'default'}>
                  {DIR_MAP[selectedEmail.direction]?.label || selectedEmail.direction}
                </Tag>
                <Tag color={LANG_COLORS[selectedEmail.language] || 'default'}>
                  {selectedEmail.language}
                </Tag>
              </Space>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {selectedEmail.from_addr} → {selectedEmail.to_addr}
                <span style={{ marginLeft: 8 }}>{new Date(selectedEmail.created_at).toLocaleString('zh-CN')}</span>
              </div>
            </div>

            {/* Email body */}
            <Card size="small" style={{ marginBottom: 12 }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, lineHeight: 1.8 }}>
                {selectedEmail.body}
              </pre>
            </Card>

            {/* Translation if available */}
            {(() => {
              const tr = translations.get(selectedEmail.id);
              if (!tr) return null;
              const emResults = emailResultMap.get(selectedEmail.id) || [];
              return (
                <div className="ai-cell-wrapper" style={{
                  padding: 12, borderRadius: 6, marginBottom: 12,
                  background: '#f0f7ff', borderLeft: '3px solid #1677ff',
                }}>
                  <Space size={4} style={{ marginBottom: 4 }}>
                    <AIAvatar avatar="🌐" color="#1677ff" size={16} />
                    <Tag color="blue" style={{ fontSize: 10 }}>{tr.target_lang} 翻译</Tag>
                    {emResults.length > 0 && (
                      <AIResultPopover results={emResults} tasks={allTasks} onRefresh={load}
                        context={`邮件: ${selectedEmail.subject}\n语言: ${selectedEmail.language}`}
                        placement="bottomRight">
                        <span style={{ cursor: 'pointer', fontSize: 11, color: '#8b5cf6' }}>详情</span>
                      </AIResultPopover>
                    )}
                  </Space>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: 13, lineHeight: 1.8 }}>
                    {tr.translated_text}
                  </div>
                </div>
              );
            })()}

            {/* AI Reply Assistant */}
            {replyMode && (
              <AIEmployeeCard
                avatar="✍️"
                color="#52c41a"
                name="回复助手"
                description={`用中文告诉我你要回复什么，我用${selectedEmail.language}写正式回复`}
                showActions={false}
                showChat={false}
                style={{ marginBottom: 12 }}
              >
                <div style={{ padding: '10px 14px' }}>
                  <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                    <Input
                      placeholder="例：告诉他我们支持，周五安排技术会议"
                      value={replyIntent}
                      onChange={e => setReplyIntent(e.target.value)}
                      onPressEnter={handleReply}
                      disabled={replyLoading}
                    />
                    <Button
                      type="primary" icon={<SendOutlined />}
                      onClick={handleReply} loading={replyLoading}
                      disabled={!replyIntent.trim()}
                      style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                    >
                      生成
                    </Button>
                  </Space.Compact>
                  {replyLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Spin size="small" />
                      <span style={{ fontSize: 11, color: '#999' }}>正在生成双语回复...</span>
                    </div>
                  )}
                  {replyResult && (
                    <div style={{
                      background: '#faf8ff', borderRadius: 4, padding: 12,
                      borderLeft: '3px solid #8b5cf6',
                      fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                    }}>
                      {replyResult}
                    </div>
                  )}
                </div>
              </AIEmployeeCard>
            )}

            {/* Email Q&A */}
            <AIEmployeeCard
              avatar="📧"
              color="#eb2f96"
              name="邮件秘书 — 邮件问答"
              description={`关于此邮件或 ${customer?.name} 的 ${emails.length} 封邮件提问`}
              borderColor="#f5c2de"
              bgColor="#fff9fb"
              gradientFrom="#fff9fb"
              gradientTo="#fdf0f6"
              showActions={false}
              showChat={false}
            >
              <div style={{ padding: '10px 14px' }}>
                <div style={{
                  minHeight: 80, maxHeight: 220, overflowY: 'auto', marginBottom: 8,
                  border: '1px solid #f0f0f0', borderRadius: 6, padding: 8,
                  background: '#fff',
                }}>
                  {chatHistory.length === 0 && !qaLoading && (
                    <div style={{ color: '#bbb', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
                      基于客户邮件历史回答问题<br />
                      例如："最近讨论了什么？""有待办事项吗？"
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 6, marginBottom: 8,
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}>
                      {msg.role === 'ai' && <AIAvatar avatar="📧" color="#eb2f96" size={24} />}
                      <div style={{
                        maxWidth: '80%', padding: '6px 10px',
                        borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                        background: msg.role === 'user' ? '#fce4ec' : '#fff',
                        border: msg.role === 'ai' ? '1px solid #f5c2de' : 'none',
                        fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                      }}>
                        {msg.text}
                      </div>
                      {msg.role === 'user' && (
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                          background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12,
                        }}>
                          <UserOutlined />
                        </div>
                      )}
                    </div>
                  ))}
                  {qaLoading && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <AIAvatar avatar="📧" color="#eb2f96" size={24} />
                      <div style={{ padding: '6px 10px', borderRadius: '10px 10px 10px 2px', background: '#fff', border: '1px solid #f5c2de' }}>
                        <Spin size="small" /> <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>分析邮件中...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="输入关于邮件的问题..."
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onPressEnter={handleAsk}
                    disabled={qaLoading || emailLoading}
                    size="small"
                  />
                  <Button
                    type="primary" icon={<SendOutlined />}
                    onClick={handleAsk} loading={qaLoading}
                    disabled={!qaInput.trim() || emailLoading}
                    size="small"
                    style={{ background: '#eb2f96', borderColor: '#eb2f96' }}
                  />
                </Space.Compact>
              </div>
            </AIEmployeeCard>
          </div>
        )}
      </Drawer>

      {/* AI Floating Button */}
      <AIFloatingButton
        aiResults={allAiResults}
        pendingCount={pendingCount}
        allTasks={allTasks}
        onStatusChange={load}
      />
    </AITriggerWrapper>
  );
}