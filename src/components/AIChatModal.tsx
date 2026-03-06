/**
 * AIChatModal — Unified rich chat modal for AI conversations
 *
 * Features:
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
import { useState, useRef, useEffect } from 'react';
import { Input, Button, Upload, Tag, Space, Spin, message } from 'antd';
import {
  SendOutlined, PaperClipOutlined, AudioOutlined, AudioMutedOutlined,
  CheckCircleOutlined, CloseOutlined,
  FileImageOutlined, FilePdfOutlined, FileExcelOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { AIAvatar } from './AIAvatar';

const FILE_ICON_MAP: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  image: <FileImageOutlined style={{ color: '#1677ff' }} />,
  excel: <FileExcelOutlined style={{ color: '#52c41a' }} />,
  text: <FileTextOutlined style={{ color: '#999' }} />,
};

function getFileType(name: string): string {
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

  // Optional
  placeholder?: string;
  context?: string;
  width?: number;
}

export function AIChatModal({
  open, onClose,
  avatar, color, name, subtitle,
  messages, loading,
  onSend, onAction,
  placeholder = '输入消息，可追加附件或语音...',
  context,
  width = 560,
}: AIChatModalProps) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      right: width + 20,  // float to the left of the drawer
      top: 80,
      width: 380,
      maxHeight: 'calc(100vh - 120px)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(139,92,246,0.18), 0 2px 8px rgba(0,0,0,0.08)',
      background: '#fff',
      zIndex: 1050,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      border: '1px solid #e8dcff',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'linear-gradient(135deg, #faf8ff, #f0ecff)',
        borderBottom: '1px solid #e8dcff',
        flexShrink: 0,
      }}>
        <AIAvatar avatar={avatar} color={color} size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
          {subtitle && <div style={{ fontSize: 11, color: '#999' }}>{subtitle}</div>}
        </div>
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
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

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
