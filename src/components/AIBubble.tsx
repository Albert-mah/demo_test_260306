import { useState } from 'react';
import { Popover, Button, Space, Timeline, Tag } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { getAuditLogs, updateResultStatus, type AIResultRow, type AuditLogRow } from '../api';

/**
 * AI 悬浮气泡 — 鼠标移上去才显示图标，hover 弹出详情
 * 需要父容器设置 position: relative 和 class="ai-bubble-anchor"
 */
export function AIBubble({
  result,
  onStatusChange,
}: {
  result: AIResultRow;
  onStatusChange?: () => void;
}) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const loadLogs = async () => {
    if (!showLogs) {
      setLogs(await getAuditLogs(result.id));
    }
    setShowLogs(!showLogs);
  };

  const handleStatus = async (status: string) => {
    await updateResultStatus(result.id, status);
    onStatusChange?.();
  };

  const content = (
    <div style={{ width: 280, fontSize: 12 }}>
      {/* Metadata */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <Tag color="purple">{result.action}</Tag>
          <Tag>{result.model}</Tag>
        </div>
        <div style={{ color: '#999', display: 'flex', gap: 12 }}>
          <span>置信度 {result.confidence}%</span>
          <span>{result.tokens_used} tokens</span>
          <span>{result.duration_ms}ms</span>
        </div>
      </div>

      {/* Status actions */}
      {result.status === 'pending' && (
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button size="small" type="primary" onClick={() => handleStatus('applied')}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              采纳
            </Button>
            <Button size="small" danger onClick={() => handleStatus('rejected')}>
              拒绝
            </Button>
            <Button size="small" onClick={() => handleStatus('modified')}>
              修改后采纳
            </Button>
          </Space>
        </div>
      )}

      {result.status !== 'pending' && (
        <div style={{ marginBottom: 8 }}>
          <Tag color={result.status === 'applied' ? 'green' : result.status === 'rejected' ? 'red' : 'orange'}>
            {result.status === 'applied' ? '已采纳' : result.status === 'rejected' ? '已拒绝' : '已修改采纳'}
          </Tag>
          {result.applied_by && <span style={{ color: '#999' }}> by {result.applied_by}</span>}
        </div>
      )}

      {/* Audit trail toggle */}
      <div>
        <Button type="link" size="small" onClick={loadLogs} style={{ padding: 0, fontSize: 12 }}>
          {showLogs ? '收起审计记录' : '查看审计记录'}
        </Button>
        {showLogs && logs.length > 0 && (
          <Timeline style={{ marginTop: 8, marginBottom: 0 }}
            items={logs.map(log => ({
              color: log.action === 'applied' ? 'green' : log.action === 'rejected' ? 'red' : 'blue',
              children: (
                <div style={{ fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>{log.action}</span> · {log.user_name}
                  <br />{log.detail}
                  <br /><span style={{ color: '#bbb' }}>{log.created_at}</span>
                </div>
              ),
            }))} />
        )}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      title={<><RobotOutlined style={{ color: '#8b5cf6' }} /> {result.task_name}</>}
      trigger="hover"
      placement="rightTop"
      mouseEnterDelay={0.3}
    >
      <RobotOutlined className="ai-bubble-icon" style={{
        position: 'absolute', right: 8, top: 8,
        color: '#8b5cf6', cursor: 'pointer', fontSize: 14,
        opacity: 0, transition: 'opacity 0.2s',
      }} />
    </Popover>
  );
}
