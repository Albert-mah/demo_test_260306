import { useEffect, useState, useMemo } from 'react';
import {
  Card, Table, Tag, Select, Drawer, Statistic, Row, Col, Space, Button, Upload, message,
} from 'antd';
import {
  ShoppingCartOutlined, ClockCircleOutlined, AppstoreOutlined, UploadOutlined,
  CheckCircleOutlined, FileImageOutlined, FilePdfOutlined, FileExcelOutlined,
  FileTextOutlined, DeleteOutlined, AuditOutlined, EditOutlined,
} from '@ant-design/icons';
import {
  getOrders, getCustomers, getTickets, getResults, getTasks, uploadVoucher, updateOrder,
  type OrderRow, type CustomerRow, type TicketListRow, type AIResultRow, type AITask,
} from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { AIResultPopover } from '../components/AIResultPopover';
import { AIFloatingButton } from '../components/AIFloatingButton';
import { CustomerHoverCard } from '../components/CustomerHoverCard';
import { AITriggerWrapper } from '../components/AITriggers';
import { AIChatModal, type ChatMessage } from '../components/AIChatModal';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待付款' },
  paid: { color: 'green', label: '已付款' },
  cancelled: { color: 'red', label: '已取消' },
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', GBP: '\u00A3', CNY: '\u00A5', EUR: '\u20AC', JPY: '\u00A5',
};

function formatAmount(amount: number, currency: string) {
  const symbol = CURRENCY_SYMBOL[currency] || currency + ' ';
  return `${symbol}${amount.toLocaleString()}`;
}

function parseAnalysis(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const FILE_ICON_MAP: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  image: <FileImageOutlined style={{ color: '#1677ff' }} />,
  excel: <FileExcelOutlined style={{ color: '#52c41a' }} />,
  text: <FileTextOutlined style={{ color: '#999' }} />,
};

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  return 'text';
}

