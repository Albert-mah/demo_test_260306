import { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Space, Tag, Select, Empty, Drawer, Form, Input, message, Popconfirm,
  Timeline, Badge,
} from 'antd';
import {
  PlusOutlined, ArrowLeftOutlined, ThunderboltOutlined, BranchesOutlined,
  RobotOutlined, BellOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlayCircleOutlined, DeleteOutlined, ArrowDownOutlined, ForkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  getWorkflow, getWorkflows, getTasks, createWorkflowNode, updateWorkflowNode, deleteWorkflowNode,
  getExecutions, getExecution,
  type WorkflowDetail, type WorkflowNodeRow, type WorkflowRow, type AITask,
  type ExecutionRow, type ExecutionDetail,
} from '../api';
import { AIFusedAvatar, AIParallelAvatars } from '../components/AIAvatar';
import { AITaskSelector, type TaskConfig } from '../components/AITaskSelector';
import { useResponsive } from '../hooks/useResponsive';

const NODE_TYPES = [
  { value: 'trigger', label: '触发器', icon: <ThunderboltOutlined />, color: '#f5222d' },
  { value: 'ai_task', label: 'AI 任务', icon: <RobotOutlined />, color: '#8b5cf6' },
  { value: 'condition', label: '条件判断', icon: <ForkOutlined />, color: '#faad14' },
  { value: 'action', label: '数据操作', icon: <PlayCircleOutlined />, color: '#1677ff' },
  { value: 'notification', label: '通知', icon: <BellOutlined />, color: '#52c41a' },
  { value: 'delay', label: '延时', icon: <ClockCircleOutlined />, color: '#999' },
  { value: 'end', label: '结束', icon: <CheckCircleOutlined />, color: '#999' },
];

const nodeTypeMap = Object.fromEntries(NODE_TYPES.map(n => [n.value, n]));
const EXEC_STATUS_COLORS: Record<string, string> = {
  completed: 'green', running: 'blue', failed: 'red', pending: 'default',
};

