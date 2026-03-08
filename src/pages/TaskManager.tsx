import { useEffect, useState } from 'react';
import {
  Table, Tag, Switch, Button, Space, Input, Select, Drawer, Form,
  Card, message, Popconfirm, Tooltip, Tabs, Timeline, Empty, Badge,
  Collapse, Divider, List, Segmented, Alert, InputNumber,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  SearchOutlined, CopyOutlined, RobotOutlined, ThunderboltOutlined,
  HistoryOutlined, EyeOutlined, RedoOutlined, UserOutlined,
  AppstoreOutlined, AimOutlined, DesktopOutlined, CloudOutlined,
  ClockCircleOutlined, ApiOutlined, FileTextOutlined, LinkOutlined,
  MessageOutlined, SendOutlined, BookOutlined, ToolOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  getTasks, createTask, updateTask, toggleTask, deleteTask, generateTaskDef,
  getResults, getResultContext, retryResult, updateResultStatus, addAuditNote,
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
const TRIGGER_SOURCE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  frontend: { icon: <DesktopOutlined />, label: '前端', color: 'blue' },
  backend: { icon: <CloudOutlined />, label: '后端', color: 'cyan' },
  workflow: { icon: <AimOutlined />, label: '工作流', color: 'purple' },
  schedule: { icon: <ClockCircleOutlined />, label: '定时', color: 'orange' },
  api: { icon: <ApiOutlined />, label: 'API', color: 'green' },
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
    const key = t.name;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: t.name,
        avatar: t.avatar || '🤖',
        avatar_color: t.avatar_color || '#8b5cf6',
        description: '',
        tasks: [],
        enabled: t.enabled,
      });
    }
    map.get(key)!.tasks.push(t);
  }
  // Description = summary of task actions
  for (const emp of map.values()) {
    emp.description = emp.tasks.map(t => t.description).join(' · ');
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
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);

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
        nickname: emp.name, // display name
        avatar: emp.avatar,
        avatar_color: emp.avatar_color,
        position: emp.description,
        description: emp.description,
        greeting: `你好！我是${emp.name}，有什么可以帮你的？`,
        tags: firstTask?.tags || [],
        prompt_system: firstTask?.prompt_system || '',
        enableKnowledgeBase: false,
        topK: 5,
        score: 0.5,
      });
    } else {
      setEditingTask(null);
      form.resetFields();
      form.setFieldsValue({
        enableKnowledgeBase: false,
        topK: 5,
        score: 0.5,
      });
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
    setNoteInput('');
    setDetailCtx(await getResultContext(resultId));
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !detailCtx) return;
    setAddingNote(true);
    await addAuditNote(detailCtx.result.id, noteInput.trim());
    message.success('备注已添加');
    setNoteInput('');
    setAddingNote(false);
    openResultDetail(detailCtx.result.id);
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
                    }}>添加任务</Button>
                  </Space>
                </div>
              </Card>

              {/* Task configs — NocoBase style shortcut tasks */}
              <Card size="small" title={<Space><AppstoreOutlined /> 任务配置 ({selEmp.tasks.length})</Space>}
                extra={<span style={{ fontSize: 11, color: '#999' }}>联动规则 / 页面快捷方式中配置的任务</span>}
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
                        <Tooltip title="编辑"><Button size="small" type="text" icon={<EditOutlined />}
                          onClick={e => { e.stopPropagation(); openTaskEditor(task); }} /></Tooltip>
                        <Tooltip title="复制"><Button size="small" type="text" icon={<CopyOutlined />}
                          onClick={e => { e.stopPropagation(); handleDuplicate(task); }} /></Tooltip>
                        <Popconfirm title="确认删除此任务？" onConfirm={() => handleDelete(task.id)}>
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
        管理 AI 员工和任务配置。联动规则/页面快捷方式中选择员工，任务在员工上内联配置（标题、背景指令、默认消息、技能子集）。
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
            label: <Space><AppstoreOutlined /> 全部任务配置 ({tasks.length})</Space>,
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
          ? (editingTask ? `编辑 AI 员工: ${editingTask.name}` : '新建 AI 员工')
          : (editingTask ? `编辑任务: ${editingTask.description || editingTask.action}` : '添加任务')
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={drawerMode === 'employee' ? 680 : 640}
        extra={<Button type="primary" onClick={handleSave}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>保存</Button>}
      >
        {drawerMode === 'employee' ? (
          /* ---- Employee Editor (NocoBase style: 4-tab layout) ---- */
          <Form form={form} layout="vertical" size="small">
            <Tabs size="small" items={[
              {
                key: 'profile',
                label: <Space><UserOutlined /> 基本信息</Space>,
                children: (
                  <div style={{ padding: '12px 0' }}>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
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
                        <Form.Item name="name" label="用户名" rules={[{ required: true }]} style={{ marginBottom: 8 }}
                          extra={editingTask ? '用户名创建后不可修改' : undefined}>
                          <Input placeholder="如：translator" disabled={!!editingTask} />
                        </Form.Item>
                        <Form.Item name="nickname" label="昵称" style={{ marginBottom: 0 }}>
                          <Input placeholder="如：翻译专员" />
                        </Form.Item>
                      </div>
                    </div>
                    <Form.Item name="position" label="职位" style={{ marginBottom: 12 }}
                      extra="在 AI 员工列表中展示的简要定位">
                      <Input placeholder="如：多语言翻译 · 商务文档 · 本地化" />
                    </Form.Item>
                    <Form.Item name="description" label="简介 (Bio)" style={{ marginBottom: 12 }}>
                      <TextArea rows={2} placeholder="介绍这个 AI 员工的能力和擅长领域" />
                    </Form.Item>
                    <Form.Item name="greeting" label="问候语" style={{ marginBottom: 12 }}
                      extra="用户首次与该员工对话时的开场白">
                      <TextArea rows={2} placeholder="如：你好！我是翻译专员，可以帮你翻译各种语言的文档。" />
                    </Form.Item>
                    <Form.Item name="tags" label="标签" style={{ marginBottom: 0 }}>
                      <Select mode="tags" placeholder="输入标签回车添加" />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'role',
                label: <Space><FileTextOutlined /> 角色设定</Space>,
                children: (
                  <div style={{ padding: '12px 0' }}>
                    <Alert message="角色设定定义了 AI 员工的行为规范和专业领域。此设定会作为 System Prompt 应用于该员工的所有任务。支持使用变量引用当前用户、角色和语言。"
                      type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }} />
                    <Form.Item name="prompt_system" label="角色设定" style={{ marginBottom: 0 }}>
                      <TextArea rows={12} placeholder={`你是一名专业的翻译助手。\n\n## 规则\n- 保持术语准确、语句自然\n- 不添加原文没有的内容\n- 保留原文格式\n\n## 变量\n- 当前用户: {{currentUser.nickname}}\n- 当前语言: {{currentLang}}`}
                        style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'skills',
                label: <Space><ToolOutlined /> 技能</Space>,
                children: (
                  <div style={{ padding: '12px 0' }}>
                    <Collapse ghost size="small" defaultActiveKey={[]} items={[
                      {
                        key: 'general',
                        label: (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>通用技能</div>
                            <div style={{ color: '#999', fontSize: 11 }}>所有 AI 员工共享，只读</div>
                          </div>
                        ),
                        children: (
                          <List size="small" dataSource={[
                            { name: 'send-message', title: '发送消息', desc: '向用户发送文本消息和通知', perm: 'ALLOW' },
                            { name: 'suggestions', title: '操作建议', desc: '根据上下文向用户推荐下一步操作', perm: 'ALLOW' },
                          ]} renderItem={(item) => (
                            <List.Item extra={
                              <span style={{ fontSize: 11, color: '#999' }}>
                                权限 <Segmented size="small" options={[{ label: '询问', value: 'ASK' }, { label: '允许', value: 'ALLOW' }]}
                                  value={item.perm} disabled style={{ marginLeft: 4 }} />
                              </span>
                            }>
                              <div style={{ fontSize: 12 }}>{item.title}</div>
                              <div style={{ fontSize: 11, color: '#999' }}>{item.desc}</div>
                            </List.Item>
                          )} />
                        ),
                      },
                    ]} />
                    <Collapse ghost size="small" defaultActiveKey={['custom']} style={{ marginTop: 8 }}
                      items={[{
                        key: 'custom',
                        label: (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>自定义技能</div>
                            <div style={{ color: '#999', fontSize: 11 }}>通过工作流创建，可添加/删除和设置默认权限</div>
                          </div>
                        ),
                        extra: (
                          <Button size="small" type="primary" icon={<PlusOutlined />}
                            onClick={e => { e.stopPropagation(); message.info('可在工作流中创建自定义技能后添加到此处'); }}>
                            添加技能
                          </Button>
                        ),
                        children: (() => {
                          // Mock custom tools aligned with NocoBase tool system
                          const customTools = [
                            { name: 'form-filler', title: '表单填充', desc: '根据上下文自动填写表单字段', perm: 'ASK' as const },
                            { name: 'data-query', title: '数据查询', desc: '查询数据表并返回结构化结果', perm: 'ASK' as const },
                            { name: 'chart-generator', title: '图表生成', desc: '根据数据自动生成可视化图表', perm: 'ASK' as const },
                            { name: 'define-collections', title: '数据建模', desc: '创建和修改数据表结构定义', perm: 'ASK' as const },
                          ];
                          return (
                            <List size="small" bordered dataSource={customTools} renderItem={(tool) => (
                              <List.Item extra={
                                <Space>
                                  <span style={{ fontSize: 11 }}>
                                    权限 <Segmented size="small" style={{ marginLeft: 4, marginRight: 4 }}
                                      options={[{ label: '询问', value: 'ASK' }, { label: '允许', value: 'ALLOW' }]}
                                      value={tool.perm} />
                                  </span>
                                  <Button size="small" type="text" icon={<DeleteOutlined />}
                                    onClick={() => message.info('演示模式')} />
                                </Space>
                              }>
                                <div style={{ fontSize: 12 }}>{tool.title}</div>
                                <div style={{ fontSize: 11, color: '#999' }}>{tool.desc}</div>
                              </List.Item>
                            )} />
                          );
                        })(),
                      }]}
                    />
                  </div>
                ),
              },
              {
                key: 'context',
                label: <Space><AppstoreOutlined /> 上下文</Space>,
                children: (
                  <div style={{ padding: '12px 0' }}>
                    <Alert message="上下文定义了 AI 员工可访问的数据范围。配置的数据源会在对话时自动注入，AI 可基于这些数据进行分析和操作。"
                      type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }} />

                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>工作上下文</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                      {[
                        { key: 'flow-model', label: '页面区块', desc: '当前页面的区块和表单数据' },
                        { key: 'datasource', label: '数据源', desc: '配置的数据表记录' },
                        { key: 'code-editor', label: '代码编辑器', desc: '代码片段上下文' },
                        { key: 'chart-config', label: '图表配置', desc: '可视化图表的查询和配置' },
                      ].map(ctx => (
                        <Card key={ctx.key} size="small" hoverable style={{ width: 'calc(50% - 4px)', cursor: 'default' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{ctx.label}</div>
                              <div style={{ fontSize: 11, color: '#999' }}>{ctx.desc}</div>
                            </div>
                            <Switch size="small" defaultChecked={ctx.key === 'flow-model' || ctx.key === 'datasource'} />
                          </div>
                        </Card>
                      ))}
                    </div>

                    <Divider style={{ margin: '12px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>数据源配置</div>
                        <div style={{ fontSize: 11, color: '#999' }}>指定 AI 可查询的数据表、字段范围和过滤条件</div>
                      </div>
                      <Button size="small" icon={<PlusOutlined />}
                        onClick={() => message.info('数据源配置向导：选择数据表 → 字段 → 过滤条件 → 排序 → 预览')}>
                        添加数据源
                      </Button>
                    </div>
                    {(() => {
                      const emp = editingTask ? employees.find(e => e.key === editingTask.name) : null;
                      const mockDS = emp ? [
                        { title: '工单数据', collection: 'tickets', fields: 6, limit: 50, enabled: true },
                        { title: '客户资料', collection: 'customers', fields: 8, limit: 100, enabled: true },
                      ] : [];
                      return mockDS.length > 0 ? (
                        <List size="small" bordered dataSource={mockDS} renderItem={(ds) => (
                          <List.Item extra={
                            <Space>
                              <Switch size="small" defaultChecked={ds.enabled} />
                              <Button size="small" type="text" icon={<DeleteOutlined />} />
                            </Space>
                          }>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{ds.title}</div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {ds.collection} · {ds.fields} 字段 · 限制 {ds.limit} 条
                              </div>
                            </div>
                          </List.Item>
                        )} />
                      ) : (
                        <Empty description="暂无数据源配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      );
                    })()}
                  </div>
                ),
              },
              {
                key: 'knowledge',
                label: <Space><BookOutlined /> 知识库</Space>,
                children: (
                  <div style={{ padding: '12px 0' }}>
                    <Form.Item name="enableKnowledgeBase" label="启用知识库" valuePropName="checked" style={{ marginBottom: 16 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="knowledgeBasePrompt" label="知识库 Prompt" style={{ marginBottom: 16 }}
                      extra="引导 AI 如何使用检索到的知识库内容">
                      <TextArea rows={3} placeholder="请根据以下知识库内容回答用户的问题。如果知识库中没有相关信息，请如实告知。"
                        style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    </Form.Item>
                    <Form.Item name="knowledgeBaseIds" label="知识库" style={{ marginBottom: 12 }}
                      extra="选择该员工可以访问的知识库">
                      <Select mode="multiple" placeholder="选择知识库" options={[
                        { value: 'kb-product', label: '产品文档' },
                        { value: 'kb-faq', label: '常见问题' },
                        { value: 'kb-policy', label: '政策规范' },
                        { value: 'kb-cases', label: '历史案例' },
                      ]} />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <Form.Item name="topK" label="Top K" style={{ marginBottom: 0, flex: 1 }}
                        extra="返回最相关的文档数量">
                        <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="5" />
                      </Form.Item>
                      <Form.Item name="score" label="最低相关度" style={{ marginBottom: 0, flex: 1 }}
                        extra="0-1，越高越严格">
                        <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} placeholder="0.5" />
                      </Form.Item>
                    </div>
                  </div>
                ),
              },
            ]} />
          </Form>
        ) : (
          /* ---- Task Editor (flat form) ---- */
          <Form form={form} layout="vertical" size="small">
            {/* AI Generate — only for new */}
            {!editingTask && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#faf8ff', borderLeft: '3px solid #8b5cf6', borderRadius: 4 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={aiDesc} onChange={e => setAiDesc(e.target.value)}
                    placeholder="一句话描述，AI 自动生成配置" onPressEnter={handleAIGenerate} />
                  <Button type="primary" loading={aiGenerating} onClick={handleAIGenerate}
                    icon={<ThunderboltOutlined />} style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                    生成
                  </Button>
                </Space.Compact>
              </div>
            )}

            {/* 归属 — 所属员工 */}
            {selectedEmployee && (() => {
              const emp = employees.find(e => e.key === selectedEmployee);
              return emp ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fafafa', borderRadius: 6, marginBottom: 12 }}>
                  <AIAvatar avatar={emp.avatar} color={emp.avatar_color} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{emp.description}</div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* 标题 */}
            <Form.Item name="description" label="标题" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <Input placeholder="如：翻译客户邮件" />
            </Form.Item>

            {/* 提示词 */}
            <Form.Item name="prompt_template" label="提示词" rules={[{ required: true }]} style={{ marginBottom: 8 }}
              extra={<span style={{ fontSize: 11 }}>用 <code>{'{{field}}'}</code> 引用输入字段</span>}>
              <TextArea rows={5} placeholder="将以下内容翻译为{{target_lang}}：&#10;&#10;{{content}}"
                style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            {/* 输入 / 输出 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              <Form.Item name="input_fields" label="输入" style={{ marginBottom: 8, flex: 1 }}>
                <Input placeholder="content, target_lang" />
              </Form.Item>
              <Form.Item name="output_fields" label="输出" style={{ marginBottom: 8, flex: 1 }}>
                <Input placeholder="translated_content" />
              </Form.Item>
            </div>

            {/* 技能 */}
            <Form.Item name="skill_filter" label="技能" style={{ marginBottom: 8 }}
              extra="限定可用技能，留空则使用员工全部技能">
              <Select mode="multiple" placeholder="全部技能" allowClear
                options={[
                  { value: 'form-filler', label: '表单填充' },
                  { value: 'data-query', label: '数据查询' },
                  { value: 'chart-generator', label: '图表生成' },
                  { value: 'define-collections', label: '数据建模' },
                ]} />
            </Form.Item>

            {/* 模型 + 类型/标签 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              <Form.Item name="model_tier" label="模型" style={{ marginBottom: 8, width: 140 }}>
                <Select allowClear placeholder="默认" options={[
                  { value: 'lite', label: 'Lite 轻量' },
                  { value: 'fast', label: 'Fast 平衡' },
                  { value: 'pro', label: 'Pro 最强' },
                ]} />
              </Form.Item>
              <Form.Item name="action" label="类型" style={{ marginBottom: 8, width: 120 }}>
                <Select options={[
                  { value: 'translate', label: '翻译' }, { value: 'classify', label: '分类' },
                  { value: 'fill', label: '填充' }, { value: 'extract', label: '提取' },
                  { value: 'generate', label: '生成' }, { value: 'validate', label: '校验' },
                  { value: 'summarize', label: '摘要' }, { value: 'decide', label: '决策' },
                  { value: 'investigate', label: '调查' }, { value: 'orchestrate', label: '编排' },
                ]} />
              </Form.Item>
              <Form.Item name="tags" label="标签" style={{ marginBottom: 8, flex: 1 }}>
                <Select mode="tags" placeholder="回车添加" />
              </Form.Item>
            </div>

            {/* 背景指令 */}
            <Form.Item name="prompt_system" label="背景指令" style={{ marginBottom: 8 }}
              extra="追加到员工角色设定后，细化本任务行为。留空则继承员工设定">
              <TextArea rows={3} placeholder="如：翻译时保持商务格式，保留专有名词不翻译"
                style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Divider style={{ margin: '8px 0', fontSize: 12, color: '#999' }} plain>执行配置</Divider>

            {/* 触发 + 输出格式 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              <Form.Item name="trigger_type" label="触发" style={{ marginBottom: 8, flex: 1 }}>
                <Select placeholder="选择触发方式" options={[
                  { value: 'field_focus', label: '字段聚焦' },
                  { value: 'text_select', label: '选中文字' },
                  { value: 'button', label: '按钮点击' },
                  { value: 'context_menu', label: '右键菜单' },
                  { value: 'record_event', label: '记录事件' },
                  { value: 'schedule', label: '定时任务' },
                  { value: 'workflow', label: '工作流节点' },
                ]} />
              </Form.Item>
              <Form.Item name="output_format" label="输出格式" style={{ marginBottom: 8, width: 110 }}>
                <Select options={[{ value: 'text', label: '纯文本' }, { value: 'json', label: 'JSON' }]} />
              </Form.Item>
            </div>

            {/* 重试 + 超时 + 联网 + 启用 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Form.Item name="retry_count" label="重试" style={{ marginBottom: 0, width: 80 }}>
                <Select options={[0, 1, 2, 3].map(n => ({ value: n, label: `${n} 次` }))} />
              </Form.Item>
              <Form.Item name="timeout_ms" label="超时" style={{ marginBottom: 0, width: 90 }}>
                <Select options={[5000, 10000, 15000, 30000, 60000].map(n => ({ value: n, label: `${n / 1000}s` }))} />
              </Form.Item>
              <Form.Item name="web_search" label="联网搜索" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch size="small" />
              </Form.Item>
              <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
            </div>
          </Form>
        )}
      </Drawer>

      {/* Result Detail Drawer */}
      <Drawer
        title={detailCtx ? `执行详情: ${detailCtx.result.task_name}` : '加载中...'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 600}
      >
        {detailCtx && (() => {
          const dr = detailCtx.result;
          const src = TRIGGER_SOURCE_CONFIG[dr.trigger_source] || TRIGGER_SOURCE_CONFIG.backend;
          return (
          <div>
            {/* 触发来源 & 定位 */}
            <Card size="small" title={<><AimOutlined style={{ color: '#8b5cf6' }} /> 触发来源 & 定位</>} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
                <div><span style={{ color: '#999' }}>来源:</span> <Tag icon={src.icon} color={src.color} style={{ fontSize: 10 }}>{src.label}</Tag></div>
                <div><span style={{ color: '#999' }}>触发:</span> {dr.trigger_action || '-'}</div>
                <div><span style={{ color: '#999' }}>用户:</span> {dr.trigger_user || 'system'} {dr.trigger_user_id && <span style={{ color: '#ccc' }}>({dr.trigger_user_id})</span>}</div>
                <div><span style={{ color: '#999' }}>IP:</span> {dr.trigger_ip || '-'}</div>
                <div><span style={{ color: '#999' }}>页面:</span> {dr.page_id || '-'} → {dr.field_name || '(记录级)'}</div>
                <div><span style={{ color: '#999' }}>区块:</span> {dr.trigger_block_pos || '-'}</div>
                <div><span style={{ color: '#999' }}>记录:</span> {dr.record_id}</div>
              </div>
            </Card>

            {/* 执行依据 */}
            <Card size="small" title={<><FileTextOutlined style={{ color: '#fa8c16' }} /> 执行依据</>} style={{ marginBottom: 12 }}>
              {dr.prompt_used ? (
                <div style={{ marginBottom: dr.input_data && Object.keys(dr.input_data).length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>Prompt 模板（渲染后）</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: '#fffbe6', padding: 8, borderRadius: 4, margin: 0, border: '1px solid #ffe58f' }}>
                    {dr.prompt_used}
                  </pre>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#ccc', marginBottom: 4 }}>无 Prompt 记录</div>
              )}
              {dr.input_data && Object.keys(dr.input_data).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontWeight: 500 }}>输入参数</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: '#f6ffed', padding: 8, borderRadius: 4, margin: 0, border: '1px solid #b7eb8f' }}>
                    {JSON.stringify(dr.input_data, null, 2)}
                  </pre>
                </div>
              )}
            </Card>

            {/* 输出 */}
            <Card size="small" title="输出结果" style={{ marginBottom: 12 }}>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#faf8ff', padding: 8, borderRadius: 4, borderLeft: '3px solid #8b5cf6', margin: 0 }}>
                {dr.new_value}
              </pre>
            </Card>

            {/* 模型 & 执行 */}
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Tag>{dr.model}</Tag>
              <span>{dr.tokens_used} tokens</span>
              <span>{dr.duration_ms}ms</span>
              <span>置信度 {dr.confidence}%</span>
              <Tag color={STATUS_COLORS[dr.status]}>{dr.status}</Tag>
            </div>

            {/* 操作栏 */}
            <Space wrap style={{ marginBottom: 12 }}>
              <Button size="small" icon={<RedoOutlined />} onClick={() => handleRetry(dr.id)}>重试</Button>
              {dr.status === 'pending' && (
                <>
                  <Button size="small" type="primary" onClick={() => handleResultStatus(dr.id, 'applied')}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}>采纳</Button>
                  <Button size="small" danger onClick={() => handleResultStatus(dr.id, 'rejected')}>拒绝</Button>
                </>
              )}
              <Button size="small" icon={<LinkOutlined />}
                onClick={() => message.info(`目标: ${dr.page_id} → ${dr.record_id} → ${dr.field_name || '(记录)'}`)}>
                定位目标
              </Button>
              <Button size="small" icon={<MessageOutlined />}
                onClick={() => message.info('对话功能开发中...')}>
                展开会话
              </Button>
            </Space>

            {/* 审计记录 */}
            <Card size="small" title={`审计记录 (${detailCtx.audit.length})`}>
              {detailCtx.audit.length === 0 ? (
                <Empty description="暂无审计记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Timeline items={detailCtx.audit.map(log => ({
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
                <Input size="small" placeholder="添加审计备注..."
                  value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  onPressEnter={handleAddNote} style={{ flex: 1, fontSize: 12 }} />
                <Button size="small" type="primary" icon={<SendOutlined />}
                  loading={addingNote} onClick={handleAddNote}
                  disabled={!noteInput.trim()}
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                  备注
                </Button>
              </div>
            </Card>
          </div>
          );
        })()}
      </Drawer>
    </div>
  );
}