export default function OrderPanel() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [aiResults, setAiResults] = useState<AIResultRow[]>([]);
  const [allTasks, setAllTasks] = useState<AITask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  // Upload popup state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string }[]>([]);

  // AI chat modal state (uses shared AIChatModal)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<Record<string, unknown> | null>(null);

  const load = async () => {
    setLoading(true);
    const [o, c, t, tasks, results] = await Promise.all([
      getOrders(), getCustomers(), getTickets(), getTasks(),
      getResults({ page_id: 'orders' }),
    ]);
    setOrders(o);
    setCustomers(c);
    setTickets(t);
    setAllTasks(tasks);
    setAiResults(results);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!statusFilter) return orders;
    return orders.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const withVoucher = orders.filter(o => o.voucher_text && o.status === 'pending').length;
  const aiPendingCount = aiResults.filter(r => r.status === 'pending').length;

  const currencyBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) { map[o.currency] = (map[o.currency] || 0) + 1; }
    return Object.entries(map);
  }, [orders]);

  const resultsByOrder = useMemo(() => {
    const map = new Map<string, AIResultRow[]>();
    for (const r of aiResults) {
      const arr = map.get(r.record_id) || [];
      arr.push(r);
      map.set(r.record_id, arr);
    }
    return map;
  }, [aiResults]);

  // Open upload popup then start AI chat
  const handleStartChat = () => {
    if (!selectedOrder || uploadedFiles.length === 0) return;
    setUploadOpen(false);

    const filesSummary = uploadedFiles.map(f => f.name).join(', ');
    setChatMessages([{
      role: 'user',
      text: `请校对这笔订单的转账凭证。\n订单: ${selectedOrder.id}\n金额: ${formatAmount(selectedOrder.amount, selectedOrder.currency)}\n客户: ${selectedOrder.customer_name}`,
      files: uploadedFiles.map(f => ({ name: f.name, size: f.size })),
    }]);
    setChatResult(null);
    setChatOpen(true);
    setChatLoading(true);

    const voucherText = `[文件上传] ${filesSummary}\n\n(Demo: 文件内容已模拟提取)\n\nSWIFT MT103\nSender: ${selectedOrder.customer_name}\nAmount: ${selectedOrder.currency} ${selectedOrder.amount}\nReference: ${selectedOrder.id}\nDate: ${new Date().toISOString().split('T')[0]}`;

    uploadVoucher(selectedOrder.id, voucherText).then(async () => {
      await load();
      const updated = (await getOrders()).find(o => o.id === selectedOrder.id);
      if (updated) {
        setSelectedOrder(updated);
        const a = parseAnalysis(updated.voucher_analysis);
        if (a) {
          setChatResult(a);
          setChatMessages(prev => [...prev, {
            role: 'ai', text: buildAnalysisText(a), actionable: true,
            actionLabel: (a.match ? '确认付款' : '标记已审'),
          }]);
        }
      }
      setChatLoading(false);
    }).catch(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: '分析出错，请重试。' }]);
      setChatLoading(false);
    });
  };

  // Handle chat send from AIChatModal
  const handleChatSend = async (text: string, msgFiles?: { name: string; size: number }[]) => {
    if (!selectedOrder) return;

    setChatMessages(prev => [...prev, { role: 'user', text, files: msgFiles }]);
    setChatLoading(true);

    const fileContext = msgFiles?.length ? `\n[追加文件] ${msgFiles.map(f => f.name).join(', ')}` : '';
    try {
      const voucherText = `${selectedOrder.voucher_text || ''}\n\n[追加对话] ${text}${fileContext}`;
      await uploadVoucher(selectedOrder.id, voucherText);
      await load();
      const updated = (await getOrders()).find(o => o.id === selectedOrder.id);
      if (updated) {
        setSelectedOrder(updated);
        const a = parseAnalysis(updated.voucher_analysis);
        if (a) {
          setChatResult(a);
          setChatMessages(prev => [...prev, {
            role: 'ai', text: buildAnalysisText(a), actionable: true,
            actionLabel: (a.match ? '确认付款' : '标记已审'),
          }]);
        } else {
          setChatMessages(prev => [...prev, { role: 'ai', text: '已收到补充信息，核对结果未变化。' }]);
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: '处理出错，请重试。' }]);
    }
    setChatLoading(false);
  };

  // Apply AI result
  const handleApplyResult = async () => {
    if (!selectedOrder || !chatResult) return;
    if (chatResult.match) {
      await updateOrder(selectedOrder.id, { status: 'paid' } as any);
      message.success('已确认付款，订单标记为已付');
    } else {
      message.info('结果已标记，请人工复核差异项');
    }
    setChatOpen(false);
    await load();
    const updated = (await getOrders()).find(o => o.id === selectedOrder.id);
    if (updated) setSelectedOrder(updated);
  };

  const handleMarkPaid = async (orderId: string) => {
    await updateOrder(orderId, { status: 'paid' } as any);
    message.success('已标记为已付款');
    await load();
    const updated = orders.find(o => o.id === orderId);
    if (updated) setSelectedOrder({ ...updated, status: 'paid' });
    else setSelectedOrder(null);
  };

  const voucherTask = allTasks.find(t => t.id === 'task-voucher');

  const columns = [
    {
      title: '单号', dataIndex: 'id', key: 'id', width: 120,
      render: (v: string, record: OrderRow) => (
        <a onClick={(e) => {
          e.stopPropagation();
          setSelectedOrder(record);
          setUploadedFiles([]);
        }} style={{ fontWeight: 500 }}>
          {v}
        </a>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (v: string) => (
        <CustomerHoverCard customerName={v} customers={customers} tickets={tickets} orders={orders}>
          <span style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9' }}>{v}</span>
        </CustomerHoverCard>
      ),
    },
    {
      title: '金额',
      key: 'amount',
      render: (_: unknown, r: OrderRow) => formatAmount(r.amount, r.currency),
      sorter: (a: OrderRow, b: OrderRow) => a.amount - b.amount,
    },
    {
      title: '币种',
      dataIndex: 'currency',
      key: 'currency',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '凭证', key: 'voucher', width: 80, align: 'center' as const,
      render: (_: unknown, r: OrderRow) => {
        if (r.status !== 'pending' && !r.voucher_text) return null;
        const hasVoucher = !!r.voucher_text;
        if (!hasVoucher) return <span style={{ color: '#d9d9d9', fontSize: 11 }}>{'\u2014'}</span>;

        const orderResults = resultsByOrder.get(r.id) || [];
        const analysis = parseAnalysis(r.voucher_analysis);
        const match = analysis?.match as boolean | undefined;

        if (orderResults.length > 0) {
          return (
            <AIResultPopover results={orderResults} tasks={allTasks} onRefresh={load}
              context={`订单: ${r.id}\n金额: ${formatAmount(r.amount, r.currency)}\n客户: ${r.customer_name}`}
              placement="bottomRight">
              <span className="ai-cell-wrapper" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <AIAvatar
                  avatar={voucherTask?.avatar || '\u{1F4B0}'}
                  color={match === false ? (Number(analysis?.confidence || 0) >= 60 ? '#faad14' : '#ff4d4f') : '#52c41a'}
                  size={22}
                />
                {r.status === 'paid' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 10 }} />}
              </span>
            </AIResultPopover>
          );
        }

        // Has voucher but no AI results yet — show dim avatar
        return (
          <span style={{ cursor: 'default' }}>
            <AIAvatar
              avatar={voucherTask?.avatar || '\u{1F4B0}'}
              color={voucherTask?.avatar_color || '#faad14'}
              size={22}
              style={{ opacity: 0.3 }}
            />
          </span>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
    },
  ];

  const analysis = selectedOrder ? parseAnalysis(selectedOrder.voucher_analysis) : null;
  const selectedResults = selectedOrder ? (resultsByOrder.get(selectedOrder.id) || []) : [];
  const hasAIResult = !!analysis || selectedResults.length > 0;

  return (
    <AITriggerWrapper tasks={allTasks} onAction={(action, ctx) => {
      message.info(`AI 操作: ${action}${ctx.selectedText ? ` — "${ctx.selectedText.slice(0, 30)}..."` : ''}`);
    }} style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          <ShoppingCartOutlined /> 订单管理
        </h2>
        <Select
          placeholder="筛选状态"
          allowClear
          style={{ width: 140 }}
          size="small"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: '待付款', value: 'pending' },
            { label: '已付款', value: 'paid' },
            { label: '已取消', value: 'cancelled' },
          ]}
        />
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        点击订单查看详情。上传转账凭证后点击「AI 校对」，通过对话式交互完成凭证核对。
      </div>

      {/* Summary cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="订单总数" value={orders.length} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="待处理" value={pendingCount} prefix={<ClockCircleOutlined />}
              valueStyle={pendingCount > 0 ? { color: '#faad14' } : undefined} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="待核验凭证" value={withVoucher}
              prefix={<AIAvatar avatar={'\u{1F4B0}'} color="#faad14" size={16} />}
              valueStyle={withVoucher > 0 ? { color: '#faad14' } : undefined} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>币种分布</div>
            <Space size={4}>
              {currencyBreakdown.map(([cur, count]) => (
                <Tag key={cur} icon={<AppstoreOutlined />}>{cur}: {String(count)}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Order table */}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        onRow={(record) => {
          const rowAnalysis = parseAnalysis(record.voucher_analysis);
          const rowMatch = rowAnalysis?.match as boolean | undefined;
          const rowHasAnalysis = !!rowAnalysis;
          let rowBg: string | undefined;
          if (rowHasAnalysis && record.status === 'pending') {
            const conf = Number(rowAnalysis?.confidence || 0);
            rowBg = rowMatch ? '#f6ffed' : conf >= 60 ? '#fffbe6' : '#fff2f0';
          }
          return {
            onClick: () => {
              setSelectedOrder(record);
              setUploadedFiles([]);
            },
            style: { cursor: 'pointer', background: rowBg },
          };
        }}
      />

      {/* Detail drawer */}
      <Drawer
        title="订单详情"
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        width={640}
      >
        {selectedOrder && (
          <div style={{ position: 'relative' }}>
            {/* Order info */}
            <Card size="small" style={{ marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}><p style={{ margin: '4px 0' }}><strong>客户:</strong> {selectedOrder.customer_name}</p></Col>
                <Col span={12}><p style={{ margin: '4px 0' }}><strong>单号:</strong> {selectedOrder.id}</p></Col>
                <Col span={12}><p style={{ margin: '4px 0' }}><strong>金额:</strong> {formatAmount(selectedOrder.amount, selectedOrder.currency)}</p></Col>
                <Col span={12}><p style={{ margin: '4px 0' }}><strong>币种:</strong> {selectedOrder.currency}</p></Col>
                <Col span={12}>
                  <p style={{ margin: '4px 0' }}>
                    <strong>状态:</strong>{' '}
                    {(() => { const s = STATUS_MAP[selectedOrder.status] || { color: 'default', label: selectedOrder.status }; return <Tag color={s.color}>{s.label}</Tag>; })()}
                  </p>
                </Col>
                <Col span={12}><p style={{ margin: '4px 0' }}><strong>创建:</strong> {selectedOrder.created_at}</p></Col>
              </Row>
            </Card>

            {/* Pending: upload trigger button */}
            {selectedOrder.status === 'pending' && !selectedOrder.voucher_text && (
              <Button
                type="primary" block icon={<UploadOutlined />}
                onClick={() => { setUploadedFiles([]); setUploadOpen(true); }}
                style={{ marginBottom: 12, background: '#faad14', borderColor: '#faad14' }}
              >
                上传转账凭证并 AI 校对
              </Button>
            )}

            {/* Voucher already uploaded — compact display + edit/re-chat buttons */}
            {selectedOrder.voucher_text && (
              <Card size="small" title="凭证内容" style={{ marginBottom: 12 }}
                extra={
                  <Space size={4}>
                    {selectedOrder.status === 'pending' && (
                      <Button size="small" type="text" icon={<EditOutlined />}
                        onClick={() => { setUploadedFiles([]); setUploadOpen(true); }}
                        style={{ fontSize: 11 }}>
                        编辑附件
                      </Button>
                    )}
                    <Button size="small" type="text" icon={<AuditOutlined />}
                      onClick={() => {
                        const existingAnalysis = parseAnalysis(selectedOrder.voucher_analysis);
                        const msgs: ChatMessage[] = [
                          { role: 'user', text: '请校对这笔订单的转账凭证。' },
                        ];
                        if (existingAnalysis) {
                          msgs.push({
                            role: 'ai', text: buildAnalysisText(existingAnalysis),
                            actionable: true, actionLabel: existingAnalysis.match ? '确认付款' : '标记已审',
                          });
                          setChatResult(existingAnalysis);
                        }
                        setChatMessages(msgs);
                        setChatOpen(true);
                      }}
                      style={{ fontSize: 11, color: '#8b5cf6' }}>
                      AI 对话
                    </Button>
                  </Space>
                }
              >
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, maxHeight: 120, overflow: 'auto' }}>
                  {selectedOrder.voucher_text}
                </pre>
              </Card>
            )}

            {/* Warning banner — color by analysis result */}
            {analysis && (() => {
              const match = analysis.match as boolean | undefined;
              const confidence = Number(analysis.confidence || 0);
              // Color scheme: match=green, low confidence=orange, mismatch=red
              const level = match ? 'safe' : confidence >= 60 ? 'warn' : 'danger';
              const colorMap = {
                safe:   { bg: '#f6ffed', border: '#b7eb8f', accent: '#52c41a', text: '匹配' },
                warn:   { bg: '#fffbe6', border: '#ffe58f', accent: '#faad14', text: '需复核' },
                danger: { bg: '#fff2f0', border: '#ffccc7', accent: '#ff4d4f', text: '异常' },
              };
              const c = colorMap[level];
              return (
                <Card size="small" style={{
                  marginBottom: 12,
                  background: c.bg,
                  borderColor: c.border,
                  borderLeft: `4px solid ${c.accent}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={c.accent} style={{ color: '#fff', fontWeight: 600, border: 'none' }}>{c.text}</Tag>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      置信度 {String(analysis.confidence || '\u2014')}%
                    </span>
                    {Array.isArray(analysis.discrepancies) && (analysis.discrepancies as string[]).length > 0 && (
                      <Tag color="red" style={{ fontSize: 10 }}>{(analysis.discrepancies as string[]).length} 项差异</Tag>
                    )}
                    <div style={{ flex: 1 }} />
                    {selectedOrder.status === 'pending' && match && (
                      <Button type="primary" size="small" icon={<CheckCircleOutlined />}
                        onClick={() => handleMarkPaid(selectedOrder.id)}
                        style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                        确认付款
                      </Button>
                    )}
                    {selectedOrder.status === 'pending' && !match && (
                      <Button size="small"
                        onClick={() => handleMarkPaid(selectedOrder.id)}
                        style={{ borderColor: '#faad14', color: '#faad14' }}>
                        手动确认
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })()}

            {/* Floating AI avatar — shown when AI has processed this order */}
            {hasAIResult && (() => {
              const match = analysis?.match as boolean | undefined;
              const confidence = Number(analysis?.confidence || 0);
              const avatarColor = match ? '#52c41a' : confidence >= 60 ? '#faad14' : '#ff4d4f';
              return (
                <div
                  style={{
                    position: 'fixed', right: 660, top: '50%', transform: 'translateY(-50%)',
                    cursor: 'pointer', zIndex: 1010,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                  onClick={() => {
                    const existingAnalysis = analysis || (selectedResults.length > 0 ? parseAnalysis(selectedOrder.voucher_analysis) : null);
                    const msgs: ChatMessage[] = [
                      { role: 'user', text: '请校对这笔订单的转账凭证。' },
                    ];
                    if (existingAnalysis) {
                      msgs.push({
                        role: 'ai', text: buildAnalysisText(existingAnalysis),
                        actionable: true, actionLabel: existingAnalysis.match ? '确认付款' : '标记已审',
                      });
                      setChatResult(existingAnalysis);
                    }
                    setChatMessages(msgs);
                    setChatOpen(true);
                  }}
                  title="点击与 AI 校对员对话"
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${avatarColor}, #8b5cf6)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 4px 16px ${avatarColor}66`,
                    border: '3px solid #fff',
                    fontSize: 22,
                    transition: 'all 0.3s',
                  }}>
                    {voucherTask?.avatar || '\u{1F4B0}'}
                  </div>
                  <div style={{
                    fontSize: 10, color: '#fff', fontWeight: 600,
                    background: avatarColor, borderRadius: 10,
                    padding: '1px 8px', whiteSpace: 'nowrap',
                  }}>
                    {match ? '匹配' : '需复核'}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>

      {/* Upload popup — file management card */}
      <Drawer
        title={<Space><UploadOutlined /> 凭证附件管理</Space>}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        width={420}
        extra={
          <Button type="primary" icon={<AuditOutlined />}
            disabled={uploadedFiles.length === 0}
            onClick={handleStartChat}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
            AI 校对
          </Button>
        }
      >
        <Upload.Dragger
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.xls,.xlsx,.csv,.txt,.doc,.docx"
          beforeUpload={(file) => {
            setUploadedFiles(prev => [...prev, { name: file.name, size: file.size, type: file.type }]);
            return false;
          }}
          showUploadList={false}
        >
          <p style={{ marginBottom: 4 }}>
            <UploadOutlined style={{ fontSize: 24, color: '#faad14' }} />
          </p>
          <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
            拖拽文件到此处，或点击选择（支持多文件）
          </p>
          <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
            PDF、图片、Excel、Word、文本文件
          </p>
        </Upload.Dragger>

        {uploadedFiles.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
              已选 {uploadedFiles.length} 个文件
            </div>
            {uploadedFiles.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: '#fafafa', borderRadius: 6, marginBottom: 4, fontSize: 12,
                border: '1px solid #f0f0f0',
              }}>
                {FILE_ICON_MAP[getFileType(f.name)] || FILE_ICON_MAP.text}
                <span style={{ flex: 1 }}>{f.name}</span>
                <span style={{ color: '#999', fontSize: 11 }}>{(f.size / 1024).toFixed(1)}KB</span>
                <DeleteOutlined
                  style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}
                  onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#999' }}>
          上传凭证文件后点击「AI 校对」，系统将自动分析凭证与订单的匹配度，并进入对话式交互。
        </div>
      </Drawer>

      {/* AI Chat Modal — shared component with file upload + voice */}
      <AIChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        avatar={voucherTask?.avatar || '\u{1F4B0}'}
        color="#8b5cf6"
        name={voucherTask?.name || '财务核对员'}
        subtitle="AI 凭证校对"
        messages={chatMessages}
        loading={chatLoading}
        onSend={handleChatSend}
        onAction={handleApplyResult}
        placeholder="补充信息或追问，可添加附件或语音..."
        context={selectedOrder ? `订单: ${selectedOrder.id} | ${formatAmount(selectedOrder.amount, selectedOrder.currency)}` : undefined}
      />

      {/* AI Floating Button */}
      <AIFloatingButton
        aiResults={aiResults}
        pendingCount={aiPendingCount}
        allTasks={allTasks}
        onStatusChange={load}
      />
    </AITriggerWrapper>
  );
}

function buildAnalysisText(analysis: Record<string, unknown>): string {
  const match = analysis.match as boolean | undefined;
  const lines: string[] = [];
  lines.push(match ? '校对结果: 匹配' : '校对结果: 需复核');
  lines.push(`置信度: ${String(analysis.confidence || '-')}%`);
  if (analysis.voucher_amount) lines.push(`凭证金额: ${String(analysis.voucher_amount)}`);
  if (analysis.voucher_payer) lines.push(`付款方: ${String(analysis.voucher_payer)}`);
  if (Array.isArray(analysis.discrepancies) && analysis.discrepancies.length > 0) {
    lines.push(`差异项:`);
    for (const d of analysis.discrepancies) lines.push(`  - ${String(d)}`);
  }
  if (analysis.recommendation) lines.push(`\n建议: ${String(analysis.recommendation)}`);
  return lines.join('\n');
}
