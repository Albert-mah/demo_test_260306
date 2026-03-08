/**
 * AITaskSelector — Shared task multi-select with per-task field config
 *
 * Used in:
 * - RuleConfigPanel (frontend event rules)
 * - WorkflowEditor (backend workflow nodes)
 *
 * Layout (single employee):
 *   [avatar employee-name]              ← header
 *     [action] description  [in▼] → [out▼] [x]
 *
 * Layout (collaboration — multi employee):
 *   [avatar avatar avatar] 协作组合 N 人 · M 任务
 *   [color-dot employee] [action] description  [in▼] → [out▼] [x]
 *   [color-dot employee] [action] description  [in▼] → [out▼] [x]
 */
import { Select, Tag, Space, Button } from 'antd';
import {
  DeleteOutlined, PlusOutlined, ArrowRightOutlined, TeamOutlined,
} from '@ant-design/icons';
import type { AITask } from '../api';
import { AIAvatar } from './AIAvatar';

const ACTION_COLORS: Record<string, string> = {
  translate: 'blue', classify: 'purple', fill: 'cyan', extract: 'orange',
  generate: 'green', validate: 'red', summarize: 'magenta', decide: 'gold', investigate: 'geekblue',
};

export interface TaskConfig {
  taskId: string;
  inputFields: string[];
  outputFields: string[];
}

interface AITaskSelectorProps {
  tasks: AITask[];
  value: TaskConfig[];
  onChange: (configs: TaskConfig[]) => void;
  contextFields?: string[];
  targetFields?: string[];
  compact?: boolean;
}

