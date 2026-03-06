/**
 * AITaskSelector — Shared task multi-select with per-task field config
 *
 * Used in:
 * - RuleConfigPanel (frontend event rules)
 * - WorkflowEditor (backend workflow nodes)
 *
 * Each selected task shows a configurable row:
 *   [avatar name] [input fields ▼] → [output fields ▼] [x]
 */
import { Select, Tag, Space, Button, Tooltip } from 'antd';
import {
  DeleteOutlined, PlusOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import type { AITask } from '../api';
import { AIAvatar } from './AIAvatar';

const ACTION_COLORS: Record<string, string> = {
  translate: 'blue', classify: 'purple', fill: 'cyan', extract: 'orange',
  generate: 'green', validate: 'red', summarize: 'magenta', decide: 'gold', investigate: 'geekblue',
};

export interface TaskConfig {
  taskId: string;
  inputFields: string[];   // which fields to pass as input (from context)
  outputFields: string[];  // which fields to write output to
}

interface AITaskSelectorProps {
  tasks: AITask[];
  value: TaskConfig[];
  onChange: (configs: TaskConfig[]) => void;
  /** Available context fields for input mapping (e.g. record fields) */
  contextFields?: string[];
  /** Available target fields for output mapping */
  targetFields?: string[];
  compact?: boolean;
}

export function AITaskSelector({
  tasks, value, onChange, contextFields, targetFields, compact,
}: AITaskSelectorProps) {
  const selectedIds = value.map(c => c.taskId);
  const availableTasks = tasks.filter(t => !selectedIds.includes(t.id));

  const addTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    onChange([...value, {
      taskId,
      inputFields: task.input_fields || [],
      outputFields: task.output_fields || [],
    }]);
  };

  const removeTask = (taskId: string) => {
    onChange(value.filter(c => c.taskId !== taskId));
  };

  const updateConfig = (taskId: string, patch: Partial<TaskConfig>) => {
    onChange(value.map(c => c.taskId === taskId ? { ...c, ...patch } : c));
  };

  return (
    <div>
      {/* Selected task rows */}
      {value.map((cfg) => {
        const task = tasks.find(t => t.id === cfg.taskId);
        if (!task) return null;
        return (
          <div key={cfg.taskId} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', marginBottom: 4,
            borderRadius: 6, background: '#faf8ff',
            border: '1px solid #f0ecff',
          }}>
            {/* Avatar + name */}
            <Tooltip title={task.description}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 100, flexShrink: 0 }}>
                <AIAvatar avatar={task.avatar} color={task.avatar_color} size={22} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{task.name}</span>
              </div>
            </Tooltip>

            {/* Input fields */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                size="small"
                mode="tags"
                style={{ width: '100%' }}
                placeholder="输入字段"
                value={cfg.inputFields}
                onChange={v => updateConfig(cfg.taskId, { inputFields: v })}
                options={(contextFields || task.input_fields || []).map(f => ({
                  value: f, label: f,
                }))}
                maxTagCount={compact ? 1 : 3}
                popupMatchSelectWidth={false}
              />
            </div>

            <ArrowRightOutlined style={{ color: '#d9d9d9', flexShrink: 0, fontSize: 10 }} />

            {/* Output fields */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                size="small"
                mode="tags"
                style={{ width: '100%' }}
                placeholder="输出字段"
                value={cfg.outputFields}
                onChange={v => updateConfig(cfg.taskId, { outputFields: v })}
                options={(targetFields || task.output_fields || []).map(f => ({
                  value: f, label: f,
                }))}
                maxTagCount={compact ? 1 : 3}
                popupMatchSelectWidth={false}
              />
            </div>

            {/* Remove */}
            <Button size="small" type="text" danger icon={<DeleteOutlined />}
              style={{ flexShrink: 0 }}
              onClick={() => removeTask(cfg.taskId)} />
          </div>
        );
      })}

      {/* Add task */}
      {availableTasks.length > 0 && (
        <Select
          size="small"
          style={{ width: '100%' }}
          placeholder={<span><PlusOutlined /> 添加 AI 任务</span>}
          value={undefined}
          onChange={addTask}
          options={availableTasks.map(t => ({
            value: t.id,
            label: (
              <Space size={4}>
                <span>{t.avatar || '\u{1F916}'}</span>
                <span>{t.name}</span>
                <Tag color={ACTION_COLORS[t.action] || 'default'} style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{t.action}</Tag>
                <span style={{ fontSize: 10, color: '#bbb' }}>{(t.input_fields || []).join(',')}{' \u2192 '}{(t.output_fields || []).join(',')}</span>
              </Space>
            ),
          }))}
          filterOption={(input, option) =>
            (tasks.find(t => t.id === option?.value)?.name || '').toLowerCase().includes(input.toLowerCase())
          }
        />
      )}

      {/* Summary */}
      {value.length > 1 && (
        <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 4 }}>
          {value.length} 个任务组合执行，共享上下文
        </div>
      )}
    </div>
  );
}
