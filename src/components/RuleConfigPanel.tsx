import { useState, useEffect } from 'react';
import {
  Drawer, Card, Button, Space, Select, Switch, Tag, Input, Empty,
  Divider, Popconfirm, message,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ThunderboltOutlined, RobotOutlined,
  ArrowRightOutlined, SettingOutlined,
} from '@ant-design/icons';
import { getTasks, type AITask } from '../api';
import { AITeamAvatars, AIFusedAvatar, AIParallelAvatars } from './AIAvatar';
import { AITaskSelector, type TaskConfig } from './AITaskSelector';
import { useResponsive } from '../hooks/useResponsive';

interface RuleItem {
  id: string;
  trigger: string;
  triggerField?: string;
  taskConfigs: TaskConfig[];
  mode?: 'collaborative' | 'parallel';
  postAction: string;
  postField?: string;
  enabled: boolean;
}

const TRIGGER_GROUPS = [
  {
    label: '数据事件',
    options: [
      { value: 'record_create', label: '记录创建时' },
      { value: 'record_update', label: '记录更新时' },
      { value: 'field_change', label: '字段变更时' },
    ],
  },
  {
    label: '用户交互',
    options: [
      { value: 'field_focus', label: '字段聚焦时' },
      { value: 'text_select', label: '选中文字时（拖拽选中）' },
      { value: 'context_menu', label: '右键菜单' },
      { value: 'button_click', label: '按钮点击时' },
      { value: 'hover', label: '鼠标悬停时' },
    ],
  },
  {
    label: '页面/区块',
    options: [
      { value: 'page_open', label: '页面打开时' },
      { value: 'block_render', label: '区块渲染时' },
      { value: 'list_load', label: '列表加载时' },
    ],
  },
  {
    label: '定时/工作流',
    options: [
      { value: 'schedule', label: '定时任务' },
      { value: 'workflow_node', label: '工作流节点' },
    ],
  },
];

const POST_ACTIONS = [
  { value: 'write_field', label: '写入字段' },
  { value: 'show_bubble', label: '气泡提示（等待采纳）' },
  { value: 'execute_workflow', label: '触发工作流' },
  { value: 'send_notification', label: '发送通知' },
  { value: 'create_alert', label: '创建预警' },
];

