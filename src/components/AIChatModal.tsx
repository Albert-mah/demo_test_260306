/**
 * AIChatModal — Unified rich chat panel for AI conversations
 *
 * Features:
 * - Right-side fixed panel, draggable, collapsible
 * - File upload (drag & drop + clip button)
 * - Voice input (browser SpeechRecognition)
 * - Chat history with user/AI bubbles
 * - Attachments shown inline in messages
 * - "Apply result" action on AI analysis messages
 *
 * Used by:
 * - AIEmployeeCard (对话微调 → opens this modal)
 * - OrderPanel (AI 校对 → opens this modal)
 * - Any future AI conversation entry point
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Upload, Tag, Spin, Popover, message } from 'antd';
import {
  SendOutlined, PaperClipOutlined, AudioOutlined, AudioMutedOutlined,
  CheckCircleOutlined, CloseOutlined, AppstoreOutlined, SearchOutlined,
  FileImageOutlined, FilePdfOutlined, FileExcelOutlined, FileTextOutlined,
  LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import { AIAvatar } from './AIAvatar';
import { BlockTemplatePreview } from './BlockTemplatePreview';
import { getBlockTemplates, useBlockTemplate, type BlockTemplate } from '../api';

export const FILE_ICON_MAP: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  image: <FileImageOutlined style={{ color: '#1677ff' }} />,
  excel: <FileExcelOutlined style={{ color: '#52c41a' }} />,
  text: <FileTextOutlined style={{ color: '#999' }} />,
};

export function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  return 'text';
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  files?: { name: string; size: number }[];
  /** If present, shows "apply" button on this message */
  actionable?: boolean;
  actionLabel?: string;
  /** If present, renders a block template inline */
  template?: BlockTemplate;
  templateData?: Record<string, unknown>;
}

interface AIChatModalProps {
  open: boolean;
  onClose: () => void;

  // AI employee identity
  avatar: string;
  color: string;
  name: string;
  subtitle?: string;

  // Chat state (controlled)
  messages: ChatMessage[];
  loading?: boolean;

  // Callbacks
  onSend: (text: string, files?: { name: string; size: number }[]) => void;
  onAction?: () => void;  // "apply result" callback
  onTemplateSelect?: (template: BlockTemplate) => void;
  onTemplateSubmit?: (templateId: string, action: string, data: Record<string, unknown>) => void;
  onTemplateAction?: (templateId: string, action: string, target?: string) => void;

  // Optional
  placeholder?: string;
  context?: string;
  width?: number;
}

const PANEL_WIDTH = 380;
const COLLAPSED_WIDTH = 36;

