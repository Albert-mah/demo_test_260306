import { useEffect, useState } from 'react';
import {
  Table, Tag, Switch, Button, Space, Input, Select, Drawer, Form,
  Card, message, Popconfirm, Tooltip, Tabs, Timeline, Empty, Badge,
  Collapse, Divider,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  SearchOutlined, CopyOutlined, RobotOutlined, ThunderboltOutlined,
  HistoryOutlined, EyeOutlined, RedoOutlined, UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import {
  getTasks, createTask, updateTask, toggleTask, deleteTask, generateTaskDef,
  getResults, getResultContext, retryResult, updateResultStatus,
  type AITask, type AIResultRow, type ResultContext,
} from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { useResponsive } from '../hooks/useResponsive';

const { TextArea } = Input;

const TIER_COLORS: Record<string, string> = { lite: 'green', fast: 'blue', pro: 'purple' };
const ACTION_COLORS: Record<string, string> = {
  translate: 'blue', classify: 'purple', fill: 'cyan', extract: 'orange',
  generate: 'green', validate: 'red', summarize: 'magenta', decide: 'gold', investigate: 'geekblue',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'blue', applied: 'green', rejected: 'red', modified: 'orange', failed: 'red',
};

// Group tasks by employee identity (avatar + name + color)
interface AIEmployee {
  key: string; // unique key derived from name
  name: string;
  avatar: string;
  avatar_color: string;
  description: string;
  tasks: AITask[];
  enabled: boolean;
}

function groupByEmployee(tasks: AITask[]): AIEmployee[] {
  const map = new Map<string, AIEmployee>();
  for (const t of tasks) {
    const key = t.name; // employee identity = name (unique in seed data)
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: t.name,
        avatar: t.avatar || '🤖',
        avatar_color: t.avatar_color || '#8b5cf6',
        description: t.description,
        tasks: [],
        enabled: t.enabled,
      });
    }
    map.get(key)!.tasks.push(t);
  }
  return Array.from(map.values());
}

