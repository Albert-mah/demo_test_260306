/**
 * BlockTemplatePreview — Renders a block template as interactive UI
 *
 * Used in:
 * - BlockTemplateManager (preview drawer)
 * - AIChatModal (AI invokes template in conversation)
 *
 * Block types: text, form, table, stat, approval, action
 */
import { useState } from 'react';
import {
  Card, Input, Select, Button, Tag, Space, Progress, Steps, Statistic,
  Upload, message,
} from 'antd';
import {
  UploadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import type { BlockTemplate, TemplateBlock } from '../api';

interface BlockTemplatePreviewProps {
  template: BlockTemplate;
  /** When provided, form submit calls this instead of showing a message */
  onSubmit?: (action: string, data: Record<string, unknown>) => void;
  /** When provided, action buttons call this */
  onAction?: (action: string, target?: string) => void;
  /** Pre-filled data for template variables like {{field}} */
  data?: Record<string, unknown>;
  compact?: boolean;
}

export function BlockTemplatePreview({
  template, onSubmit, onAction, data = {}, compact,
}: BlockTemplatePreviewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
      {template.blocks.map((block, idx) => (
        <BlockRenderer
          key={idx}
          block={block}
          data={data}
          color={template.color}
          onSubmit={onSubmit}
          onAction={onAction}
          compact={compact}
        />
      ))}
    </div>
  );
}

function BlockRenderer({
  block, data, color, onSubmit, onAction, compact,
}: {
  block: TemplateBlock;
  data: Record<string, unknown>;
  color: string;
  onSubmit?: (action: string, data: Record<string, unknown>) => void;
  onAction?: (action: string, target?: string) => void;
  compact?: boolean;
}) {
  switch (block.type) {
    case 'text': return <TextBlock config={block.config} data={data} color={color} />;
    case 'form': return <FormBlock config={block.config} data={data} color={color} onSubmit={onSubmit} compact={compact} />;
    case 'table': return <TableBlock config={block.config} />;
    case 'stat': return <StatBlock config={block.config} data={data} />;
    case 'approval': return <ApprovalBlock config={block.config} />;
    case 'action': return <ActionBlock config={block.config} color={color} onAction={onAction} />;
    default: return <div style={{ fontSize: 11, color: '#999' }}>Unknown block type: {block.type}</div>;
  }
}

function resolveVars(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? `{{${key}}}`));
}

function TextBlock({ config, data, color }: { config: Record<string, unknown>; data: Record<string, unknown>; color: string }) {
  const content = resolveVars(String(config.content || ''), data);
  const style = config.style as string;

  if (style === 'heading') {
    return <div style={{ fontSize: 16, fontWeight: 700, color: '#333', borderBottom: `2px solid ${color}`, paddingBottom: 6 }}>{content}</div>;
  }
  if (style === 'insight') {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: `${color}08`, border: `1px solid ${color}30`,
        fontSize: 13, lineHeight: 1.6, color: '#333',
      }}>
        <span style={{ color, fontWeight: 600, marginRight: 6 }}>AI</span>
        {content}
      </div>
    );
  }
  if (style === 'warning') {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: '#fff7e6', border: '1px solid #ffd59130',
        fontSize: 13, lineHeight: 1.6, color: '#874d00',
      }}>
        <ExclamationCircleOutlined style={{ marginRight: 6, color: '#faad14' }} />
        {content}
      </div>
    );
  }
  if (style === 'preview') {
    return (
      <div style={{
        padding: 12, borderRadius: 8, background: '#fafafa',
        border: '1px solid #e8e8e8', fontSize: 13, lineHeight: 1.6,
        whiteSpace: 'pre-wrap', minHeight: 60,
      }}>
        {content || <span style={{ color: '#bbb' }}>AI 生成内容将显示在此处...</span>}
      </div>
    );
  }
  return <div style={{ fontSize: 13, lineHeight: 1.6, color: '#666' }}>{content}</div>;
}

