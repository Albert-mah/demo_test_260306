import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Drawer, Descriptions, Timeline, message, Empty,
} from 'antd';
import {
  ReloadOutlined, RobotOutlined, RedoOutlined, EyeOutlined,
  MessageOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import {
  getResults, getResultContext, retryResult, updateResultStatus,
  type AIResultRow, type ResultContext,
} from '../api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'blue', applied: 'green', rejected: 'red', modified: 'orange', expired: 'default', failed: 'red',
};
const ACTION_LABELS: Record<string, string> = {
  translate: '翻译', classify: '分类', fill: '填充', extract: '提取',
  generate: '生成', validate: '校验', summarize: '摘要', decide: '决策', investigate: '调查',
};

export default function ExecutionPanel() {
  const [results, setResults] = useState<AIResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [context, setContext] = useState<ResultContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setResults(await getResults());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (resultId: string) => {
    setContextLoading(true);
    setDetailOpen(true);
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
          <div><span style={{ color: '#999' }}>页面:</span> {r.page_id || '-'}</div>
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
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
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
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}><RobotOutlined style={{ color: '#8b5cf6' }} /> 执行记录</h2>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        所有 AI 任务的执行历史 — 点击查看完整输入输出、审计记录、重试链。每条记录锚定到具体页面/记录/字段。
      </div>

      <Table dataSource={results} columns={columns} rowKey="id" size="small"
        loading={loading} pagination={{ pageSize: 20 }}
      />

      {/* Detail Drawer */}
      <Drawer
        title={context ? `执行详情: ${context.result.task_name}` : '加载中...'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={640}
        loading={contextLoading}
      >
        {context && (
          <div>
            {/* Result info */}
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="ID">{context.result.id}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLORS[context.result.status]}>{context.result.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作">
                <Tag color="purple">{ACTION_LABELS[context.result.action] || context.result.action}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型">{context.result.model}</Descriptions.Item>
              <Descriptions.Item label="Token">{context.result.tokens_used}</Descriptions.Item>
              <Descriptions.Item label="耗时">{context.result.duration_ms}ms</Descriptions.Item>
              <Descriptions.Item label="页面">{context.result.page_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="记录 ID">{context.result.record_id}</Descriptions.Item>
              <Descriptions.Item label="字段">{context.result.field_name || '(记录级)'}</Descriptions.Item>
              <Descriptions.Item label="置信度">{context.result.confidence}%</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{context.result.created_at}</Descriptions.Item>
            </Descriptions>

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
                {context.retries.map(r => (
                  <div key={r.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <a onClick={() => openDetail(r.id)}>{r.id}</a>
                    <Tag color={STATUS_COLORS[r.status]} style={{ marginLeft: 8 }}>{r.status}</Tag>
                    <span style={{ color: '#999' }}>{r.created_at}</span>
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
                </Descriptions>
              </Card>
            )}

            {/* Input/Output */}
            <Card size="small" title="输入" style={{ marginBottom: 16 }}>
              {context.result.prompt_used ? (
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 4 }}>
                  {context.result.prompt_used}
                </pre>
              ) : (
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: '#fafafa', padding: 8, borderRadius: 4 }}>
                  {JSON.stringify(context.result.input_data, null, 2)}
                </pre>
              )}
            </Card>

            <Card size="small" title="输出" style={{ marginBottom: 16 }}>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#faf8ff', padding: 8, borderRadius: 4, borderLeft: '3px solid #8b5cf6' }}>
                {context.result.new_value}
              </pre>
            </Card>

            {/* Actions */}
            <Space style={{ marginBottom: 16 }}>
              <Button icon={<RedoOutlined />} onClick={() => handleRetry(context.result.id)}>重试</Button>
              {context.result.status === 'pending' && (
                <>
                  <Button type="primary" onClick={() => handleStatus(context.result.id, 'applied')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}>采纳</Button>
                  <Button danger onClick={() => handleStatus(context.result.id, 'rejected')}>拒绝</Button>
                </>
              )}
              <Button icon={<MessageOutlined />} disabled title="开启对话（开发中）">对话</Button>
            </Space>

            {/* Audit trail */}
            <Card size="small" title={`审计记录 (${context.audit.length})`}>
              {context.audit.length === 0 ? (
                <Empty description="暂无审计记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Timeline items={context.audit.map(log => ({
                  color: log.action === 'applied' ? 'green' : log.action === 'rejected' ? 'red' :
                    log.action === 'retried' ? 'orange' : 'blue',
                  children: (
                    <div style={{ fontSize: 11 }}>
                      <Tag style={{ fontSize: 10 }}>{log.action}</Tag> {log.user_name}
                      <br />{log.detail}
                      <br /><span style={{ color: '#bbb' }}>{log.created_at}</span>
                    </div>
                  ),
                }))} />
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