export function AIChatModal({
  open, onClose,
  avatar, color, name, subtitle,
  messages, loading,
  onSend, onAction, onTemplateSelect, onTemplateSubmit, onTemplateAction,
  placeholder = '输入消息，可追加附件或语音...',
  context,
}: AIChatModalProps) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [tplPickerOpen, setTplPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 80 });
  const [dragging, setDragging] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Initialize position on right side
  useEffect(() => {
    if (open) {
      setPosition({ x: window.innerWidth - PANEL_WIDTH - 20, y: 80 });
      setCollapsed(false);
    }
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Reset input state when modal opens
  useEffect(() => {
    if (open) {
      setInput('');
      setFiles([]);
      setRecording(false);
    }
  }, [open]);

  // Drag handlers (mouse + touch)
  const startDrag = useCallback((clientX: number, clientY: number) => {
    setDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };
    }
  }, []);

  const handleMouseDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleTouchDragStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
  }, [startDrag]);

  useEffect(() => {
    if (!dragging) return;
    const moveTo = (clientX: number, clientY: number) => {
      const w = collapsed ? COLLAPSED_WIDTH : PANEL_WIDTH;
      const newX = Math.max(0, Math.min(window.innerWidth - w, clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    };
    const handleMouseMove = (e: MouseEvent) => moveTo(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => { e.preventDefault(); moveTo(e.touches[0].clientX, e.touches[0].clientY); };
    const handleEnd = () => setDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [dragging, collapsed]);

  const handleSend = () => {
    if (!input.trim() && files.length === 0) return;
    onSend(input.trim(), files.length > 0 ? [...files] : undefined);
    setInput('');
    setFiles([]);
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      message.warning('当前浏览器不支持语音输入');
      return;
    }

    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setInput(prev => prev + transcript);
    };

    recognition.onend = () => setRecording(false);
    recognition.onerror = () => {
      setRecording(false);
      message.error('语音识别出错，请重试');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const toggleCollapse = () => {
    if (collapsed) {
      // Expanding: make sure panel fits on screen
      const maxX = window.innerWidth - PANEL_WIDTH - 10;
      setPosition(prev => ({ ...prev, x: Math.min(prev.x, maxX) }));
    }
    setCollapsed(!collapsed);
  };

  if (!open) return null;

  // Collapsed: vertical tab on the edge
  if (collapsed) {
    return (
      <div
        ref={panelRef}
        onMouseDown={handleMouseDragStart}
        onTouchStart={handleTouchDragStart}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: COLLAPSED_WIDTH,
          borderRadius: 8,
          background: 'linear-gradient(180deg, #8b5cf6, #6d28d9)',
          boxShadow: '0 4px 16px rgba(139,92,246,0.3)',
          zIndex: 1050,
          cursor: dragging ? 'grabbing' : 'grab',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 6,
          userSelect: 'none',
        }}
      >
        <AIAvatar avatar={avatar} color={color} size={24} />
        {messages.length > 0 && (
          <span style={{
            background: '#fff', color: '#8b5cf6', borderRadius: 8,
            fontSize: 9, fontWeight: 700, padding: '0 4px', lineHeight: '14px',
          }}>
            {messages.length}
          </span>
        )}
        <Button
          type="text" size="small"
          icon={<LeftOutlined style={{ fontSize: 10, color: '#fff' }} />}
          onClick={toggleCollapse}
          style={{ width: 24, height: 24, padding: 0 }}
          title="展开对话"
        />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        maxHeight: `calc(100vh - ${position.y + 20}px)`,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(139,92,246,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        background: '#fff',
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e8dcff',
        transition: dragging ? 'none' : 'left 0.2s, top 0.2s',
      }}
    >
      {/* Header — draggable */}
      <div
        onMouseDown={handleMouseDragStart}
        onTouchStart={handleTouchDragStart}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: 'linear-gradient(135deg, #faf8ff, #f0ecff)',
          borderBottom: '1px solid #e8dcff',
          flexShrink: 0,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <AIAvatar avatar={avatar} color={color} size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
          {subtitle && <div style={{ fontSize: 11, color: '#999' }}>{subtitle}</div>}
        </div>
        <Button type="text" size="small"
          icon={<RightOutlined style={{ fontSize: 10 }} />}
          onClick={toggleCollapse}
          style={{ color: '#999' }}
          title="收起对话"
        />
        <Button type="text" size="small" icon={<CloseOutlined />}
          onClick={onClose} style={{ color: '#999' }} />
      </div>

      {/* Context banner */}
      {context && (
        <div style={{
          padding: '6px 16px', background: '#f9f7ff', borderBottom: '1px solid #f0ecff',
          fontSize: 11, color: '#8b5cf6',
        }}>
          已携带上下文: {context.slice(0, 80)}{context.length > 80 ? '...' : ''}
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: 12,
        background: '#fafafa',
        minHeight: 200,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12,
          }}>
            {msg.role === 'ai' && (
              <AIAvatar avatar={avatar} color={color} size={28}
                style={{ marginRight: 8, flexShrink: 0, marginTop: 4 }} />
            )}
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? '#e8dcff' : '#fff',
              border: msg.role === 'ai' ? '1px solid #e8dcff' : 'none',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {/* File attachments */}
              {msg.files && msg.files.length > 0 && (
                <div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {msg.files.map((f, j) => (
                    <Tag key={j} icon={FILE_ICON_MAP[getFileType(f.name)] || FILE_ICON_MAP.text}
                      style={{ fontSize: 11, marginBottom: 2 }}>
                      {f.name}
                    </Tag>
                  ))}
                </div>
              )}
              {msg.text && <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>}

              {/* Inline template block */}
              {msg.template && (
                <div style={{ marginTop: msg.text ? 8 : 0 }}>
                  <BlockTemplatePreview
                    template={msg.template}
                    data={msg.templateData || {}}
                    onSubmit={(action, data) => {
                      if (onTemplateSubmit) onTemplateSubmit(msg.template!.id, action, data);
                      else message.success(`${msg.template!.name} 已提交`);
                    }}
                    onAction={(action, target) => {
                      if (onTemplateAction) onTemplateAction(msg.template!.id, action, target);
                      else message.info(`操作: ${action}`);
                    }}
                    compact
                  />
                </div>
              )}

              {/* Action button on AI messages */}
              {msg.actionable && onAction && (
                <div style={{ marginTop: 8, borderTop: '1px solid #f0ecff', paddingTop: 8 }}>
                  <Button
                    type="primary" size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={onAction}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  >
                    {msg.actionLabel || '应用结果'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AIAvatar avatar={avatar} color={color} size={28} />
            <div style={{
              padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
              background: '#fff', border: '1px solid #e8dcff',
            }}>
              <Spin size="small" /> <span style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>思考中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #f0f0f0',
        background: '#fff',
      }}>
        {/* Attached files */}
        {files.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {files.map((f, i) => (
              <Tag key={i} closable
                onClose={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                icon={FILE_ICON_MAP[getFileType(f.name)] || FILE_ICON_MAP.text}
                style={{ fontSize: 11 }}>
                {f.name} <span style={{ color: '#999' }}>({(f.size / 1024).toFixed(1)}KB)</span>
              </Tag>
            ))}
          </div>
        )}

        {/* Voice recording indicator */}
        {recording && (
          <div style={{
            marginBottom: 8, padding: '6px 10px', borderRadius: 6,
            background: '#fff2f0', border: '1px solid #ffccc7',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: '#ff4d4f',
          }}>
            <span style={{ animation: 'pulse 1s infinite' }}>●</span>
            正在录音... 点击麦克风停止
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {/* File attachment */}
          <Upload
            multiple
            beforeUpload={(file) => {
              setFiles(prev => [...prev, { name: file.name, size: file.size }]);
              return false;
            }}
            showUploadList={false}
          >
            <Button icon={<PaperClipOutlined />} size="small" type="text"
              style={{ color: '#999' }} title="添加附件" />
          </Upload>

          {/* Template picker */}
          <Popover
            open={tplPickerOpen}
            onOpenChange={setTplPickerOpen}
            trigger="click"
            placement="topLeft"
            overlayStyle={{ zIndex: 1060 }}
            content={
              <TemplatePicker
                onSelect={(tpl) => {
                  useBlockTemplate(tpl.id);
                  if (onTemplateSelect) {
                    onTemplateSelect(tpl);
                  } else {
                    // Default: send as command text
                    onSend(`/template ${tpl.id}`, undefined);
                  }
                  setTplPickerOpen(false);
                }}
              />
            }
          >
            <Button icon={<AppstoreOutlined />} size="small" type="text"
              style={{ color: tplPickerOpen ? '#8b5cf6' : '#999' }} title="插入模板" />
          </Popover>

          {/* Voice input */}
          <Button
            icon={recording ? <AudioMutedOutlined /> : <AudioOutlined />}
            size="small" type="text"
            style={{ color: recording ? '#ff4d4f' : '#999' }}
            onClick={toggleVoice}
            title={recording ? '停止录音' : '语音输入'}
          />

          {/* Text input */}
          <Input.TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={placeholder}
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{ flex: 1, fontSize: 13 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          {/* Send */}
          <Button
            type="primary" icon={<SendOutlined />} size="small"
            onClick={handleSend}
            disabled={loading || (!input.trim() && files.length === 0)}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
          />
        </div>
      </div>
    </div>
  );
}

/** Inline template picker popover content */
function TemplatePicker({ onSelect }: { onSelect: (tpl: BlockTemplate) => void }) {
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    getBlockTemplates(params).then(data => {
      setTemplates(data);
      setLoading(false);
    });
  }, [search]);

  return (
    <div style={{ width: 260 }}>
      <Input
        size="small"
        prefix={<SearchOutlined />}
        placeholder="搜索模板..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 8 }}
      />
      <div style={{ maxHeight: 280, overflow: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 12 }}>无匹配模板</div>
        ) : (
          templates.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => onSelect(tpl)}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 4, transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f0ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 18 }}>{tpl.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tpl.description}
                </div>
              </div>
              <Tag style={{ fontSize: 9, flexShrink: 0 }}>{tpl.blocks.length} 区块</Tag>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