function StatBlock({ config, data }: { config: Record<string, unknown>; data: Record<string, unknown> }) {
  const items = (config.items as { label: string; value: string; prefix?: string; suffix?: string; color?: string; trend?: string }[]) || [];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <Card key={i} size="small" style={{ flex: '1 1 100px', minWidth: 100, textAlign: 'center' }}>
          <Statistic
            title={<span style={{ fontSize: 11 }}>{item.label}</span>}
            value={resolveVars(String(item.value), data)}
            prefix={item.prefix}
            suffix={item.suffix}
            valueStyle={{ fontSize: 18, color: resolveVars(item.color || '#333', data) }}
          />
          {item.trend && (
            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
              {resolveVars(item.trend, data)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function FormBlock({
  config, data, color, onSubmit, compact,
}: {
  config: Record<string, unknown>;
  data: Record<string, unknown>;
  color: string;
  onSubmit?: (action: string, data: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const fields = (config.fields as { name: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string; accept?: string; ai_fill?: boolean }[]) || [];
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const updateField = (name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    const missing = fields.filter(f => f.required && !formData[f.name]);
    if (missing.length > 0) {
      message.warning(`请填写: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    if (onSubmit) {
      onSubmit(String(config.submit_action || 'submit'), formData);
    } else {
      message.success('表单已提交（Demo）');
    }
  };

  return (
    <Card size="small" style={{ borderColor: `${color}30` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
        {fields.map(field => (
          <div key={field.name}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              {field.label}
              {field.required && <span style={{ color: '#ff4d4f' }}> *</span>}
              {field.ai_fill && <Tag color="purple" style={{ fontSize: 9, marginLeft: 4, lineHeight: '14px', padding: '0 4px' }}>AI</Tag>}
            </div>
            {field.type === 'textarea' ? (
              <Input.TextArea
                size="small" rows={compact ? 2 : 3}
                placeholder={field.placeholder || `请输入${field.label}`}
                value={String(formData[field.name] || data[field.name] || '')}
                onChange={e => updateField(field.name, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <Select
                size="small" style={{ width: '100%' }}
                placeholder={`选择${field.label}`}
                value={formData[field.name] as string || data[field.name] as string || undefined}
                onChange={v => updateField(field.name, v)}
                options={(field.options || []).map(o => ({ value: o, label: o }))}
              />
            ) : field.type === 'number' ? (
              <Input
                size="small" type="number"
                placeholder={`请输入${field.label}`}
                value={String(formData[field.name] || data[field.name] || '')}
                onChange={e => updateField(field.name, e.target.value)}
              />
            ) : field.type === 'file' ? (
              <Upload
                beforeUpload={() => { updateField(field.name, 'uploaded'); return false; }}
                accept={field.accept}
                maxCount={1}
              >
                <Button size="small" icon={<UploadOutlined />}>上传{field.label}</Button>
              </Upload>
            ) : (
              <Input
                size="small"
                placeholder={field.placeholder || `请输入${field.label}`}
                value={String(formData[field.name] || data[field.name] || '')}
                onChange={e => updateField(field.name, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <Button
        type="primary" size="small"
        onClick={handleSubmit}
        style={{ marginTop: 12, background: color, borderColor: color }}
      >
        {String(config.submit_label || '提交')}
      </Button>
    </Card>
  );
}

function TableBlock({ config }: { config: Record<string, unknown> }) {
  const title = String(config.title || '');
  const cols = (config.columns as string[]) || [];
  const maxRows = (config.max_rows as number) || 3;

  // Demo placeholder rows
  const demoData = Array.from({ length: maxRows }, (_, i) => {
    const row: Record<string, string> = { key: String(i) };
    cols.forEach(col => { row[col] = `--`; });
    return row;
  });

  return (
    <div>
      {title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col} style={{
                  padding: '6px 8px', background: '#fafafa',
                  borderBottom: '1px solid #e8e8e8', textAlign: 'left',
                  fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {demoData.map((row, i) => (
              <tr key={i}>
                {cols.map(col => (
                  <td key={col} style={{
                    padding: '6px 8px', borderBottom: '1px solid #f0f0f0',
                    color: '#bbb',
                  }}>
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
        数据源: {String(config.data_source || 'N/A')}
      </div>
    </div>
  );
}

function ApprovalBlock({ config }: { config: Record<string, unknown> }) {
  const steps = (config.steps as { role: string; status: string; condition?: string }[]) || [];
  const statusMap: Record<string, { icon: React.ReactNode; color: string }> = {
    pending: { icon: <ClockCircleOutlined />, color: '#faad14' },
    approved: { icon: <CheckCircleOutlined />, color: '#52c41a' },
    rejected: { icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
    waiting: { icon: <ClockCircleOutlined />, color: '#d9d9d9' },
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>审批流程</div>
      <Steps
        size="small"
        current={steps.findIndex(s => s.status === 'pending')}
        items={steps.map(step => {
          const st = statusMap[step.status] || statusMap.waiting;
          return {
            title: <span style={{ fontSize: 12 }}>{step.role}</span>,
            description: step.condition
              ? <Tag style={{ fontSize: 9 }}>{step.condition}</Tag>
              : undefined,
            icon: <span style={{ color: st.color }}>{st.icon}</span>,
          };
        })}
      />
    </div>
  );
}

function ActionBlock({
  config, color, onAction,
}: {
  config: Record<string, unknown>;
  color: string;
  onAction?: (action: string, target?: string) => void;
}) {
  const buttons = (config.buttons as { label: string; action: string; target?: string; style?: string; format?: string }[]) || [];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {buttons.map((btn, i) => (
        <Button
          key={i}
          size="small"
          type={btn.style === 'primary' ? 'primary' : 'default'}
          style={btn.style === 'primary' ? { background: color, borderColor: color } : undefined}
          icon={<ArrowRightOutlined />}
          onClick={() => {
            if (onAction) onAction(btn.action, btn.target);
            else message.info(`操作: ${btn.action}（Demo）`);
          }}
        >
          {btn.label}
        </Button>
      ))}
    </div>
  );
}
