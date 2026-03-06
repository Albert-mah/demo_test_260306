import { useEffect, useState } from 'react';
import { Card, Tag, Button, Empty, Space, message } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { getAlerts, updateAlert, type AlertRow } from '../api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red', warning: 'orange', info: 'blue',
};
const TYPE_LABELS: Record<string, string> = {
  satisfaction: '满意度预警', violation: '违规预警',
  high_value: '高价值客户', payment: '支付确认',
};

export default function AlertPanel() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setAlerts(await getAlerts());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDismiss = async (id: string) => {
    await updateAlert(id, 'handled');
    message.success('已处理');
    load();
  };

  const unread = alerts.filter(a => a.status === 'unread');
  const handled = alerts.filter(a => a.status !== 'unread');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>
          <BellOutlined /> 预警中心
          {unread.length > 0 && <Tag color="red" style={{ marginLeft: 8 }}>{unread.length}</Tag>}
        </h2>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        AI 后台分析生成的预警：客户满意度、违规使用、高价值客户、支付确认等。
      </div>

      {unread.length === 0 && !loading && (
        <Empty description="暂无未处理预警" style={{ margin: '40px 0' }} />
      )}

      {unread.map(alert => (
        <Card key={alert.id} size="small" style={{
          marginBottom: 12,
          borderLeft: `3px solid ${alert.severity === 'critical' ? '#ff4d4f' : alert.severity === 'warning' ? '#faad14' : '#1677ff'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Space>
              <Tag color={SEVERITY_COLORS[alert.severity]}>{alert.severity}</Tag>
              <Tag>{TYPE_LABELS[alert.type] || alert.type}</Tag>
              <span style={{ fontWeight: 600 }}>{alert.title}</span>
            </Space>
            <span style={{ color: '#999', fontSize: 12 }}>{alert.created_at}</span>
          </div>
          <div style={{ fontSize: 13, color: '#333', marginBottom: 8, lineHeight: 1.6 }}>
            {alert.detail}
          </div>
          <Button size="small" icon={<CheckOutlined />} onClick={() => handleDismiss(alert.id)}>
            标记已处理
          </Button>
        </Card>
      ))}

      {handled.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, color: '#999' }}>已处理 ({handled.length})</h3>
          {handled.slice(0, 10).map(a => (
            <Card key={a.id} size="small" style={{ marginBottom: 8, opacity: 0.5 }}>
              <Space>
                <Tag>{TYPE_LABELS[a.type] || a.type}</Tag>
                <span>{a.title}</span>
              </Space>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
