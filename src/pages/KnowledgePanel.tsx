import { useEffect, useState } from 'react';
import { Card, Button, Space, Tag, Empty, message } from 'antd';
import { BookOutlined, FileTextOutlined, CloseOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { getKnowledgeSuggestions, handleKnowledgeSuggestion, type KnowledgeSuggestionRow } from '../api';

export default function KnowledgePanel() {
  const [items, setItems] = useState<KnowledgeSuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setItems(await getKnowledgeSuggestions());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id: string, action: string) => {
    await handleKnowledgeSuggestion(id, action);
    const labels: Record<string, string> = {
      knowledge_base: '已加入知识库', user_manual: '已补充到使用手册', reject: '已否决',
    };
    message.success(labels[action] || '已处理');
    load();
  };

  const pending = items.filter(i => i.status === 'pending');
  const handled = items.filter(i => i.status !== 'pending');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>
          <RobotOutlined style={{ color: '#8b5cf6' }} /> 知识积累建议
        </h2>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        工单解决后，AI 自动分析是否值得积累为知识。每条建议有 3 个操作选项，点击后 AI 自动执行。
      </div>

      {pending.length === 0 && !loading && (
        <Empty description="暂无待处理的知识建议" style={{ margin: '40px 0' }}>
          <div style={{ color: '#999', fontSize: 12 }}>
            将工单标记为"已解决"并填写解决方案后，AI 会自动分析并生成建议
          </div>
        </Empty>
      )}

      {pending.map(item => (
        <Card key={item.id} size="small" style={{ marginBottom: 12, borderLeft: '3px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{item.ticket_summary.slice(0, 60)}...</span>
            <Tag color="purple">{item.category || '未分类'}</Tag>
          </div>
          <div style={{ fontSize: 13, color: '#333', marginBottom: 8, lineHeight: 1.6 }}>
            {item.summary}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            AI 建议: {item.suggested_action === 'knowledge_base' ? '积累到知识库' : '补充到使用手册'}
          </div>
          <Space>
            <Button size="small" type="primary" icon={<BookOutlined />}
              style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
              onClick={() => handleAction(item.id, 'knowledge_base')}>
              积累到知识库
            </Button>
            <Button size="small" icon={<FileTextOutlined />}
              onClick={() => handleAction(item.id, 'user_manual')}>
              补充到使用手册
            </Button>
            <Button size="small" icon={<CloseOutlined />}
              onClick={() => handleAction(item.id, 'reject')}>
              否决
            </Button>
          </Space>
        </Card>
      ))}

      {handled.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, color: '#999' }}>已处理</h3>
          {handled.map(item => (
            <Card key={item.id} size="small" style={{ marginBottom: 8, opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{item.summary.slice(0, 80)}</span>
                <Tag>{item.accepted_action === 'knowledge_base' ? '已入库' :
                  item.accepted_action === 'user_manual' ? '已入手册' : '已否决'}</Tag>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