export default function TaskManager() {
  const { isMobile, isTablet } = useResponsive();
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [editingTask, setEditingTask] = useState<AITask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'employee' | 'task'>('task');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDesc, setAiDesc] = useState('');
  const [form] = Form.useForm();

  // Active tab
  const [activeTab, setActiveTab] = useState<'employees' | 'tasks'>('employees');

  // Execution records for selected task
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskResults, setTaskResults] = useState<AIResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [detailCtx, setDetailCtx] = useState<ResultContext | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Selected employee
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filterTag) params.tag = filterTag;
    if (search) params.search = search;
    setTasks(await getTasks(params));
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterTag]);

  const allTags = [...new Set(tasks.flatMap(t => t.tags || []))];
  const employees = groupByEmployee(tasks);

  // Auto-select first employee on initial load
  useEffect(() => {
    if (employees.length > 0 && !selectedEmployee) {
      selectEmployee(employees[0].key);
    }
  }, [tasks.length]);

  const loadTaskResults = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setResultsLoading(true);
    setTaskResults(await getResults({ task_id: taskId }));
    setResultsLoading(false);
  };

  const loadEmployeeResults = async (empKey: string) => {
    const emp = groupByEmployee(tasks).find(e => e.key === empKey);
    if (!emp) return;
    setSelectedTaskId(null); // show all tasks' results
    setResultsLoading(true);
    const allResults: AIResultRow[] = [];
    for (const t of emp.tasks) {
      const res = await getResults({ task_id: t.id });
      allResults.push(...res);
    }
    allResults.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setTaskResults(allResults);
    setResultsLoading(false);
  };

  const selectEmployee = (empKey: string) => {
    setSelectedEmployee(empKey);
    loadEmployeeResults(empKey);
  };

  const openEmployeeEditor = (emp?: AIEmployee) => {
    setDrawerMode('employee');
    setAiDesc('');
    if (emp) {
      const firstTask = emp.tasks[0];
      setEditingTask(firstTask);
      form.setFieldsValue({
        name: emp.name,
        avatar: emp.avatar,
        avatar_color: emp.avatar_color,
        description: emp.description,
        tags: firstTask?.tags || [],
        prompt_system: firstTask?.prompt_system || '',
      });
    } else {
      setEditingTask(null);
      form.resetFields();
    }
    setDrawerOpen(true);
  };

  const openTaskEditor = (task?: AITask) => {
    setDrawerMode('task');
    setAiDesc('');
    if (task) {
      setEditingTask(task);
      form.setFieldsValue({
        ...task,
        tags: task.tags || [],
        input_fields: (task.input_fields || []).join(', '),
        output_fields: (task.output_fields || []).join(', '),
      });
    } else {
      setEditingTask(null);
      form.resetFields();
      form.setFieldsValue({
        model_tier: 'fast', retry_count: 0, timeout_ms: 30000, enabled: true,
        // Pre-fill employee identity if one is selected
        ...(selectedEmployee ? (() => {
          const emp = employees.find(e => e.key === selectedEmployee);
          return emp ? { name: emp.name, avatar: emp.avatar, avatar_color: emp.avatar_color } : {};
        })() : {}),
      });
    }
    setDrawerOpen(true);
  };

  const handleAIGenerate = async () => {
    if (!aiDesc.trim()) return;
    setAiGenerating(true);
    try {
      const task = await generateTaskDef(aiDesc);
      form.setFieldsValue({
        ...task,
        tags: task.tags || [],
        input_fields: (task.input_fields || []).join(', '),
        output_fields: (task.output_fields || []).join(', '),
      });
      message.success('AI 已填充任务配置');
    } catch (e) {
      message.error('AI 生成失败: ' + String(e));
    }
    setAiGenerating(false);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (drawerMode === 'employee') {
      // Update all tasks belonging to this employee with new identity
      if (editingTask) {
        const emp = employees.find(e => e.key === editingTask.name);
        if (emp) {
          for (const t of emp.tasks) {
            await updateTask(t.id, {
              name: values.name,
              avatar: values.avatar,
              avatar_color: values.avatar_color,
              description: values.description,
              prompt_system: values.prompt_system,
              tags: values.tags,
            });
          }
        }
        message.success('员工已更新');
      } else {
        // Create new employee = create a default task
        await createTask({
          name: values.name,
          avatar: values.avatar,
          avatar_color: values.avatar_color,
          description: values.description,
          prompt_system: values.prompt_system,
          tags: values.tags,
          action: 'generate',
          model_tier: 'fast',
          prompt_template: '{{content}}',
          input_fields: ['content'],
          output_fields: ['result'],
          output_format: 'text',
          retry_count: 0,
          timeout_ms: 30000,
        });
        message.success('员工已创建（含默认任务）');
      }
    } else {
      // Task mode
      const data = {
        ...values,
        input_fields: values.input_fields ? values.input_fields.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        output_fields: values.output_fields ? values.output_fields.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      };
      if (editingTask) {
        await updateTask(editingTask.id, data);
        message.success('任务模板已更新');
      } else {
        await createTask(data);
        message.success('任务模板已创建');
      }
    }
    setDrawerOpen(false);
    load();
  };

  const handleDuplicate = async (task: AITask) => {
    await createTask({ ...task, id: undefined as unknown as string, name: task.name + ' (副本)' });
    message.success('已复制');
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    message.success('已删除');
    load();
    if (selectedTaskId === id) setSelectedTaskId(null);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleTask(id, enabled);
    load();
  };

  const openResultDetail = async (resultId: string) => {
    setDetailOpen(true);
    setDetailCtx(null);
    setDetailCtx(await getResultContext(resultId));
  };

  const handleRetry = async (resultId: string) => {
    message.loading({ content: '重试中...', key: 'retry' });
    try {
      await retryResult(resultId);
      message.success({ content: '重试完成', key: 'retry' });
      if (selectedTaskId) loadTaskResults(selectedTaskId);
    } catch (e) {
      message.error({ content: '重试失败', key: 'retry' });
    }
  };

  const handleResultStatus = async (resultId: string, status: string) => {
    await updateResultStatus(resultId, status);
    message.success(status === 'applied' ? '已采纳' : '已拒绝');
    if (selectedTaskId) loadTaskResults(selectedTaskId);
  };

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  // ---- Employee View ----
  const renderEmployeeView = () => {
    const selEmp = employees.find(e => e.key === selectedEmployee);
    return (
      <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', gap: 16 }}>
        {/* Employee list */}
        <div style={{ width: isTablet ? '100%' : 320, flexShrink: 0 }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#999' }}>共 {employees.length} 个员工</span>
            <Button size="small" icon={<PlusOutlined />} onClick={() => openEmployeeEditor()}>新建员工</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employees.map(emp => (
              <Card
                key={emp.key}
                size="small"
                hoverable
                onClick={() => selectEmployee(emp.key)}
                style={{
                  cursor: 'pointer',
                  borderLeft: `3px solid ${emp.avatar_color}`,
                  background: selectedEmployee === emp.key ? '#faf8ff' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AIAvatar avatar={emp.avatar} color={emp.avatar_color} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {emp.name}
                      <Badge count={emp.tasks.length} style={{ backgroundColor: emp.avatar_color }}
                        title={`${emp.tasks.length} 个任务模板`} />
                    </div>
                    <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {emp.description}
                    </div>
                  </div>
                  <Switch size="small" checked={emp.enabled}
                    onClick={(_, e) => e.stopPropagation()}
                    onChange={checked => {
                      emp.tasks.forEach(t => handleToggle(t.id, checked));
                    }} />
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {emp.tasks.map(t => (
                    <Tag key={t.id} color={ACTION_COLORS[t.action] || 'default'} style={{ fontSize: 10, margin: 0 }}>
                      {t.action}
                    </Tag>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Selected employee detail */}
        <div style={{ flex: 1 }}>
          {!selEmp ? (
            <Card style={{ textAlign: 'center', padding: 60, color: '#999' }}>
              <UserOutlined style={{ fontSize: 32, color: '#d9d9d9', marginBottom: 12 }} />
              <div>点击左侧员工查看任务模板和执行记录</div>
            </Card>
          ) : (
            <div>
              {/* Employee header */}
              <Card size="small" style={{ marginBottom: 12, borderLeft: `3px solid ${selEmp.avatar_color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AIAvatar avatar={selEmp.avatar} color={selEmp.avatar_color} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{selEmp.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{selEmp.description}</div>
                  </div>
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEmployeeEditor(selEmp)}>编辑员工</Button>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => {
                      setSelectedEmployee(selEmp.key);
                      openTaskEditor();
                    }}>新建任务</Button>
                  </Space>
                </div>
              </Card>

              {/* Task templates */}
              <Card size="small" title={<Space><AppstoreOutlined /> 任务模板 ({selEmp.tasks.length})</Space>}
                style={{ marginBottom: 12 }}>
                {selEmp.tasks.map(task => (
                  <div key={task.id} style={{
                    padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                    background: selectedTaskId === task.id ? '#faf8ff' : '#fafafa',
                    border: selectedTaskId === task.id ? '1px solid #d8b4fe' : '1px solid #f0f0f0',
                    cursor: 'pointer',
                  }}
                    onClick={() => loadTaskResults(task.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Tag color={ACTION_COLORS[task.action] || 'default'}>{task.action}</Tag>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{task.description}</span>
                      <div style={{ flex: 1 }} />
                      <Tag color={TIER_COLORS[task.model_tier]}>{task.model_tier}</Tag>
                      <Switch size="small" checked={task.enabled}
                        onClick={(_, e) => e.stopPropagation()}
                        onChange={checked => handleToggle(task.id, checked)} />
                      <Space size={2}>
                        <Tooltip title="编辑模板"><Button size="small" type="text" icon={<EditOutlined />}
                          onClick={e => { e.stopPropagation(); openTaskEditor(task); }} /></Tooltip>
                        <Tooltip title="复制"><Button size="small" type="text" icon={<CopyOutlined />}
                          onClick={e => { e.stopPropagation(); handleDuplicate(task); }} /></Tooltip>
                        <Popconfirm title="确认删除此任务模板？" onConfirm={() => handleDelete(task.id)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />}
                            onClick={e => e.stopPropagation()} />
                        </Popconfirm>
                      </Space>
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>
                      输入: {(task.input_fields || []).join(', ')} → 输出: {(task.output_fields || []).join(', ')}
                    </div>
                  </div>
                ))}
              </Card>

              {/* Execution records */}
              <Card size="small"
                title={<Space><HistoryOutlined /> 执行记录 {selectedTask ? `— ${selectedTask.description}` : `(${taskResults.length})`}</Space>}
                extra={
                  <Space>
                    {selectedTaskId && (
                      <Button size="small" type="link" onClick={() => { setSelectedTaskId(null); loadEmployeeResults(selEmp.key); }}>
                        查看全部
                      </Button>
                    )}
                    <Button size="small" icon={<ReloadOutlined />}
                      onClick={() => selectedTaskId ? loadTaskResults(selectedTaskId) : loadEmployeeResults(selEmp.key)}>刷新</Button>
                  </Space>
                }
              >
                <Table dataSource={taskResults} columns={selectedTaskId ? resultColumns : resultColumnsWithTask} rowKey="id" size="small"
                  loading={resultsLoading} pagination={{ pageSize: 8, size: 'small' }}
                  locale={{ emptyText: '暂无执行记录' }} />
              </Card>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ---- Flat Task View (for quick overview) ----
  const taskColumns = [
    {
      title: '', dataIndex: 'enabled', key: 'enabled', width: 40,
      render: (v: boolean, r: AITask) => (
        <Switch size="small" checked={v} onChange={(checked) => handleToggle(r.id, checked)} />
      ),
    },
    {
      title: '员工', key: 'employee', width: 160,
      render: (_: unknown, r: AITask) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AIAvatar avatar={r.avatar || '🤖'} color={r.avatar_color || '#8b5cf6'} size={24} />
          <span style={{ fontSize: 12 }}>{r.name}</span>
        </div>
      ),
    },
    {
      title: '任务', key: 'task',
      render: (_: unknown, r: AITask) => (
        <div>
          <Space size={4}>
            <Tag color={ACTION_COLORS[r.action] || 'default'} style={{ fontSize: 10 }}>{r.action}</Tag>
            <span style={{ fontSize: 12 }}>{r.description}</span>
          </Space>
        </div>
      ),
    },
    {
      title: '模型', dataIndex: 'model_tier', key: 'tier', width: 70,
      render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag>,
    },
    {
      title: '标签', dataIndex: 'tags', key: 'tags', width: 150,
      render: (tags: string[]) => tags?.map(t => <Tag key={t} style={{ fontSize: 11 }}>{t}</Tag>),
    },
    {
      title: '', key: 'ops', width: 100,
      render: (_: unknown, r: AITask) => (
        <Space size={4}>
          <Tooltip title="执行记录">
            <Button size="small" type="text" icon={<HistoryOutlined />}
              onClick={() => { setActiveTab('employees'); selectEmployee(r.name); setTimeout(() => loadTaskResults(r.id), 100); }}
              style={selectedTaskId === r.id ? { color: '#8b5cf6' } : {}} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openTaskEditor(r)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const resultColumnsWithTask = [
    {
      title: '任务', dataIndex: 'task_name', key: 'task', width: 100,
      render: (v: string, r: AIResultRow) => (
        <Space size={4} style={{ fontSize: 11 }}>
          <Tag color={ACTION_COLORS[r.action] || 'default'} style={{ fontSize: 10, margin: 0 }}>{r.action}</Tag>
        </Space>
      ),
    },
    {
      title: '记录', key: 'anchor', width: 120,
      render: (_: unknown, r: AIResultRow) => (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: '#999' }}>{r.record_id}</span>
          {r.field_name && <span> · {r.field_name}</span>}
        </div>
      ),
    },
    {
      title: '输出', dataIndex: 'new_value', key: 'output', ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v?.slice(0, 40)}{(v?.length || 0) > 40 ? '...' : ''}</span>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    },
    {
      title: '', key: 'ops', width: 80,
      render: (_: unknown, r: AIResultRow) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EyeOutlined />}
            onClick={() => openResultDetail(r.id)} title="详情" />
          <Button size="small" type="text" icon={<RedoOutlined />}
            onClick={() => handleRetry(r.id)} title="重试" />
        </Space>
      ),
    },
  ];

  const resultColumns = [
    {
      title: '记录', key: 'anchor', width: 140,
      render: (_: unknown, r: AIResultRow) => (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: '#999' }}>{r.record_id}</span>
          {r.field_name && <span> · {r.field_name}</span>}
        </div>
      ),
    },
    {
      title: '输出', dataIndex: 'new_value', key: 'output', ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v?.slice(0, 50)}{(v?.length || 0) > 50 ? '...' : ''}</span>,
    },
    {
      title: '性能', key: 'perf', width: 100,
      render: (_: unknown, r: AIResultRow) => (
        <span style={{ fontSize: 11, color: '#999' }}>{r.tokens_used}t · {r.duration_ms}ms</span>
      ),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    },
    {
      title: '时间', dataIndex: 'created_at', key: 'time', width: 70,
      render: (v: string) => <span style={{ fontSize: 11, color: '#999' }}>{v?.slice(11, 19)}</span>,
    },
    {
      title: '', key: 'ops', width: 80,
      render: (_: unknown, r: AIResultRow) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EyeOutlined />}
            onClick={() => openResultDetail(r.id)} title="详情" />
          <Button size="small" type="text" icon={<RedoOutlined />}
            onClick={() => handleRetry(r.id)} title="重试" />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}><RobotOutlined style={{ color: '#8b5cf6' }} /> AI 员工管理</h2>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </Space>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        管理 AI 员工（身份 + 角色设定）和任务模板（Prompt + 输入输出）。一个员工可有多个任务模板，触发和动作由联动规则/工作流配置。
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="搜索名称/描述" prefix={<SearchOutlined />} value={search}
            onChange={e => setSearch(e.target.value)} onPressEnter={load} style={{ width: 200 }}
            allowClear onClear={load} />
          <Select placeholder="标签" allowClear style={{ width: 120 }} value={filterTag || undefined}
            onChange={v => setFilterTag(v || '')}
            options={allTags.map(t => ({ value: t, label: t }))} />
        </Space>
      </Card>

      {/* Tabs: Employee view vs flat task view */}
      <Tabs
        activeKey={activeTab}
        onChange={k => setActiveTab(k as 'employees' | 'tasks')}
        items={[
          {
            key: 'employees',
            label: <Space><UserOutlined /> 员工 ({employees.length})</Space>,
            children: renderEmployeeView(),
          },
          {
            key: 'tasks',
            label: <Space><AppstoreOutlined /> 全部任务模板 ({tasks.length})</Space>,
            children: (
              <Table dataSource={tasks} columns={taskColumns} rowKey="id" size="small"
                loading={loading} pagination={false} />
            ),
          },
        ]}
      />

      {/* Task/Employee Edit Drawer */}
      <Drawer
        title={drawerMode === 'employee'
          ? (editingTask ? `编辑员工: ${editingTask.name}` : '新建 AI 员工')
          : (editingTask ? `编辑任务模板: ${editingTask.action}` : '新建任务模板')
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        extra={<Button type="primary" onClick={handleSave}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>保存</Button>}
      >
        {drawerMode === 'employee' ? (
          /* ---- Employee Editor ---- */
          <Form form={form} layout="vertical" size="small">
            <Card size="small" title="员工身份" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div>
                  <Form.Item name="avatar" label="头像" style={{ marginBottom: 8 }}>
                    <Select style={{ width: 70 }} options={
                      ['🌐','🏷️','🚦','✍️','📚','🔍','📧','💰','😊','🛡️','🤖','💡','📊','🎯','📝','⚡','🔬','📋'].map(e => ({ value: e, label: e }))
                    } />
                  </Form.Item>
                  <Form.Item name="avatar_color" label="颜色" style={{ marginBottom: 0 }}>
                    <Select style={{ width: 70 }} options={[
                      { value: '#8b5cf6', label: '🟣' }, { value: '#1677ff', label: '🔵' },
                      { value: '#52c41a', label: '🟢' }, { value: '#fa541c', label: '🟠' },
                      { value: '#f5222d', label: '🔴' }, { value: '#722ed1', label: '💜' },
                      { value: '#13c2c2', label: '🩵' }, { value: '#eb2f96', label: '💗' },
                      { value: '#faad14', label: '🟡' },
                    ]} />
                  </Form.Item>
                </div>
                <div style={{ flex: 1 }}>
                  <Form.Item name="name" label="员工名" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                    <Input placeholder="如：翻译专员" />
                  </Form.Item>
                  <Form.Item name="description" label="一句话描述" style={{ marginBottom: 0 }}>
                    <Input placeholder="如：将任意语言文本翻译为目标语言" />
                  </Form.Item>
                </div>
              </div>
              <Form.Item name="tags" label="标签" style={{ marginBottom: 0, marginTop: 8 }}>
                <Select mode="tags" placeholder="输入标签回车添加" />
              </Form.Item>
            </Card>
            <Card size="small" title="角色设定" style={{ marginBottom: 16 }}
              extra={<span style={{ fontSize: 11, color: '#999' }}>此员工所有任务共享的 System Prompt</span>}>
              <Form.Item name="prompt_system" label="System Prompt" style={{ marginBottom: 0 }}>
                <TextArea rows={4} placeholder="你是一个专业翻译，确保术语准确、语句自然。"
                  style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </Form.Item>
            </Card>
          </Form>
        ) : (
          /* ---- Task Template Editor ---- */
          <Form form={form} layout="vertical" size="small">
            {/* AI Generate */}
            {!editingTask && (
              <Card size="small" style={{
                marginBottom: 16, background: '#faf8ff',
                borderLeft: '3px solid #8b5cf6', borderColor: '#e9e0ff',
              }}>
                <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600, marginBottom: 8 }}>
                  <ThunderboltOutlined /> AI 智能填充 — 用一句话描述你想要的任务
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={aiDesc}
                    onChange={e => setAiDesc(e.target.value)}
                    placeholder="如：将客户邮件翻译为中文，保持商务格式"
                    onPressEnter={handleAIGenerate}
                  />
                  <Button type="primary" loading={aiGenerating} onClick={handleAIGenerate}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                    AI 生成
                  </Button>
                </Space.Compact>
              </Card>
            )}

            {/* Employee identity (part of task) */}
            <Card size="small" title="所属员工" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div>
                  <Form.Item name="avatar" label="头像" style={{ marginBottom: 8 }}>
                    <Select style={{ width: 70 }} options={
                      ['🌐','🏷️','🚦','✍️','📚','🔍','📧','💰','😊','🛡️','🤖','💡','📊','🎯','📝','⚡','🔬','📋'].map(e => ({ value: e, label: e }))
                    } />
                  </Form.Item>
                  <Form.Item name="avatar_color" label="颜色" style={{ marginBottom: 0 }}>
                    <Select style={{ width: 70 }} options={[
                      { value: '#8b5cf6', label: '🟣' }, { value: '#1677ff', label: '🔵' },
                      { value: '#52c41a', label: '🟢' }, { value: '#fa541c', label: '🟠' },
                      { value: '#f5222d', label: '🔴' }, { value: '#722ed1', label: '💜' },
                      { value: '#13c2c2', label: '🩵' }, { value: '#eb2f96', label: '💗' },
                      { value: '#faad14', label: '🟡' },
                    ]} />
                  </Form.Item>
                </div>
                <div style={{ flex: 1 }}>
                  <Form.Item name="name" label="员工名" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                    <Input placeholder="如：翻译专员" />
                  </Form.Item>
                  <Form.Item name="description" label="一句话能力" style={{ marginBottom: 0 }}>
                    <Input placeholder="如：将任意语言文本翻译为目标语言" />
                  </Form.Item>
                </div>
              </div>
            </Card>

            {/* Task Prompt */}
            <Card size="small" title="任务指令" style={{ marginBottom: 16 }}>
              <Form.Item name="action" label="能力类型" style={{ marginBottom: 12 }}>
                <Select options={[
                  { value: 'translate', label: 'translate — 翻译' },
                  { value: 'classify', label: 'classify — 分类' },
                  { value: 'fill', label: 'fill — 填充' },
                  { value: 'extract', label: 'extract — 提取' },
                  { value: 'generate', label: 'generate — 生成' },
                  { value: 'validate', label: 'validate — 校验' },
                  { value: 'summarize', label: 'summarize — 摘要' },
                  { value: 'decide', label: 'decide — 决策' },
                  { value: 'investigate', label: 'investigate — 调查' },
                  { value: 'orchestrate', label: 'orchestrate — 编排' },
                ]} />
              </Form.Item>
              <Form.Item name="prompt_system" label="角色设定 (System Prompt)" style={{ marginBottom: 12 }}
                extra="定义角色和专业领域">
                <TextArea rows={3} placeholder="你是一个专业翻译，确保术语准确、语句自然。"
                  style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </Form.Item>
              <Form.Item name="prompt_template" label="任务指令 (User Prompt 模板)" rules={[{ required: true }]}
                extra={<span>使用 <code>{'{{field}}'}</code> 引用上下文字段</span>}>
                <TextArea rows={8} placeholder="将以下文本翻译为{{target_lang}}，只输出翻译结果：&#10;&#10;{{content}}"
                  style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </Form.Item>
            </Card>

            {/* Input / Output */}
            <Card size="small" title="数据映射" style={{ marginBottom: 16 }}>
              <Form.Item name="input_fields" label="输入字段" style={{ marginBottom: 8 }}
                extra="逗号分隔，运行时从触发上下文中获取">
                <Input placeholder="content, target_lang" />
              </Form.Item>
              <Form.Item name="output_fields" label="输出字段" style={{ marginBottom: 8 }}
                extra="逗号分隔">
                <Input placeholder="language, translated_content" />
              </Form.Item>
              <Form.Item name="output_format" label="输出格式" style={{ marginBottom: 0 }}>
                <Select options={[
                  { value: 'text', label: 'text — 纯文本' },
                  { value: 'json', label: 'json — JSON 结构' },
                ]} />
              </Form.Item>
            </Card>

            {/* Config */}
            <Card size="small" title="执行配置" style={{ marginBottom: 16 }}>
              <Space wrap>
                <Form.Item name="model_tier" label="模型等级" style={{ marginBottom: 0 }}>
                  <Select style={{ width: 200 }} options={[
                    { value: 'lite', label: 'Lite — 最快, 分类/标签/判断' },
                    { value: 'fast', label: 'Fast — 平衡, 翻译/摘要/生成' },
                    { value: 'pro', label: 'Pro — 最强, 复杂推理/编排' },
                  ]} />
                </Form.Item>
                <Form.Item name="retry_count" label="重试" style={{ marginBottom: 0 }}>
                  <Select style={{ width: 80 }}
                    options={[0, 1, 2, 3].map(n => ({ value: n, label: `${n} 次` }))} />
                </Form.Item>
                <Form.Item name="timeout_ms" label="超时" style={{ marginBottom: 0 }}>
                  <Select style={{ width: 80 }}
                    options={[5000, 10000, 15000, 30000, 60000].map(n => ({ value: n, label: `${n / 1000}s` }))} />
                </Form.Item>
              </Space>
              <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ marginBottom: 0, marginTop: 8 }}>
                <Switch />
              </Form.Item>
            </Card>

            <Form.Item name="tags" label="标签" style={{ marginBottom: 0 }}>
              <Select mode="tags" placeholder="输入标签回车添加" />
            </Form.Item>
          </Form>
        )}
      </Drawer>

      {/* Result Detail Drawer */}
      <Drawer
        title={detailCtx ? `执行详情: ${detailCtx.result.task_name}` : '加载中...'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={580}
      >
        {detailCtx && (
          <div>
            <Card size="small" title="输入" style={{ marginBottom: 12 }}>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 4, margin: 0 }}>
                {detailCtx.result.prompt_used || JSON.stringify(detailCtx.result.input_data, null, 2)}
              </pre>
            </Card>
            <Card size="small" title="输出" style={{ marginBottom: 12 }}>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#faf8ff', padding: 8, borderRadius: 4, borderLeft: '3px solid #8b5cf6', margin: 0 }}>
                {detailCtx.result.new_value}
              </pre>
            </Card>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              {detailCtx.result.model} · {detailCtx.result.tokens_used} tokens · {detailCtx.result.duration_ms}ms · 置信度 {detailCtx.result.confidence}%
            </div>
            <Space style={{ marginBottom: 12 }}>
              <Button size="small" icon={<RedoOutlined />} onClick={() => handleRetry(detailCtx.result.id)}>重试</Button>
              {detailCtx.result.status === 'pending' && (
                <>
                  <Button size="small" type="primary" onClick={() => handleResultStatus(detailCtx.result.id, 'applied')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}>采纳</Button>
                  <Button size="small" danger onClick={() => handleResultStatus(detailCtx.result.id, 'rejected')}>拒绝</Button>
                </>
              )}
            </Space>
            {detailCtx.audit.length > 0 && (
              <Card size="small" title={`审计记录 (${detailCtx.audit.length})`}>
                <Timeline items={detailCtx.audit.map(log => ({
                  color: log.action === 'applied' ? 'green' : log.action === 'rejected' ? 'red' : 'blue',
                  children: (
                    <div style={{ fontSize: 11 }}>
                      <Tag style={{ fontSize: 10 }}>{log.action}</Tag> {log.user_name}
                      <br /><span style={{ color: '#bbb' }}>{log.created_at}</span>
                    </div>
                  ),
                }))} />
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