/* ── Task row (shared by both modes) ── */
function TaskRow({ cfg, task, empColor, showEmp, onRemove, onUpdate, contextFields, targetFields, compact }: {
  cfg: TaskConfig; task: AITask; empColor: string; showEmp: boolean;
  onRemove: () => void; onUpdate: (p: Partial<TaskConfig>) => void;
  contextFields?: string[]; targetFields?: string[]; compact?: boolean;
}) {
  return (
    <div style={{ padding: '5px 8px 5px 10px', background: `${empColor}06` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        {showEmp && (
          <>
            <AIAvatar avatar={task.avatar} color={empColor} size={16} />
            <span style={{ fontSize: 10, color: empColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{task.name}</span>
            <span style={{ color: '#e0e0e0', fontSize: 10 }}>|</span>
          </>
        )}
        <Tag color={ACTION_COLORS[task.action] || 'default'}
          style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{task.action}</Tag>
        <span style={{ fontSize: 11, color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.description}
        </span>
        <Button size="small" type="text" danger icon={<DeleteOutlined />}
          style={{ flexShrink: 0, width: 22, height: 22 }}
          onClick={onRemove} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: showEmp ? 20 : 0 }}>
        <Select size="small" mode="tags" style={{ flex: 1 }} placeholder="输入字段"
          value={cfg.inputFields}
          onChange={v => onUpdate({ inputFields: v })}
          options={(contextFields || task.input_fields || []).map(f => ({ value: f, label: f }))}
          maxTagCount={compact ? 2 : 3} popupMatchSelectWidth={false} />
        <ArrowRightOutlined style={{ color: '#d9d9d9', flexShrink: 0, fontSize: 10 }} />
        <Select size="small" mode="tags" style={{ flex: 1 }} placeholder="输出字段"
          value={cfg.outputFields}
          onChange={v => onUpdate({ outputFields: v })}
          options={(targetFields || task.output_fields || []).map(f => ({ value: f, label: f }))}
          maxTagCount={compact ? 2 : 3} popupMatchSelectWidth={false} />
      </div>
    </div>
  );
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

  // Group selected tasks by employee
  const selectedByEmp = new Map<string, { avatar: string; color: string; cfgs: Array<{ cfg: TaskConfig; task: AITask }> }>();
  for (const cfg of value) {
    const task = tasks.find(t => t.id === cfg.taskId);
    if (!task) continue;
    const key = task.name;
    if (!selectedByEmp.has(key)) {
      selectedByEmp.set(key, { avatar: task.avatar, color: task.avatar_color, cfgs: [] });
    }
    selectedByEmp.get(key)!.cfgs.push({ cfg, task });
  }

  const isCollab = selectedByEmp.size > 1;
  const empEntries = Array.from(selectedByEmp.entries());

  return (
    <div>
      {isCollab ? (
        /* ── Collaboration mode: stacked avatars header + flat task list ── */
        <div style={{
          marginBottom: 6, borderRadius: 6,
          border: '1px solid #e8e0f0',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #f8f6ff 0%, #f0f7ff 100%)',
        }}>
          {/* Collab header with overlapping avatars */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px',
            borderBottom: '1px solid #e8e0f0',
            background: 'linear-gradient(90deg, #f3eeff 0%, #eef4ff 50%, #f0fff4 100%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {empEntries.map(([name, emp], i) => (
                <div key={name} style={{
                  marginLeft: i > 0 ? -6 : 0, zIndex: empEntries.length - i,
                  position: 'relative',
                  borderRadius: '50%', border: '2px solid #fff',
                  display: 'inline-flex',
                }}>
                  <AIAvatar avatar={emp.avatar} color={emp.color} size={22} />
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                <TeamOutlined style={{ marginRight: 4, color: '#8b5cf6' }} />
                协作组合
              </div>
              <div style={{ fontSize: 10, color: '#999' }}>
                {empEntries.map(([name, emp], i) => (
                  <span key={name}>
                    {i > 0 && <span style={{ margin: '0 3px', color: '#ddd' }}>/</span>}
                    <span style={{ color: emp.color, fontWeight: 500 }}>{name}</span>
                  </span>
                ))}
                <span style={{ marginLeft: 6 }}>{value.length} 个任务</span>
              </div>
            </div>
          </div>
          {/* Flat task list, each row shows its employee inline */}
          {empEntries.map(([empName, emp]) =>
            emp.cfgs.map(({ cfg, task }, i) => (
              <div key={cfg.taskId} style={{
                borderBottom: '1px solid #f0eaf8',
                borderLeft: `3px solid ${emp.color}`,
              }}>
                <TaskRow cfg={cfg} task={task} empColor={emp.color} showEmp
                  onRemove={() => removeTask(cfg.taskId)}
                  onUpdate={p => updateConfig(cfg.taskId, p)}
                  contextFields={contextFields} targetFields={targetFields} compact={compact} />
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Single employee mode: original grouped view ── */
        empEntries.map(([empName, emp]) => {
          const c = emp.color;
          const headerBg = `${c}12`;
          const rowBg = `${c}08`;
          const borderColor = `${c}30`;
          return (
            <div key={empName} style={{
              marginBottom: 6, borderRadius: 6,
              border: `1px solid ${borderColor}`,
              borderLeft: `3px solid ${c}`,
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', background: headerBg,
                borderBottom: `1px solid ${borderColor}`,
              }}>
                <AIAvatar avatar={emp.avatar} color={c} size={18} />
                <span style={{ fontSize: 12, fontWeight: 600, color: c }}>{empName}</span>
                <span style={{ fontSize: 10, color: '#bbb' }}>{emp.cfgs.length} 个任务</span>
              </div>
              {emp.cfgs.map(({ cfg, task }, i) => (
                <div key={cfg.taskId} style={{
                  borderBottom: i < emp.cfgs.length - 1 ? `1px solid ${borderColor}` : undefined,
                  background: rowBg,
                }}>
                  <TaskRow cfg={cfg} task={task} empColor={c} showEmp={false}
                    onRemove={() => removeTask(cfg.taskId)}
                    onUpdate={p => updateConfig(cfg.taskId, p)}
                    contextFields={contextFields} targetFields={targetFields} compact={compact} />
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* Add task dropdown — 二级菜单: 员工 > 任务 */}
      {availableTasks.length > 0 && (() => {
        const empMap = new Map<string, { avatar: string; color: string; tasks: typeof availableTasks }>();
        for (const t of availableTasks) {
          const key = t.name;
          if (!empMap.has(key)) {
            empMap.set(key, { avatar: t.avatar || '\u{1F916}', color: t.avatar_color || '#8b5cf6', tasks: [] });
          }
          empMap.get(key)!.tasks.push(t);
        }
        const groupedOptions = Array.from(empMap.entries()).map(([empName, emp]) => ({
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%', background: emp.color, fontSize: 10,
              }}>{emp.avatar}</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{empName}</span>
              <span style={{ fontSize: 10, color: '#bbb' }}>({emp.tasks.length})</span>
            </span>
          ),
          title: empName,
          options: emp.tasks.map(t => ({
            value: t.id,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingLeft: 2 }}>
                <Tag color={ACTION_COLORS[t.action] || 'default'} style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{t.action}</Tag>
                <span style={{ fontSize: 12 }}>{t.description}</span>
              </span>
            ),
          })),
        }));
        return (
          <Select
            size="small"
            style={{ width: '100%' }}
            placeholder={<span><PlusOutlined /> 选择员工 / 任务</span>}
            value={undefined}
            onChange={addTask}
            options={groupedOptions}
            filterOption={(input, option) => {
              const t = tasks.find(tk => tk.id === (option as { value?: string })?.value);
              if (!t) return false;
              const lc = input.toLowerCase();
              return t.name.toLowerCase().includes(lc) || t.description.toLowerCase().includes(lc) || t.action.toLowerCase().includes(lc);
            }}
            popupMatchSelectWidth={false}
            showSearch
          />
        );
      })()}

      {/* Summary — only for single employee multi-task */}
      {value.length > 1 && !isCollab && (
        <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 4 }}>
          {value.length} 个任务组合执行，共享上下文
        </div>
      )}
    </div>
  );
}
