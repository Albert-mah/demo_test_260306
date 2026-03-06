import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Drawer, Descriptions, Timeline, message, Empty,
  Input, Tooltip, Divider,
} from 'antd';
import {
  ReloadOutlined, RobotOutlined, RedoOutlined, EyeOutlined,
  MessageOutlined, UserOutlined, AimOutlined,
  CloudOutlined, DesktopOutlined, ClockCircleOutlined, ApiOutlined,
  SendOutlined, FileTextOutlined, LinkOutlined,
  EditOutlined,
} from '@ant-design/icons';
import {
  getResults, getResultContext, retryResult, updateResultStatus, addAuditNote,
  type AIResultRow, type ResultContext,
} from '../api';
import { useResponsive } from '../hooks/useResponsive';

const STATUS_COLORS: Record<string, string> = {
  pending: 'blue', applied: 'green', rejected: 'red', modified: 'orange', expired: 'default', failed: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '待处理', applied: '已采纳', rejected: '已拒绝', modified: '已修改', expired: '已过期', failed: '失败',
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

// Page labels for display
const PAGE_LABELS: Record<string, string> = {
  tickets: '工单管理', customers: '客户管理', orders: '订单管理',
  emails: '邮件管理', 'email-summaries': '邮件摘要',
};

export default function ExecutionPanel() {
  const { isMobile } = useResponsive();
  const [results, setResults] = useState<AIResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [context, setContext] = useState<ResultContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const load = async () => {
    setLoading(true);
    setResults(await getResults());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (resultId: string) => {
    setContextLoading(true);
    setDetailOpen(true);
    setNoteInput('');
    const ctx = await getResultContext(resultId);
    setContext(ctx);
    setContextLoading(false);
  };

  const handleRetry = async (resultId: string) => {
    message.loading({ content: '重试中...', key: 'retry' });
    try {
      const result = await retryResult(resultId);
      message.success({ content: `重试完成 (新 ID: ${result.id})`, key: 'retry' });
      load();
      if (context?.result.id === resultId) openDetail(result.id);
    } catch (e) {
      message.error({ content: '重试失败: ' + String(e), key: 'retry' });
    }
  };

  const handleStatus = async (resultId: string, status: string) => {
    await updateResultStatus(resultId, status);
    message.success(status === 'applied' ? '已采纳' : status === 'rejected' ? '已拒绝' : '已处理');
    load();
    if (context?.result.id === resultId) openDetail(resultId);
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !context) return;
    setAddingNote(true);
    await addAuditNote(context.result.id, noteInput.trim());
    message.success('备注已添加');
    setNoteInput('');
    setAddingNote(false);
    openDetail(context.result.id);
  };

  const columns = [
    {
      title: '任务', key: 'task', width: 160,
      render: (_: unknown, r: AIResultRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.task_name}</div>
          <Tag color="purple" style={{ fontSize: 10 }}>{ACTION_LABELS[r.action] || r.action}</Tag>
        </div>
      ),
    },
    {
      title: '锚定位置', key: 'anchor', width: 180,
      render: (_: unknown, r: AIResultRow) => (
        <div style={{ fontSize: 11 }}>
          <div><span style={{ color: '#999' }}>页面:</span> {PAGE_LABELS[r.page_id] || r.page_id || '-'}</div>
          <div><span style={{ color: '#999' }}>记录:</span> {r.record_id}</div>
          <div><span style={{ color: '#999' }}>字段:</span> {r.field_name || '(记录级)'}</div>
        </div>
      ),
    },
    {
      title: '输出', dataIndex: 'new_value', key: 'output', ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v?.slice(0, 60)}{v?.length > 60 ? '...' : ''}</span>,
    },
    {
      title: '来源', key: 'source', width: 100,
      render: (_: unknown, r: AIResultRow) => {
        const src = TRIGGER_SOURCE_CONFIG[r.trigger_source] || TRIGGER_SOURCE_CONFIG.backend;
        return (
          <div style={{ fontSize: 11 }}>
            <Tag icon={src.icon} color={src.color} style={{ fontSize: 10 }}>{src.label}</Tag>
            {r.trigger_user && r.trigger_user !== 'system' && (
              <div style={{ color: '#999', marginTop: 2 }}>{r.trigger_user}</div>
            )}
          </div>
        );
      },
    },
    {
      title: '模型', key: 'model', width: 130,
      render: (_: unknown, r: AIResultRow) => (
        <div style={{ fontSize: 11 }}>
          <div>{r.model}</div>
          <div style={{ color: '#999' }}>{r.tokens_used}t · {r.duration_ms}ms</div>
        </div>
      ),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
    },
    {
      title: '时间', dataIndex: 'created_at', key: 'time', width: 80,
      render: (v: string) => <span style={{ fontSize: 11, color: '#999' }}>{v?.slice(11, 19)}</span>,
    },
    {
      title: '', key: 'ops', width: 120,
      render: (_: unknown, r: AIResultRow) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} title="详情" />
          <Button size="small" type="text" icon={<RedoOutlined />} onClick={() => handleRetry(r.id)} title="重试" />
          {r.status === 'pending' && (
            <>
              <Button size="small" type="text" style={{ color: '#52c41a' }}
                onClick={() => handleStatus(r.id, 'applied')} title="采纳">✓</Button>
              <Button size="small" type="text" danger
                onClick={() => handleStatus(r.id, 'rejected')} title="拒绝">✕</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}><RobotOutlined style={{ color: '#8b5cf6' }} /> 执行记录</h2>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        所有 AI 任务的执行历史 — 点击查看完整输入输出、执行依据、审计记录。每条记录锚定到具体页面/记录/字段。
      </div>

      <Table dataSource={results} columns={columns} rowKey="id" size="small"
        loading={loading} pagination={{ pageSize: 20 }}
      />

      {/* Detail Drawer */}
      <Drawer
        title={context ? `执行详情: ${context.result.task_name}` : '加载中...'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 680}
        loading={contextLoading}
      >
        {context && (() => {
          const r = context.result;
          const src = TRIGGER_SOURCE_CONFIG[r.trigger_source] || TRIGGER_SOURCE_CONFIG.backend;
          return (
          <div>
            {/* 基本信息 */}
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="ID"><span style={{ fontSize: 11 }}>{r.id}</span></Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status] || r.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作">
                <Tag color="purple">{ACTION_LABELS[r.action] || r.action}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型">{r.model}</Descriptions.Item>
              <Descriptions.Item label="Token">{r.tokens_used}</Descriptions.Item>
              <Descriptions.Item label="耗时">{r.duration_ms}ms</Descriptions.Item>
              <Descriptions.Item label="置信度">{r.confidence}%</Descriptions.Item>
              <Descriptions.Item label="创建时间">{r.created_at}</Descriptions.Item>
            </Descriptions>

            {/* 触发来源 & 定位 */}
            <Card size="small" title={<><AimOutlined style={{ color: '#8b5cf6' }} /> 触发来源 & 定位</>} style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="触发方式">
                  <Tag icon={src.icon} color={src.color}>{src.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="触发动作">{r.trigger_action || '-'}</Descriptions.Item>
                <Descriptions.Item label="触发用户">
                  <Space size={4}>
                    <UserOutlined style={{ fontSize: 11 }} />
                    <span>{r.trigger_user || 'system'}</span>
                    {r.trigger_user_id && <span style={{ color: '#bbb', fontSize: 10 }}>({r.trigger_user_id})</span>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="来源 IP">{r.trigger_ip || '-'}</Descriptions.Item>
                <Descriptions.Item label="目标页面">
                  <Space size={4}>
                    <LinkOutlined style={{ fontSize: 11 }} />
                    <span>{PAGE_LABELS[r.page_id] || r.page_id || '-'}</span>
                    <span style={{ color: '#bbb', fontSize: 10 }}>{r.trigger_page_path}</span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="目标字段">{r.field_name || '(记录级)'}</Descriptions.Item>
                <Descriptions.Item label="记录 ID">{r.record_id}</Descriptions.Item>
                <Descriptions.Item label="区块位置">{r.trigger_block_pos || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 执行依据 */}
            <Card size="small" title={<><FileTextOutlined style={{ color: '#fa8c16' }} /> 执行依据</>} style={{ marginBottom: 16 }}>
              {r.prompt_used ? (
                <div style={{ marginBottom: r.input_data && Object.keys(r.input_data).length > 0 ? 12 : 0 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>Prompt 模板（渲染后）</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#fffbe6', padding: 10, borderRadius: 4, margin: 0, border: '1px solid #ffe58f' }}>
                    {r.prompt_used}
                  </pre>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#ccc', marginBottom: 8 }}>无 Prompt 记录</div>
              )}
              {r.input_data && Object.keys(r.input_data).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>输入参数</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#f6ffed', padding: 10, borderRadius: 4, margin: 0, border: '1px solid #b7eb8f' }}>
                    {JSON.stringify(r.input_data, null, 2)}
                  </pre>
                </div>
              )}
            </Card>

            {/* 输出 */}
            <Card size="small" title="输出结果" style={{ marginBottom: 16 }}>
              {r.old_value && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>原值</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto', background: '#fff7e6', padding: 8, borderRadius: 4, margin: 0 }}>
                    {r.old_value}
                  </pre>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>新值</div>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#faf8ff', padding: 10, borderRadius: 4, borderLeft: '3px solid #8b5cf6', margin: 0 }}>
                  {r.new_value}
                </pre>
              </div>
            </Card>

            {/* Retry chain */}
            {context.retryOf && (
              <Card size="small" title="重试来源" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12 }}>
                  此结果是 <a onClick={() => openDetail(context.retryOf!.id)}>{context.retryOf.id}</a> 的重试
                  <Tag style={{ marginLeft: 8 }}>{context.retryOf.status}</Tag>
                </div>
              </Card>
            )}
            {context.retries.length > 0 && (
              <Card size="small" title={`重试记录 (${context.retries.length})`} style={{ marginBottom: 16 }}>
                {context.retries.map(rt => (
                  <div key={rt.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <a onClick={() => openDetail(rt.id)}>{rt.id}</a>
                    <Tag color={STATUS_COLORS[rt.status]} style={{ marginLeft: 8 }}>{rt.status}</Tag>
                    <span style={{ color: '#999' }}>{rt.created_at}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Workflow context */}
            {context.workflowExecution && (
              <Card size="small" title="工作流上下文" style={{ marginBottom: 16 }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="工作流">{context.workflowExecution.workflow_name}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={context.workflowExecution.status === 'completed' ? 'green' : 'blue'}>
                      {context.workflowExecution.status}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="执行 ID" span={2}>
                    <span style={{ fontSize: 11 }}>{r.execution_id}</span>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 操作栏 */}
            <Divider style={{ margin: '12px 0' }} />
            <Space wrap style={{ marginBottom: 16 }}>
              <Tooltip title="使用相同输入重新执行">
                <Button icon={<RedoOutlined />} onClick={() => handleRetry(r.id)}>重试</Button>
              </Tooltip>
              {r.status === 'pending' && (
                <>
                  <Button type="primary" onClick={() => handleStatus(r.id, 'applied')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}>采纳</Button>
                  <Button danger onClick={() => handleStatus(r.id, 'rejected')}>拒绝</Button>
                </>
              )}
              <Tooltip title="跳转到结果对应的页面位置">
                <Button icon={<LinkOutlined />}
                  onClick={() => message.info(`目标: ${PAGE_LABELS[r.page_id] || r.page_id} → ${r.record_id} → ${r.field_name || '(记录)'}`)}>
                  定位目标
                </Button>
              </Tooltip>
              <Tooltip title="在对话中展开讨论此结果">
                <Button icon={<MessageOutlined />}
                  onClick={() => message.info('对话功能开发中...')}>
                  展开会话
                </Button>
              </Tooltip>
            </Space>

            {/* 审计记录 */}
            <Card size="small" title={`审计记录 (${context.audit.length})`} style={{ marginBottom: 16 }}>
              {context.audit.length === 0 ? (
                <Empty description="暂无审计记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Timeline items={context.audit.map(log => ({
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
                <Input
                  size="small"
                  placeholder="添加审计备注..."
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onPressEnter={handleAddNote}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <Button size="small" type="primary" icon={<SendOutlined />}
                  loading={addingNote} onClick={handleAddNote}
                  disabled={!noteInput.trim()}
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                  备注
                </Button>
              </div>
            </Card>

            {/* 状态变更 */}
            {(r.applied_by || r.applied_at) && (
              <Card size="small" title="状态变更" style={{ marginBottom: 16 }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="操作人">{r.applied_by || '-'}</Descriptions.Item>
                  <Descriptions.Item label="操作时间">{r.applied_at || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}
          </div>
          );
        })()}
      </Drawer>
    </div>
  );
}
