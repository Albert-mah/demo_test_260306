import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, message, Badge, Popover, Tooltip, Timeline, Select, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, BookOutlined, FileTextOutlined, CloseOutlined, EditOutlined, BranchesOutlined } from '@ant-design/icons';
import { getTickets, getCustomers, getOrders, createTicket, processTicket, getTasks, getWorkflows, getWorkflow, updateResultStatus, type TicketListRow, type AIResultRow, type AITask, type WorkflowRow, type WorkflowDetail, type CustomerRow, type OrderRow } from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { AIField } from '../components/AIEmployeeCard';
import { useAITriggers } from '../components/AITriggers';
import { CustomerHoverCard } from '../components/CustomerHoverCard';

const STATUS_COLORS: Record<string, string> = {
  open: 'blue', in_progress: 'orange', resolved: 'green', closed: 'default',
};
const PRIORITY_COLORS: Record<string, string> = {
  'P1-紧急': 'red', 'P2-高': 'orange', 'P3-中': 'blue', 'P4-低': 'default',
};

export default function TicketList({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [allTasks, setAllTasks] = useState<AITask[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editModal, setEditModal] = useState<{
    open: boolean; resultId: string; action: string;
    title: string; section: string; content: string; task?: AITask;
  }>({ open: false, resultId: '', action: '', title: '', section: '', content: '' });
  const [editMode, setEditMode] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [wfPopover, setWfPopover] = useState<string | null>(null);
  const [wfDetail, setWfDetail] = useState<WorkflowDetail | null>(null);
  const [wfDetailLoading, setWfDetailLoading] = useState(false);
  const [form] = Form.useForm();

  const { AITriggerWrapper } = useAITriggers(
    allTasks,
    (action, ctx) => {
      message.info(`AI 操作: ${action}${ctx.selectedText ? ` — "${ctx.selectedText.slice(0, 30)}..."` : ''}`);
    },
  );

  const load = async () => {
    setLoading(true);
    const [ts, tasks, wfs, custs, ords] = await Promise.all([getTickets(), getTasks(), getWorkflows(), getCustomers(), getOrders()]);
    setTickets(ts);
    setAllTasks(tasks);
    setWorkflows(wfs);
    setCustomers(custs);
    setAllOrders(ords);
    setLoading(false);
  };

  const handleShowWfDetail = async (wfId: string) => {
    setWfDetailLoading(true);
    try {
      const detail = await getWorkflow(wfId);
      setWfDetail(detail);
    } catch { /* ignore */ }
    setWfDetailLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    await createTicket(values);
    message.success('工单已创建，AI 正在后台处理...');
    setShowCreate(false);
    form.resetFields();
    setTimeout(load, 2000);
  };

  const handleKnowledgeAction = async (resultId: string, action: string) => {
    const labels: Record<string, string> = {
      knowledge_base: '已积累到知识库',
      user_manual: '已补充到使用手册',
      rejected: '已跳过',
    };
    const status = action === 'rejected' ? 'rejected' : 'applied';
    await updateResultStatus(resultId, status);
    message.success(labels[action] || '已处理');
    load();
  };

  const handleReprocess = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    message.loading({ content: '重新处理中...', key: 'reprocess' });
    await processTicket(id);
    message.success({ content: '处理完成', key: 'reprocess' });
    load();
  };

  /** Get AI results for a specific field */
  const fieldResults = (ticket: TicketListRow, field: string) =>
    (ticket.aiResults || []).filter(r => r.field_name === field);

  const columns = [
    {
      title: '工单', dataIndex: 'subject', key: 'subject', width: 300,
      render: (text: string, record: TicketListRow) => (
        <a onClick={(e) => { e.stopPropagation(); onOpenTicket(record.id); }}
          style={{ fontWeight: 500 }}>
          {text}
        </a>
      ),
    },
    {
      title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 150,
      render: (v: string) => (
        <CustomerHoverCard customerName={v} customers={customers} tickets={tickets} orders={allOrders}>
          <span style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9' }}>{v}</span>
        </CustomerHoverCard>
      ),
    },
    {
      title: '语言', dataIndex: 'language', key: 'language', width: 80,
      render: (v: string, record: TicketListRow) => (
        <AIField value={v} results={fieldResults(record, 'language')} tasks={allTasks}
          onRefresh={load} context={record.content} />
      ),
    },
    {
      title: '分类', dataIndex: 'category', key: 'category', width: 120,
      render: (v: string, record: TicketListRow) => (
        <AIField value={v} results={fieldResults(record, 'category')} tasks={allTasks}
          onRefresh={load} context={record.content} />
      ),
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 100,
      render: (v: string, record: TicketListRow) => {
        const results = fieldResults(record, 'priority');
        if (!v) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <AIField value={<Tag color={PRIORITY_COLORS[v]}>{v}</Tag>} results={results}
            tasks={allTasks} onRefresh={load} context={record.content} />
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '', key: 'actions', width: editMode ? 180 : 120,
      render: (_: unknown, record: TicketListRow) => {
        const nextActions = (record.aiResults || []).filter(r => r.field_name === 'next_action' && r.status === 'pending');
        return (
          <Space size={4}>
            <Button size="small" type="text" icon={<ThunderboltOutlined />}
              onClick={(e) => handleReprocess(record.id, e)} title="重新处理" />
            {nextActions.length > 0 && (() => {
              const task = allTasks.find(t => t.id === nextActions[0].task_id);
              let actionData: any = {};
              try { actionData = JSON.parse(nextActions[0].new_value); } catch {}
              return (
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  content={
                    <div style={{ width: 300 }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        {task && <AIAvatar avatar={task.avatar} color={task.avatar_color} size={22} />}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{task?.name || '知识管家'}</div>
                          <div style={{ fontSize: 10, color: '#999' }}>建议下一步行动</div>
                        </div>
                      </div>
                      <div style={{
                        fontSize: 11, color: '#444', background: '#fff', padding: '6px 8px',
                        borderRadius: 6, border: '1px solid #f0f0f0', marginBottom: 10, lineHeight: 1.5,
                      }}>
                        {actionData.reason || actionData.summary}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <Button size="small" type="text" icon={<BookOutlined />}
                          style={{ fontSize: 11, color: '#8b5cf6' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditModal({
                              open: true, resultId: nextActions[0].id, action: 'knowledge_base',
                              title: actionData.kb_title || '知识条目',
                              section: actionData.category || '',
                              content: actionData.kb_content || actionData.summary || '',
                              task,
                            });
                          }}>
                          知识库
                        </Button>
                        <Button size="small" type="text" icon={<FileTextOutlined />}
                          style={{ fontSize: 11, color: '#52c41a' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditModal({
                              open: true, resultId: nextActions[0].id, action: 'user_manual',
                              title: actionData.manual_section || '使用手册',
                              section: actionData.manual_section || '',
                              content: actionData.manual_content || actionData.summary || '',
                              task,
                            });
                          }}>
                          手册
                        </Button>
                        <Button size="small" type="text" icon={<CloseOutlined />}
                          style={{ fontSize: 11 }} danger
                          onClick={async (e) => { e.stopPropagation(); await handleKnowledgeAction(nextActions[0].id, 'rejected'); }}>
                          跳过
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <span onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }}>
                    <Badge dot>
                      {task
                        ? <AIAvatar avatar={task.avatar} color={task.avatar_color} size={22} />
                        : <AIAvatar avatar="📚" color="#faad14" size={22} />
                      }
                    </Badge>
                  </span>
                </Popover>
              );
            })()}
            {/* Edit mode: workflow binding button */}
            {editMode && (
              <Popover
                trigger="click"
                placement="bottomRight"
                open={wfPopover === record.id}
                onOpenChange={(open) => {
                  setWfPopover(open ? record.id : null);
                  if (!open) setWfDetail(null);
                }}
                content={
                  <div style={{ width: 340 }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BranchesOutlined style={{ color: '#8b5cf6' }} />
                      绑定工作流
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {workflows.map(wf => (
                        <div
                          key={wf.id}
                          style={{
                            border: '1px solid ' + (wfDetail?.id === wf.id ? '#d8b4fe' : '#f0f0f0'),
                            borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                            background: wfDetail?.id === wf.id ? '#faf8ff' : '#fff',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={() => handleShowWfDetail(wf.id)}
                          onClick={async (e) => {
                            e.stopPropagation();
                            message.loading({ content: '触发工作流...', key: 'wf-trigger' });
                            await processTicket(record.id);
                            message.success({ content: `已触发「${wf.name}」`, key: 'wf-trigger' });
                            setWfPopover(null);
                            load();
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BranchesOutlined style={{ color: '#8b5cf6', fontSize: 12 }} />
                            <span style={{ fontSize: 12, fontWeight: 500 }}>{wf.name}</span>
                            <Tag style={{ fontSize: 10, margin: 0, marginLeft: 'auto' }}
                              color={wf.enabled ? 'green' : 'default'}>
                              {wf.enabled ? '启用' : '未启用'}
                            </Tag>
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2, marginLeft: 18 }}>
                            {wf.description}
                          </div>
                          {/* Hover: show workflow nodes */}
                          {wfDetail?.id === wf.id && (
                            <div style={{
                              marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0ecff',
                              animation: 'fadeIn 0.15s ease',
                            }}>
                              {wfDetailLoading ? (
                                <Spin size="small" />
                              ) : (
                                <Timeline
                                  style={{ marginBottom: 0, paddingTop: 4 }}
                                  items={wfDetail.nodes
                                    .sort((a, b) => a.sort_order - b.sort_order)
                                    .map(node => {
                                      const isAI = node.type === 'ai_task';
                                      const taskIds = isAI ? ((node.config as any).task_ids || []) : [];
                                      const nodeTasks = taskIds.map((tid: string) => allTasks.find(t => t.id === tid)).filter(Boolean) as AITask[];
                                      return {
                                        color: isAI ? 'purple' : node.type === 'trigger' ? 'blue' : node.type === 'end' ? 'gray' : 'green',
                                        dot: isAI && nodeTasks.length > 0 ? (
                                          <div style={{ display: 'flex', gap: 1 }}>
                                            {nodeTasks.slice(0, 3).map((t, j) => (
                                              <AIAvatar key={j} avatar={t.avatar} color={t.avatar_color} size={14} />
                                            ))}
                                          </div>
                                        ) : undefined,
                                        children: (
                                          <div style={{ fontSize: 11 }}>
                                            <span style={{ fontWeight: isAI ? 600 : 400 }}>{node.title}</span>
                                            {isAI && nodeTasks.length > 0 && (
                                              <span style={{ color: '#999', marginLeft: 4 }}>
                                                {nodeTasks.map(t => t.avatar).join('')}
                                              </span>
                                            )}
                                          </div>
                                        ),
                                      };
                                    })}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                }
              >
                <Button size="small" type="dashed" icon={<PlusOutlined />}
                  style={{ fontSize: 11, color: '#8b5cf6', borderColor: '#d8b4fe' }}
                  onClick={e => e.stopPropagation()}>
                  流程
                </Button>
              </Popover>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <AITriggerWrapper style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>工单列表</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button
            icon={<EditOutlined />}
            type={editMode ? 'primary' : 'default'}
            ghost={editMode}
            style={editMode ? { borderColor: '#8b5cf6', color: '#8b5cf6' } : {}}
            onClick={() => setEditMode(m => !m)}
          >
            {editMode ? '退出编辑' : '编辑模式'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
            新建工单
          </Button>
        </Space>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        紫色底色 = AI 填充字段。悬停显示 AI 员工头像，点击查看详情 / 采纳 / 拒绝 / 编辑 / 重跑 / 对话。
      </div>

      <Table
        dataSource={tickets}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
      />

      <Modal title="新建工单" open={showCreate} onOk={handleCreate} onCancel={() => setShowCreate(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="customer_name" label="客户名称" rules={[{ required: true }]}>
            <Input placeholder="如: TechFlow GmbH" />
          </Form.Item>
          <Form.Item name="customer_email" label="客户邮箱">
            <Input placeholder="如: info@techflow.de" />
          </Form.Item>
          <Form.Item name="subject" label="主题" rules={[{ required: true }]}>
            <Input placeholder="工单主题" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={6} placeholder="工单内容（支持任何语言，AI 会自动翻译和分类）" />
          </Form.Item>
        </Form>
      </Modal>

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
          load();
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
    </AITriggerWrapper>
  );
}