export function RuleConfigPanel({
  open,
  onClose,
  pageId,
  recordId,
}: {
  open: boolean;
  onClose: () => void;
  pageId: string;
  recordId?: string;
}) {
  const { isMobile } = useResponsive();
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);

  useEffect(() => {
    if (open) {
      getTasks().then(setTasks);
      if (rules.length === 0) {
        setRules([
          {
            id: 'rule-1', trigger: 'record_create',
            taskConfigs: [
              { taskId: 'task-translate', inputFields: ['content'], outputFields: ['language', 'translated_content'] },
              { taskId: 'task-classify', inputFields: ['content'], outputFields: ['category'] },
              { taskId: 'task-priority', inputFields: ['content', 'category'], outputFields: ['priority'] },
              { taskId: 'task-reply-gen', inputFields: ['content', 'customer_lang', 'knowledge_context'], outputFields: ['reply_draft'] },
            ],
            mode: 'collaborative', postAction: 'show_bubble', enabled: true,
          },
          {
            id: 'rule-2', trigger: 'field_change', triggerField: 'status',
            taskConfigs: [
              { taskId: 'task-knowledge', inputFields: ['content', 'resolution'], outputFields: ['knowledge_suggestion'] },
            ],
            postAction: 'write_field', postField: 'knowledge_suggestions', enabled: true,
          },
        ]);
      }
    }
  }, [open]);

  const addRule = () => {
    setRules(prev => [...prev, {
      id: `rule-${Date.now()}`,
      trigger: 'record_create',
      taskConfigs: [],
      postAction: 'show_bubble',
      enabled: true,
    }]);
  };

  const updateRule = (id: string, patch: Partial<RuleItem>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleSave = () => {
    message.success('联动规则已保存');
    onClose();
  };

  return (
    <Drawer
      title={
        <Space>
          <SettingOutlined style={{ color: '#8b5cf6' }} />
          <span>联动规则配置</span>
          <Tag>{pageId}</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={isMobile ? '100%' : 620}
      extra={
        <Space>
          <Button size="small" onClick={addRule} icon={<PlusOutlined />}>添加规则</Button>
          <Button type="primary" size="small" onClick={handleSave}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>保存</Button>
        </Space>
      }
    >
      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        每条规则：触发条件 → AI 任务（可配置输入/输出字段）→ 结果处理。前端事件和后端工作流节点使用相同的任务配置。
      </div>

      {rules.length === 0 ? (
        <Empty description="暂无联动规则，点击「添加规则」开始配置">
          <Button type="primary" icon={<PlusOutlined />} onClick={addRule}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
            添加规则
          </Button>
        </Empty>
      ) : (
        rules.map((rule, idx) => (
          <Card
            key={rule.id}
            size="small"
            style={{
              marginBottom: 12,
              borderLeft: `3px solid ${rule.enabled ? '#8b5cf6' : '#d9d9d9'}`,
              opacity: rule.enabled ? 1 : 0.6,
            }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#999' }}>#{idx + 1}</span>
                <Switch size="small" checked={rule.enabled}
                  onChange={v => updateRule(rule.id, { enabled: v })} />
                {rule.taskConfigs.length > 0 && (
                  <AITeamAvatars
                    members={rule.taskConfigs.map(c => tasks.find(t => t.id === c.taskId)).filter(Boolean).map(t => ({ avatar: t!.avatar, color: t!.avatar_color }))}
                    size={22}
                  />
                )}
                {rule.taskConfigs.length > 1 && (
                  <Tag color={(rule.mode || 'collaborative') === 'collaborative' ? 'purple' : 'blue'} style={{ fontSize: 10 }}>
                    {(rule.mode || 'collaborative') === 'collaborative' ? '协作' : '并发'} {rule.taskConfigs.length}
                  </Tag>
                )}
              </div>
            }
            extra={
              <Popconfirm title="删除此规则？" onConfirm={() => deleteRule(rule.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            }
          >
            {/* Trigger */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                <ThunderboltOutlined /> 触发条件
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  size="small" style={{ width: 200 }}
                  value={rule.trigger}
                  onChange={v => updateRule(rule.id, { trigger: v })}
                  options={TRIGGER_GROUPS}
                />
                {(rule.trigger === 'field_change' || rule.trigger === 'field_focus') && (
                  <Input
                    size="small" placeholder="字段名" style={{ width: 120 }}
                    value={rule.triggerField}
                    onChange={e => updateRule(rule.id, { triggerField: e.target.value })}
                  />
                )}
                {(rule.trigger === 'context_menu' || rule.trigger === 'text_select') && (
                  <Select
                    size="small" mode="multiple" style={{ width: 200 }}
                    placeholder="作用范围"
                    value={rule.triggerField?.split(',').filter(Boolean) || []}
                    onChange={v => updateRule(rule.id, { triggerField: v.join(',') })}
                    options={[
                      { value: 'field', label: '字段' },
                      { value: 'block', label: '区块' },
                      { value: 'row', label: '表格行' },
                      { value: 'page', label: '页面' },
                    ]}
                  />
                )}
              </div>
            </div>

            {/* AI Tasks — with per-task field config */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                <RobotOutlined /> AI 任务
                <span style={{ color: '#bbb', marginLeft: 4 }}>输入字段 → 输出字段</span>
              </div>
              <AITaskSelector
                tasks={tasks}
                value={rule.taskConfigs}
                onChange={configs => updateRule(rule.id, { taskConfigs: configs })}
                compact
              />

              {/* Mode selector — only show when 2+ tasks */}
              {rule.taskConfigs.length > 1 && (() => {
                const selectedTasks = rule.taskConfigs.map(c => tasks.find(t => t.id === c.taskId)).filter(Boolean) as AITask[];
                return (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {([
                      { key: 'collaborative' as const, label: '协作', desc: '合并 Prompt → 1 次调用', color: '#8b5cf6' },
                      { key: 'parallel' as const, label: '并发', desc: '独立调用 → 按字段回填', color: '#1677ff' },
                    ]).map(m => {
                      const active = (rule.mode || 'collaborative') === m.key;
                      return (
                        <div key={m.key}
                          onClick={() => updateRule(rule.id, { mode: m.key })}
                          style={{
                            flex: 1, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                            border: `2px solid ${active ? m.color : '#e8e8e8'}`,
                            background: active ? (m.key === 'collaborative' ? '#faf8ff' : '#f0f5ff') : '#fff',
                            transition: 'all 0.2s',
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            {m.key === 'collaborative'
                              ? <AIFusedAvatar members={selectedTasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }))} size={20} />
                              : <AIParallelAvatars members={selectedTasks.map(t => ({ avatar: t.avatar, color: t.avatar_color }))} size={14} />
                            }
                            <span style={{ fontWeight: 600, fontSize: 12, color: active ? m.color : '#333' }}>{m.label}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#999', lineHeight: 1.3 }}>{m.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Post action */}
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                <ArrowRightOutlined /> 结果处理
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  size="small" style={{ width: 200 }}
                  value={rule.postAction}
                  onChange={v => updateRule(rule.id, { postAction: v })}
                  options={POST_ACTIONS}
                />
                {rule.postAction === 'write_field' && (
                  <Input
                    size="small" placeholder="目标字段名" style={{ width: 150 }}
                    value={rule.postField}
                    onChange={e => updateRule(rule.id, { postField: e.target.value })}
                  />
                )}
              </div>
            </div>
          </Card>
        ))
      )}

      <Divider style={{ margin: '16px 0' }} />

      <div style={{ fontSize: 11, color: '#bbb' }}>
        每个任务可单独配置输入/输出字段映射。前端事件流和后端工作流节点共用相同的任务配置格式。
      </div>
    </Drawer>
  );
}
