/**
 * AITriggers — Built-in trigger components
 *
 * 1. AISelectionTrigger — text selection → floating action bar
 * 2. AIContextMenu — right-click → AI context menu
 * 3. useAITriggers — hook to attach triggers to a container ref
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Dropdown, Space, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  TranslationOutlined, BulbOutlined, EditOutlined,
  CopyOutlined, RobotOutlined, ThunderboltOutlined,
  FileSearchOutlined, MessageOutlined,
} from '@ant-design/icons';
import { type AITask } from '../api';
import { AIAvatar } from './AIAvatar';

/** Floating bar that appears when user selects text */
export function AISelectionBar({
  visible,
  x,
  y,
  selectedText,
  tasks,
  onAction,
  onDismiss,
}: {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  tasks: AITask[];
  onAction: (action: string, taskId?: string) => void;
  onDismiss: () => void;
}) {
  if (!visible || !selectedText) return null;

  const quickActions = [
    { key: 'translate', icon: <TranslationOutlined />, label: '翻译', color: '#1677ff' },
    { key: 'summarize', icon: <BulbOutlined />, label: '摘要', color: '#52c41a' },
    { key: 'rewrite', icon: <EditOutlined />, label: '改写', color: '#fa541c' },
    { key: 'explain', icon: <FileSearchOutlined />, label: '解释', color: '#722ed1' },
    { key: 'chat', icon: <MessageOutlined />, label: '对话', color: '#8b5cf6' },
  ];

  return (
    <div
      style={{
        position: 'fixed', left: x, top: y - 44,
        background: '#fff', borderRadius: 8, padding: '4px 6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100,
        display: 'flex', alignItems: 'center', gap: 2,
        border: '1px solid #f0f0f0',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {quickActions.map(a => (
        <Button key={a.key} size="small" type="text"
          icon={a.icon}
          style={{ fontSize: 11, color: a.color }}
          onClick={() => { onAction(a.key); onDismiss(); }}>
          {a.label}
        </Button>
      ))}
      <div style={{ width: 1, height: 20, background: '#f0f0f0', margin: '0 2px' }} />
      {/* Show relevant AI employees */}
      {tasks.slice(0, 3).map(t => (
        <span key={t.id} style={{ cursor: 'pointer' }} title={t.name}
          onClick={() => { onAction('task', t.id); onDismiss(); }}>
          <AIAvatar avatar={t.avatar} color={t.avatar_color} size={22} />
        </span>
      ))}
    </div>
  );
}

/** Right-click context menu items for AI */
export function getAIContextMenuItems(
  tasks: AITask[],
  context: { selectedText?: string; fieldName?: string; recordId?: string },
  onAction: (action: string, taskId?: string) => void,
): MenuProps['items'] {
  const items: MenuProps['items'] = [
    {
      key: 'ai-header',
      label: <span style={{ color: '#8b5cf6', fontWeight: 600, fontSize: 12 }}>
        <RobotOutlined /> AI 操作
      </span>,
      type: 'group',
    },
  ];

  // Quick actions based on context
  if (context.selectedText) {
    items.push(
      { key: 'translate', icon: <TranslationOutlined />, label: '翻译选中文本', onClick: () => onAction('translate') },
      { key: 'summarize', icon: <BulbOutlined />, label: '摘要', onClick: () => onAction('summarize') },
      { key: 'rewrite', icon: <EditOutlined />, label: '改写', onClick: () => onAction('rewrite') },
    );
  }

  if (context.fieldName) {
    items.push(
      { key: 'fill', icon: <ThunderboltOutlined />, label: `AI 填充「${context.fieldName}」`, onClick: () => onAction('fill') },
    );
  }

  items.push({ type: 'divider' });

  // AI employees
  items.push({
    key: 'employees',
    label: <span style={{ fontSize: 12, color: '#999' }}>指定 AI 员工</span>,
    type: 'group',
  });

  for (const t of tasks.slice(0, 6)) {
    items.push({
      key: t.id,
      icon: <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%', background: t.avatar_color,
        fontSize: 9,
      }}>{t.avatar}</span>,
      label: <span style={{ fontSize: 12 }}>{t.name}</span>,
      onClick: () => onAction('task', t.id),
    });
  }

  items.push({ type: 'divider' });
  items.push({
    key: 'chat',
    icon: <MessageOutlined />,
    label: '开始 AI 对话...',
    onClick: () => onAction('chat'),
  });

  return items;
}

/** Wrapper component: adds text selection bar + right-click context menu to children */
export function AITriggerWrapper({
  tasks,
  onAction,
  children,
  style,
}: {
  tasks: AITask[];
  onAction: (action: string, context: { selectedText?: string; taskId?: string }) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [selectionBar, setSelectionBar] = useState({ visible: false, x: 0, y: 0, text: '' });
  const containerRef = useRef<HTMLDivElement>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 2) {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionBar({
          visible: true,
          x: rect.left + rect.width / 2 - 150,
          y: rect.top,
          text,
        });
      }
    };

    const handleMouseDown = () => {
      setSelectionBar(prev => prev.visible ? { ...prev, visible: false } : prev);
    };

    el.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      el.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const handleSelectionAction = (action: string, taskId?: string) => {
    onActionRef.current(action, { selectedText: selectionBar.text, taskId });
  };

  const contextMenuItems = getAIContextMenuItems(
    tasks,
    { selectedText: selectionBar.text },
    (action, taskId) => onActionRef.current(action, { selectedText: selectionBar.text, taskId }),
  );

  return (
    <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
      <div ref={containerRef} style={style}>
        {children}
        <AISelectionBar
          visible={selectionBar.visible}
          x={selectionBar.x}
          y={selectionBar.y}
          selectedText={selectionBar.text}
          tasks={tasks}
          onAction={handleSelectionAction}
          onDismiss={() => setSelectionBar(prev => ({ ...prev, visible: false }))}
        />
      </div>
    </Dropdown>
  );
}

/** Hook version — returns the same wrapper for backward compat */
export function useAITriggers(
  tasks: AITask[],
  onAction: (action: string, context: { selectedText?: string; taskId?: string }) => void,
) {
  const Wrapper = useCallback(
    ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
      <AITriggerWrapper tasks={tasks} onAction={onAction} style={style}>
        {children}
      </AITriggerWrapper>
    ),
    [tasks, onAction],
  );

  return { AITriggerWrapper: Wrapper };
}
