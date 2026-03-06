/**
 * CustomerHoverCard — hover/tap customer name → mini 360 card
 * Used in TicketList, OrderPanel, etc.
 * Shows: company, country, license, satisfaction, AI insight
 */
import { Popover, Tag, Progress, Space } from 'antd';
import { CustomerServiceOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { AIAvatar } from './AIAvatar';
import { useResponsive } from '../hooks/useResponsive';
import type { CustomerRow, TicketListRow, OrderRow } from '../api';

const LICENSE_COLORS: Record<string, string> = {
  enterprise: 'purple', professional: 'blue', community: 'green',
};

const COUNTRY_FLAGS: Record<string, string> = {
  '德国': '🇩🇪', '日本': '🇯🇵', '中国': '🇨🇳', '英国': '🇬🇧', '美国': '🇺🇸',
};

function scoreColor(score: number) {
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#faad14';
  return '#f5222d';
}

interface Props {
  customerName: string;
  customers: CustomerRow[];
  tickets?: TicketListRow[];
  orders?: OrderRow[];
  children: React.ReactNode;
}

export function CustomerHoverCard({ customerName, customers, tickets = [], orders = [], children }: Props) {
  const { isMobile } = useResponsive();
  const customer = customers.find(c => c.name === customerName);
  if (!customer) return <>{children}</>;

  const custTickets = tickets.filter(t => t.customer_name === customerName);
  const openTickets = custTickets.filter(t => t.status === 'open' || t.status === 'in_progress');
  const custOrders = orders.filter(o => o.customer_id === customer.id);
  const totalAmount = custOrders.reduce((sum, o) => sum + o.amount, 0);

  const content = (
    <div style={{ width: isMobile ? 240 : 280, fontSize: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{customer.name}</div>
          <div style={{ color: '#999', fontSize: 11 }}>
            {COUNTRY_FLAGS[customer.country] || ''} {customer.company}
          </div>
        </div>
        <Tag color={LICENSE_COLORS[customer.license_type]} style={{ margin: 0 }}>
          {customer.license_type}
        </Tag>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 16, padding: '6px 0', marginBottom: 6,
        borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
      }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#999', fontSize: 10 }}><CustomerServiceOutlined /> 工单</div>
          <div style={{ fontWeight: 600 }}>
            {custTickets.length}
            {openTickets.length > 0 && (
              <span style={{ color: '#faad14', fontWeight: 400, marginLeft: 2, fontSize: 10 }}>
                ({openTickets.length}待处理)
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#999', fontSize: 10 }}><ShoppingCartOutlined /> 订单</div>
          <div style={{ fontWeight: 600 }}>
            {custOrders.length}
            {totalAmount > 0 && (
              <span style={{ color: '#666', fontWeight: 400, marginLeft: 2, fontSize: 10 }}>
                (${totalAmount.toLocaleString()})
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#999', fontSize: 10 }}>满意度</div>
          <Space size={4}>
            <Progress
              percent={customer.satisfaction_score}
              size="small"
              strokeColor={scoreColor(customer.satisfaction_score)}
              style={{ width: 40, margin: 0 }}
              format={() => ''}
            />
            <span style={{ fontWeight: 600, color: scoreColor(customer.satisfaction_score) }}>
              {customer.satisfaction_score}
            </span>
          </Space>
        </div>
      </div>

      {/* AI insight from 情报分析师 */}
      {customer.background && (
        <div style={{
          padding: '6px 8px', background: '#e6fffb', borderRadius: 4,
          border: '1px solid #b5f5ec', lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <AIAvatar avatar="🔍" color="#13c2c2" size={14} />
            <span style={{ color: '#13c2c2', fontWeight: 600, fontSize: 10 }}>情报分析师</span>
          </div>
          <div style={{ color: '#333', fontSize: 11 }}>{customer.background}</div>
        </div>
      )}
    </div>
  );

  return (
    <Popover content={content} placement="bottomLeft"
      trigger={isMobile ? 'click' : 'hover'}
      mouseEnterDelay={isMobile ? 0 : 0.3}>
      {children}
    </Popover>
  );
}
