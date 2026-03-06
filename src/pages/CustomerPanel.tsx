import { useEffect, useState, useMemo } from 'react';
import { Table, Tag, Input, Select, Card, Space, Row, Col, Statistic, Progress, Popover } from 'antd';
import { TeamOutlined, SearchOutlined } from '@ant-design/icons';
import { getCustomers, getTickets, getOrders, type CustomerRow, type TicketListRow, type OrderRow } from '../api';
import { AIAvatar } from '../components/AIAvatar';
import { CustomerHoverCard } from '../components/CustomerHoverCard';
import { useResponsive } from '../hooks/useResponsive';

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

const AI_SUCCESS = { avatar: '😊', color: '#52c41a', name: '客户成功顾问' };

export default function CustomerPanel({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { isMobile } = useResponsive();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    const [c, t, o] = await Promise.all([getCustomers(), getTickets(), getOrders()]);
    setCustomers(c);
    setTickets(t);
    setOrders(o);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const licenseStats = useMemo(() => {
    const counts: Record<string, number> = { enterprise: 0, professional: 0, community: 0 };
    customers.forEach(c => { if (counts[c.license_type] !== undefined) counts[c.license_type]++; });
    return counts;
  }, [customers]);

  const countryOptions = useMemo(() => {
    const set = new Set(customers.map(c => c.country));
    return Array.from(set).sort().map(c => ({ label: `${COUNTRY_FLAGS[c] || ''} ${c}`, value: c }));
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(s) || c.company.toLowerCase().includes(s));
    }
    if (countryFilter) list = list.filter(c => c.country === countryFilter);
    return list;
  }, [customers, search, countryFilter]);

  const columns = [
    {
      title: '客户名称', dataIndex: 'name', key: 'name',
      render: (v: string, record: CustomerRow) => (
        <CustomerHoverCard customerName={v} customers={customers} tickets={tickets} orders={orders}>
          <a onClick={e => { e.stopPropagation(); onOpenCustomer(record.id); }}
            style={{ fontWeight: 500 }}>
            {v}
          </a>
        </CustomerHoverCard>
      ),
    },
    { title: '公司', dataIndex: 'company', key: 'company' },
    {
      title: '地区', dataIndex: 'country', key: 'country',
      render: (v: string) => <span>{COUNTRY_FLAGS[v] || ''} {v}</span>,
    },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '许可证', dataIndex: 'license_type', key: 'license_type',
      render: (v: string) => <Tag color={LICENSE_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '满意度', dataIndex: 'satisfaction_score', key: 'satisfaction_score',
      width: 160,
      render: (v: number) => {
        const riskLevel = v >= 80 ? 'low' : v >= 60 ? 'medium' : 'high';
        const riskLabels = { low: '流失风险低', medium: '需关注', high: '高流失风险' };
        const riskColors = { low: '#52c41a', medium: '#faad14', high: '#f5222d' };
        const suggestions = {
          low: '客户活跃度高，满意度良好。可考虑升级销售或推荐计划。',
          medium: '满意度一般，建议主动跟进近期工单解决情况，安排客户成功经理回访。',
          high: '满意度偏低，存在流失风险。建议优先解决未完成工单，安排高级主管介入沟通。',
        };

        const popoverContent = (
          <div style={{ width: 240, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <AIAvatar avatar={AI_SUCCESS.avatar} color={AI_SUCCESS.color} size={20} />
              <span style={{ fontWeight: 600 }}>{AI_SUCCESS.name}</span>
            </div>
            <div style={{
              padding: '6px 8px', borderRadius: 4, marginBottom: 4,
              background: riskLevel === 'high' ? '#fff1f0' : riskLevel === 'medium' ? '#fff7e6' : '#f6ffed',
              border: `1px solid ${riskColors[riskLevel]}30`,
            }}>
              <Tag color={riskColors[riskLevel]} style={{ margin: '0 4px 0 0' }}>{riskLabels[riskLevel]}</Tag>
              <span style={{ fontWeight: 600, color: scoreColor(v) }}>{v} 分</span>
            </div>
            <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
              {suggestions[riskLevel]}
            </div>
          </div>
        );

        return (
          <Popover content={popoverContent} trigger={isMobile ? 'click' : 'hover'} placement="bottomRight" mouseEnterDelay={isMobile ? 0 : 0.3}>
            <Space size={4} style={{ cursor: 'pointer' }}>
              <Progress
                percent={v} size="small" strokeColor={scoreColor(v)}
                style={{ width: 80, margin: 0 }} format={() => ''}
              />
              <span style={{ color: scoreColor(v), fontWeight: 600, fontSize: 13 }}>{v}</span>
              <AIAvatar avatar={AI_SUCCESS.avatar} color={AI_SUCCESS.color} size={14}
                style={{ opacity: riskLevel === 'low' ? 0.4 : 0.8 }} />
            </Space>
          </Popover>
        );
      },
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <h2 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <TeamOutlined /> 客户管理
      </h2>

      {!isMobile && (
        <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
          悬浮客户名查看 AI 洞察，点击进入客户详情。满意度列悬浮查看 AI 分析。
        </div>
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(['enterprise', 'professional', 'community'] as const).map(type => (
          <Col key={type} span={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic
                title={<Tag color={LICENSE_COLORS[type]}>{type}</Tag>}
                value={licenseStats[type]}
                suffix="家"
                valueStyle={{ fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          placeholder="搜索客户名 / 公司"
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 240, minWidth: 160 }}
        />
        <Select
          placeholder="筛选地区"
          allowClear
          value={countryFilter}
          onChange={v => setCountryFilter(v)}
          options={countryOptions}
          style={{ width: isMobile ? 140 : 180 }}
        />
      </Space>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        columns={columns}
        pagination={false}
        onRow={record => ({
          onClick: () => onOpenCustomer(record.id),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}
