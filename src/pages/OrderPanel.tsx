import { useEffect, useState, useMemo } from 'react';
import { Card, Table, Tag, Select, Drawer, Statistic, Row, Col, Space, Button, Input, Upload, message, Spin, Tooltip } from 'antd';
import {
  ShoppingCartOutlined, ClockCircleOutlined, AppstoreOutlined, UploadOutlined,
  CheckCircleOutlined, FileImageOutlined, FilePdfOutlined, FileExcelOutlined,
  FileTextOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
  getOrders, getCustomers, getTickets, getResults, getTasks, uploadVoucher, updateOrder,
  type OrderRow, type CustomerRow, type TicketListRow, type AIResultRow, type AITask,
} from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { AIResultPopover } from '../components/AIResultPopover';
import { AIFloatingButton } from '../components/AIFloatingButton';
import { CustomerHoverCard } from '../components/CustomerHoverCard';
import { AIEmployeeCard } from '../components/AIEmployeeCard';
import { useAITriggers } from '../components/AITriggers';

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

  // Upload state
  const [voucherInput, setVoucherInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');

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

  const { AITriggerWrapper } = useAITriggers(
    allTasks,
    (action, ctx) => {
      message.info(`AI 操作: ${action}${ctx.selectedText ? ` — "${ctx.selectedText.slice(0, 30)}..."` : ''}`);
    },
  );

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

  const handleUploadVoucher = async () => {
    if (!selectedOrder) return;
    const text = inputMode === 'text'
      ? voucherInput.trim()
      : uploadedFiles.length > 0
        ? `[文件上传] ${uploadedFiles.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join(', ')}\n\n(Demo: 文件内容已模拟提取为文本进行分析)\n\nSWIFT MT103\nSender: ${selectedOrder.customer_name}\nAmount: ${selectedOrder.currency} ${selectedOrder.amount}\nReference: ${selectedOrder.id}\nDate: ${new Date().toISOString().split('T')[0]}`
        : '';
    if (!text) return;

    setAnalyzing(true);
    try {
      await uploadVoucher(selectedOrder.id, text);
      message.success('凭证分析完成');
      await load();
      const updated = (await getOrders()).find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    } catch {
      message.error('凭证分析失败');
    }
    setAnalyzing(false);
  };

  const handleMarkPaid = async (orderId: string) => {
    await updateOrder(orderId, { status: 'paid' } as any);
    message.success('已标记为已付款');
    await load();
    const updated = orders.find(o => o.id === orderId);
    if (updated) setSelectedOrder({ ...updated, status: 'paid' });
    else setSelectedOrder(null);
  };

  const columns = [
    {
      title: '单号', dataIndex: 'id', key: 'id', width: 120,
      render: (v: string, record: OrderRow) => (
        <a onClick={(e) => {
          e.stopPropagation();
          setSelectedOrder(record);
          setVoucherInput('');
          setUploadedFiles([]);
          setInputMode('file');
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
        if (!hasVoucher) {
          return <span style={{ color: '#d9d9d9', fontSize: 11 }}>{'\u2014'}</span>;
        }

        const orderResults = resultsByOrder.get(r.id) || [];
        const voucherTask = allTasks.find(t => t.id === 'task-voucher');
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
                  color={voucherTask?.avatar_color || '#faad14'}
                  size={22}
                  style={{ opacity: match === false ? 1 : 0.7 }}
                />
                {r.status === 'paid' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 10 }} />}
              </span>
            </AIResultPopover>
          );
        }

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

  return (
    <AITriggerWrapper style={{ padding: 24 }}>
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
        点击订单查看详情。待付款订单可上传转账凭证（PDF/图片/Excel），财务核对员自动分析匹配度。悬浮头像查看详情，可采纳/拒绝/编辑/对话。
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
                <Tag key={cur} icon={<AppstoreOutlined />}>{cur}: {count}</Tag>
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
        onRow={(record) => ({
          onClick: () => {
            setSelectedOrder(record);
            setVoucherInput('');
            setUploadedFiles([]);
            setInputMode('file');
          },
          style: { cursor: 'pointer' },
        })}
      />

      {/* Detail drawer — wider, two-column layout */}
      <Drawer
        title="订单详情"
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        width={760}
      >
        {selectedOrder && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left column: order info + upload */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Card size="small" style={{ marginBottom: 12 }}>
                <p><strong>客户:</strong> {selectedOrder.customer_name}</p>
                <p><strong>金额:</strong> {formatAmount(selectedOrder.amount, selectedOrder.currency)}</p>
                <p><strong>币种:</strong> {selectedOrder.currency}</p>
                <p>
                  <strong>状态:</strong>{' '}
                  {(() => { const s = STATUS_MAP[selectedOrder.status] || { color: 'default', label: selectedOrder.status }; return <Tag color={s.color}>{s.label}</Tag>; })()}
                </p>
                <p><strong>创建时间:</strong> {selectedOrder.created_at}</p>
              </Card>

              {/* Voucher upload — file + text modes */}
              {selectedOrder.status === 'pending' && !selectedOrder.voucher_text && (
                <Card size="small"
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space><UploadOutlined /><span>上传转账凭证</span></Space>
                      <Space size={0}>
                        <Button type={inputMode === 'file' ? 'primary' : 'text'} size="small"
                          style={inputMode === 'file' ? { background: '#faad14', borderColor: '#faad14', fontSize: 11 } : { fontSize: 11 }}
                          onClick={() => setInputMode('file')}>
                          文件上传
                        </Button>
                        <Button type={inputMode === 'text' ? 'primary' : 'text'} size="small"
                          style={inputMode === 'text' ? { background: '#faad14', borderColor: '#faad14', fontSize: 11 } : { fontSize: 11 }}
                          onClick={() => setInputMode('text')}>
                          粘贴文本
                        </Button>
                      </Space>
                    </div>
                  }
                  style={{ marginBottom: 12, borderColor: '#faad14', borderStyle: 'dashed' }}
                >
                  {inputMode === 'file' ? (
                    <>
                      <Upload.Dragger
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.xls,.xlsx,.csv,.txt,.doc,.docx"
                        beforeUpload={(file) => {
                          setUploadedFiles(prev => [...prev, { name: file.name, size: file.size, type: file.type }]);
                          return false;
                        }}
                        showUploadList={false}
                        style={{ marginBottom: uploadedFiles.length > 0 ? 8 : 0 }}
                      >
                        <p style={{ marginBottom: 4 }}>
                          <UploadOutlined style={{ fontSize: 24, color: '#faad14' }} />
                        </p>
                        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
                          拖拽文件到此处，或点击选择
                        </p>
                        <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
                          支持 PDF、图片、Excel、Word、文本文件
                        </p>
                      </Upload.Dragger>

                      {/* Uploaded file list */}
                      {uploadedFiles.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {uploadedFiles.map((f, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                              background: '#fafafa', borderRadius: 4, marginBottom: 4,
                              fontSize: 12,
                            }}>
                              {FILE_ICON_MAP[getFileType(f.name)] || FILE_ICON_MAP.text}
                              <span style={{ flex: 1 }}>{f.name}</span>
                              <span style={{ color: '#999', fontSize: 11 }}>{(f.size / 1024).toFixed(1)}KB</span>
                              <DeleteOutlined
                                style={{ color: '#999', cursor: 'pointer', fontSize: 11 }}
                                onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Input.TextArea
                      rows={6}
                      placeholder={'SWIFT Transfer Confirmation\nSender: ...\nAmount: ...\nReference: ...'}
                      value={voucherInput}
                      onChange={e => setVoucherInput(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                  )}

                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Button type="primary" icon={<UploadOutlined />}
                      onClick={handleUploadVoucher} loading={analyzing}
                      disabled={inputMode === 'text' ? !voucherInput.trim() : uploadedFiles.length === 0}
                      style={{ background: '#faad14', borderColor: '#faad14' }}
                    >
                      {analyzing ? '分析中...' : '上传并分析'}
                    </Button>
                    {analyzing && (
                      <>
                        <AIAvatar avatar={'\u{1F4B0}'} color="#faad14" size={20} />
                        <span style={{ fontSize: 12, color: '#faad14' }}>财务核对员正在分析...</span>
                        <Spin size="small" />
                      </>
                    )}
                  </div>
                </Card>
              )}

              {/* Voucher text display */}
              {selectedOrder.voucher_text && (
                <Card size="small" title="凭证内容" style={{ marginBottom: 12 }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                    {selectedOrder.voucher_text}
                  </pre>
                </Card>
              )}

              {/* Waiting state */}
              {selectedOrder.voucher_text && !analysis && selectedOrder.status === 'pending' && (
                <Card size="small" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AIAvatar avatar={'\u{1F4B0}'} color="#faad14" size={24} />
                    <span style={{ color: '#999', fontSize: 12 }}>凭证已上传，等待财务核对员分析...</span>
                  </div>
                </Card>
              )}
            </div>

            {/* Right column: AI employee card — analysis + conversation */}
            {(analysis || selectedResults.length > 0) && (() => {
              const voucherTask = allTasks.find(t => t.id === 'task-voucher');
              const match = analysis?.match as boolean | undefined;
              return (
                <div style={{ width: 360, flexShrink: 0 }}>
                  <AIEmployeeCard
                    avatar={voucherTask?.avatar || '\u{1F4B0}'}
                    color={voucherTask?.avatar_color || '#faad14'}
                    name={voucherTask?.name || '财务核对员'}
                    description={analysis ? (match ? '匹配' : '需复核') + ' \u00B7 置信度 ' + String(analysis.confidence || '\u2014') + '%' : '等待分析...'}
                    results={selectedResults}
                    tasks={allTasks}
                    onRefresh={load}
                    context={`订单: ${selectedOrder.id}\n金额: ${formatAmount(selectedOrder.amount, selectedOrder.currency)}\n客户: ${selectedOrder.customer_name}`}
                    chatPlaceholder="如：核实付款人名称 / 金额差多少..."
                    extraActions={selectedOrder.status === 'pending' && analysis ? (
                      match ? (
                        <Button type="primary" size="small" icon={<CheckCircleOutlined />}
                          onClick={() => handleMarkPaid(selectedOrder.id)}
                          style={{ background: '#52c41a', borderColor: '#52c41a', width: '100%' }}>
                          确认付款，标记为已付
                        </Button>
                      ) : (
                        <div>
                          <Button type="primary" size="small"
                            onClick={() => handleMarkPaid(selectedOrder.id)}
                            style={{ background: '#faad14', borderColor: '#faad14', width: '100%', marginBottom: 4 }}>
                            手动确认付款
                          </Button>
                          <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>凭证存在差异，请人工复核后再确认</div>
                        </div>
                      )
                    ) : undefined}
                  >
                    {analysis && (
                      <>
                        <div style={{
                          padding: '8px 12px', borderRadius: 6, marginBottom: 8,
                          background: match ? '#f6ffed' : '#fff7e6',
                          border: match ? '1px solid #b7eb8f' : '1px solid #ffe58f',
                        }}>
                          <Tag color={match ? 'green' : 'orange'} style={{ marginRight: 8 }}>
                            {match ? '匹配' : '需复核'}
                          </Tag>
                          <span style={{ fontWeight: 600 }}>
                            置信度 {String(analysis.confidence || '\u2014')}%
                          </span>
                        </div>
                        <div style={{
                          background: '#faf8ff', borderLeft: '2px solid #faad14',
                          padding: '6px 10px', borderRadius: '0 6px 6px 0',
                          marginBottom: 8, fontSize: 12, lineHeight: 1.8, color: '#444',
                        }}>
                          {analysis.voucher_amount && <p style={{ margin: '2px 0' }}><strong>凭证金额:</strong> {String(analysis.voucher_amount)}</p>}
                          {analysis.voucher_payer && <p style={{ margin: '2px 0' }}><strong>付款方:</strong> {String(analysis.voucher_payer)}</p>}
                          {Array.isArray(analysis.discrepancies) && (analysis.discrepancies as string[]).length > 0 && (
                            <div style={{ margin: '2px 0' }}>
                              <strong>差异项:</strong>
                              <ul style={{ margin: '2px 0', paddingLeft: 16 }}>
                                {(analysis.discrepancies as string[]).map((d: string, i: number) => (
                                  <li key={i} style={{ color: '#fa541c' }}>{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {analysis.recommendation && (
                            <div style={{
                              marginTop: 6, padding: '4px 8px', borderRadius: 4,
                              background: '#f5f0ff', borderLeft: '3px solid #8b5cf6',
                              fontSize: 11, color: '#555',
                            }}>
                              {String(analysis.recommendation)}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </AIEmployeeCard>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>

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