export default function WorkflowEditor({ onBack }: { onBack: () => void }) {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [selectedWf, setSelectedWf] = useState<WorkflowDetail | null>(null);
  const [allTasks, setAllTasks] = useState<AITask[]>([]);
  const [editingNode, setEditingNode] = useState<WorkflowNodeRow | null>(null);
  const [nodeDrawer, setNodeDrawer] = useState(false);
  const [form] = Form.useForm();

  // Execution history
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [execDetail, setExecDetail] = useState<ExecutionDetail | null>(null);
  const [execDrawer, setExecDrawer] = useState(false);

  const { isMobile, isTablet } = useResponsive();

  const loadList = useCallback(async () => {
    const [wfs, tasks] = await Promise.all([getWorkflows(), getTasks()]);
    setWorkflows(wfs);
    setAllTasks(tasks);
    if (wfs.length > 0 && !selectedWf) {
      loadWorkflow(wfs[0].id);
    }
  }, []);

  const loadWorkflow = async (id: string) => {
    const wf = await getWorkflow(id);
    setSelectedWf(wf);
    loadExecutions(id);
  };

  const loadExecutions = async (wfId: string) => {
    setExecLoading(true);
    const all = await getExecutions({ workflow_id: wfId });
    setExecutions(all);
    setExecLoading(false);
  };

  const openExecDetail = async (execId: string) => {
    setExecDrawer(true);
    setExecDetail(null);
    setExecDetail(await getExecution(execId));
  };

  useEffect(() => { loadList(); }, [loadList]);

  const openNodeEditor = (node?: WorkflowNodeRow) => {
    if (node) {
      setEditingNode(node);
      form.setFieldsValue({
        ...node,
        config: JSON.stringify(node.config, null, 2),
      });
    } else {
      setEditingNode(null);
      form.resetFields();
      form.setFieldsValue({ type: 'ai_task', config: '{}' });
    }
    setNodeDrawer(true);
  };

  const handleSaveNode = async () => {
    const values = await form.validateFields();
    const data = { ...values, config: JSON.parse(values.config || '{}') };
    if (editingNode) {
      await updateWorkflowNode(editingNode.id, data);
      message.success('节点已更新');
    } else if (selectedWf) {
      data.sort_order = (selectedWf.nodes?.length || 0);
      await createWorkflowNode(selectedWf.id, data);
      message.success('节点已添加');
    }
    setNodeDrawer(false);
    if (selectedWf) loadWorkflow(selectedWf.id);
  };

  const handleDeleteNode = async (nodeId: string) => {
    await deleteWorkflowNode(nodeId);
    message.success('节点已删除');
    if (selectedWf) loadWorkflow(selectedWf.id);
  };

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>{isMobile ? '' : '返回'}</Button>
          <h2 style={{ margin: 0 }}><BranchesOutlined /> 工作流</h2>
        </Space>
      </div>

      <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', gap: 16 }}>
        {/* Left: Workflow list */}
        <div style={{ width: isTablet ? '100%' : 220 }}>
          <Card title="工作流列表" size="small">
            {workflows.map(wf => (
              <div key={wf.id}
                onClick={() => loadWorkflow(wf.id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                  background: selectedWf?.id === wf.id ? '#f5f0ff' : 'transparent',
                  borderLeft: selectedWf?.id === wf.id ? '3px solid #8b5cf6' : '3px solid transparent',
                }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{wf.name}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{wf.description?.slice(0, 30)}</div>
                <Tag style={{ fontSize: 10, marginTop: 4 }}>{wf.trigger_type}</Tag>
              </div>
            ))}
          </Card>
        </div>

        {/* Center: Visual flow */}
        <div style={{ flex: 1 }}>
          {!selectedWf ? (
            <Empty description="选择一个工作流" />
          ) : (
            <Card
              title={<>{selectedWf.name} <Tag>{selectedWf.enabled ? '启用' : '禁用'}</Tag></>}
              size="small"
              extra={
                <Button size="small" icon={<PlusOutlined />} onClick={() => openNodeEditor()}>
                  添加节点
                </Button>
              }
            >
              <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>{selectedWf.description}</div>

              {/* Node chain */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                {selectedWf.nodes?.map((node, idx) => (
                  <div key={node.id}>
                    <div
                      onClick={() => openNodeEditor(node)}
                      style={{
                        width: isTablet ? '100%' : 280, maxWidth: 320, padding: '10px 14px', border: '2px solid',
                        borderColor: nodeTypeMap[node.type]?.color || '#d9d9d9',
                        borderRadius: 8, cursor: 'pointer', background: '#fff',
                        position: 'relative', transition: 'box-shadow 0.2s',
                      }}
                      onMouseEnter={isMobile ? undefined : e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                      onMouseLeave={isMobile ? undefined : e => (e.currentTarget.style.boxShadow = 'none')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ color: nodeTypeMap[node.type]?.color, fontSize: 16 }}>
                          {nodeTypeMap[node.type]?.icon}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{node.title}</span>
                        <Tag style={{ fontSize: 10, marginLeft: 'auto' }}>{nodeTypeMap[node.type]?.label}</Tag>
                      </div>

                      {node.type === 'ai_task' && (() => {
                        const taskIds = (node.config.task_ids as string[]) || (node.config.task_id ? [node.config.task_id as string] : []);
                        const tasks = taskIds.map(id => allTasks.find(t => t.id === id)).filter(Boolean) as AITask[];
                        if (tasks.length === 0) return null;
                        const mode = (node.config.mode as string) || 'collaborative';
                        const isCollab = mode === 'collaborative';
                        const avatarMembers = tasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }));
                        return (
                          <div style={{ background: '#faf8ff', borderRadius: 4, padding: '6px 0' }}>
                            {tasks.length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 6px', borderBottom: '1px solid #f0ecff' }}>
                                {isCollab
                                  ? <AIFusedAvatar members={avatarMembers} size={22} />
                                  : <AIParallelAvatars members={avatarMembers} size={18} />
                                }
                                <Tag color={isCollab ? 'purple' : 'blue'} style={{ fontSize: 10, margin: 0 }}>
                                  {isCollab ? '协作' : '并发'}
                                </Tag>
                                <span style={{ fontSize: 10, color: '#999' }}>
                                  {isCollab ? '合并 Prompt → 1 次调用' : `${tasks.length} 次独立调用`}
                                </span>
                              </div>
                            )}
                            {tasks.map(t => (
                              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 20, height: 20, borderRadius: '50%', background: t.avatar_color,
                                  fontSize: 10, flexShrink: 0,
                                }}>{t.avatar}</span>
                                <div style={{ fontSize: 11, lineHeight: 1.3 }}>
                                  <span style={{ fontWeight: 600, color: '#333' }}>{t.name}</span>
                                  <span style={{ color: '#999', marginLeft: 4 }}>{t.description?.slice(0, 20)}</span>
                                </div>
                              </div>
                            ))}
                            {tasks.length > 1 && (
                              <div style={{ fontSize: 10, color: '#bbb', padding: '4px 8px 0', borderTop: '1px solid #f0ecff', marginTop: 2 }}>
                                {isCollab
                                  ? <>合并输出: {tasks.flatMap(t => t.output_fields || []).join(' + ')}</>
                                  : <>各自输出: {tasks.map(t => (t.output_fields || []).join(',')).join(' | ')}</>
                                }
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {node.type === 'condition' && (
                        <div style={{ fontSize: 11, color: '#666' }}>
                          {String(node.config.field || '')} {String(node.config.operator || '')} {String(node.config.value || '')}
                        </div>
                      )}

                      {node.type === 'action' && node.config.type && (
                        <div style={{ fontSize: 11, color: '#1677ff' }}>
                          {String(node.config.type)} → {String(node.config.collection || '')}
                        </div>
                      )}

                      {node.type === 'notification' && node.config.template && (
                        <div style={{ fontSize: 11, color: '#52c41a' }}>
                          {String(node.config.template).slice(0, 40)}
                        </div>
                      )}

                      {node.type !== 'trigger' && node.type !== 'end' && (
                        <Popconfirm title="删除节点？" onConfirm={(e) => { e?.stopPropagation(); handleDeleteNode(node.id); }}>
                          <DeleteOutlined
                            onClick={e => e.stopPropagation()}
                            style={{ position: 'absolute', right: 8, top: 8, color: '#ccc', fontSize: 12 }}
                          />
                        </Popconfirm>
                      )}
                    </div>

                    {idx < (selectedWf.nodes?.length || 0) - 1 && (
                      <div style={{ textAlign: 'center', padding: '4px 0', color: '#d9d9d9' }}>
                        <ArrowDownOutlined />
                        {node.type === 'condition' && (
                          <span style={{ fontSize: 10, color: '#faad14', marginLeft: 8 }}>
                            {node.branch_true ? 'Y' : ''} / {node.branch_false ? 'N→跳过' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: Execution history */}
        <div style={{ width: isTablet ? '100%' : 300 }}>
          <Card title={
            <Space>执行记录
              {executions.length > 0 && <Badge count={executions.length} style={{ backgroundColor: '#8b5cf6' }} />}
            </Space>
          } size="small" extra={
            selectedWf && <Button size="small" type="text" icon={<ReloadOutlined />}
              onClick={() => loadExecutions(selectedWf.id)} />
          }>
            {executions.length === 0 ? (
              <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 20 }}>
                {execLoading ? '加载中...' : '暂无执行记录'}
              </div>
            ) : (
              <Timeline
                style={{ marginTop: 8 }}
                items={executions.slice(0, 20).map(exec => ({
                  color: EXEC_STATUS_COLORS[exec.status] || 'blue',
                  children: (
                    <div style={{ fontSize: 11, cursor: 'pointer' }}
                      onClick={() => openExecDetail(exec.id)}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        <Tag color={EXEC_STATUS_COLORS[exec.status]} style={{ fontSize: 10 }}>
                          {exec.status}
                        </Tag>
                      </div>
                      <div style={{ color: '#666' }}>
                        {exec.started_at?.slice(5, 19)}
                      </div>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Node editor drawer */}
      <Drawer
        title={editingNode ? `编辑节点: ${editingNode.title}` : '添加节点'}
        open={nodeDrawer}
        onClose={() => setNodeDrawer(false)}
        width={isMobile ? '100%' : 500}
        extra={<Button type="primary" onClick={handleSaveNode}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>保存</Button>}
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="type" label="节点类型" rules={[{ required: true }]}>
            <Select options={NODE_TYPES.map(n => ({
              value: n.value,
              label: <Space>{n.icon} {n.label}</Space>,
            }))} />
          </Form.Item>
          <Form.Item name="title" label="节点标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type || prev.config !== cur.config}>
            {({ getFieldValue }) => getFieldValue('type') === 'ai_task' && (() => {
              let config: Record<string, unknown> = {};
              try { config = JSON.parse(getFieldValue('config') || '{}'); } catch {}
              // Convert legacy task_ids/task_id to TaskConfig[]
              const taskConfigs: TaskConfig[] = (config.taskConfigs as TaskConfig[]) || (
                ((config.task_ids as string[]) || (config.task_id ? [config.task_id as string] : [])).map(id => {
                  const task = allTasks.find(t => t.id === id);
                  return { taskId: id, inputFields: task?.input_fields || [], outputFields: task?.output_fields || [] };
                })
              );
              const selectedTasks = taskConfigs.map(c => allTasks.find(t => t.id === c.taskId)).filter(Boolean) as AITask[];
              return (
                <Card size="small" title={<Space><RobotOutlined /> AI 任务配置</Space>}
                  style={{ marginBottom: 16 }}
                  extra={taskConfigs.length > 1 && (
                    <Tag color={(config.mode || 'collaborative') === 'collaborative' ? 'purple' : 'blue'} style={{ fontSize: 10 }}>
                      {(config.mode || 'collaborative') === 'collaborative' ? '协作模式' : '并发模式'}
                    </Tag>
                  )}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                    选择任务并配置每个任务的输入/输出字段映射
                  </div>
                  <AITaskSelector
                    tasks={allTasks}
                    value={taskConfigs}
                    onChange={configs => {
                      form.setFieldValue('config', JSON.stringify({
                        ...config,
                        taskConfigs: configs,
                        task_ids: configs.map(c => c.taskId),
                        team: configs.length > 1,
                      }, null, 2));
                    }}
                  />

                  {/* Mode selector — only show when 2+ tasks */}
                  {taskConfigs.length > 1 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {([
                        { key: 'collaborative', label: '协作', desc: '合并 Prompt → 1 次调用 → JSON 合并输出', color: '#8b5cf6' },
                        { key: 'parallel', label: '并发', desc: `${taskConfigs.length} 次独立调用 → 各自输出 → 按字段回填`, color: '#1677ff' },
                      ] as const).map(m => {
                        const active = (config.mode || 'collaborative') === m.key;
                        return (
                          <div key={m.key}
                            onClick={() => form.setFieldValue('config', JSON.stringify({ ...config, mode: m.key }, null, 2))}
                            style={{
                              flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                              border: `2px solid ${active ? m.color : '#e8e8e8'}`,
                              background: active ? (m.key === 'collaborative' ? '#faf8ff' : '#f0f5ff') : '#fff',
                              transition: 'all 0.2s',
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              {m.key === 'collaborative'
                                ? <AIFusedAvatar members={selectedTasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }))} size={24} />
                                : <AIParallelAvatars members={selectedTasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }))} size={16} />
                              }
                              <span style={{ fontWeight: 600, fontSize: 13, color: active ? m.color : '#333' }}>{m.label}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>{m.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })()}
          </Form.Item>

          <Form.Item name="config" label="节点配置 (JSON)" extra="AI任务: task_id, input_mapping; 条件: field, operator, value">
            <Input.TextArea rows={8} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Execution detail drawer */}
      <Drawer
        title={execDetail ? `执行详情` : '加载中...'}
        open={execDrawer}
        onClose={() => setExecDrawer(false)}
        width={isMobile ? '100%' : 560}
      >
        {execDetail && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Tag color={EXEC_STATUS_COLORS[execDetail.status]}>{execDetail.status}</Tag>
              <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                {execDetail.started_at} → {execDetail.completed_at || '进行中'}
              </span>
            </div>

            {/* Node executions */}
            <Card size="small" title="节点执行" style={{ marginBottom: 12 }}>
              <Timeline items={execDetail.nodeExecutions.map(ne => ({
                color: ne.status === 'completed' ? 'green' : ne.status === 'failed' ? 'red' : 'blue',
                children: (
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>
                      {ne.node_title}
                      <Tag style={{ fontSize: 10, marginLeft: 4 }}>{ne.node_type}</Tag>
                      <Tag color={ne.status === 'completed' ? 'green' : 'red'} style={{ fontSize: 10, marginLeft: 4 }}>
                        {ne.status}
                      </Tag>
                    </div>
                    {ne.duration_ms > 0 && <span style={{ color: '#999' }}>{ne.duration_ms}ms</span>}
                    {ne.error && <div style={{ color: '#ff4d4f', fontSize: 11 }}>{ne.error}</div>}
                  </div>
                ),
              }))} />
            </Card>

            {/* AI Results */}
            {execDetail.aiResults.length > 0 && (
              <Card size="small" title={`AI 结果 (${execDetail.aiResults.length})`}>
                {execDetail.aiResults.map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{r.task_name}</div>
                    <div style={{
                      background: '#faf8ff', borderLeft: '3px solid #8b5cf6',
                      padding: '4px 8px', borderRadius: '0 4px 4px 0', marginTop: 4,
                      fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
                    }}>
                      {r.new_value?.slice(0, 200)}
                    </div>
                    <div style={{ color: '#999', marginTop: 2, fontSize: 11 }}>
                      {r.model} · {r.tokens_used}t · {r.duration_ms}ms
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
