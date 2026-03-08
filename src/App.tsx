import { useState } from 'react';
import { ConfigProvider, Layout, Menu, Drawer, Button, theme } from 'antd';
import {
  CustomerServiceOutlined,
  TeamOutlined,
  ShoppingCartOutlined,
  SettingOutlined,
  BulbOutlined,
  BellOutlined,
  BranchesOutlined,
  AppstoreOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import TaskManager from './pages/TaskManager';
import WorkflowEditor from './pages/WorkflowEditor';
import KnowledgePanel from './pages/KnowledgePanel';
import AlertPanel from './pages/AlertPanel';
import CustomerPanel from './pages/CustomerPanel';
import CustomerDetail from './pages/CustomerDetail';
import OrderPanel from './pages/OrderPanel';
import BlockTemplateManager from './pages/BlockTemplateManager';
import { useResponsive } from './hooks/useResponsive';

const { Sider, Content, Header } = Layout;

type Page =
  | { key: 'tickets' }
  | { key: 'ticket-detail'; id: string }
  | { key: 'tasks' }
  | { key: 'workflows' }
  | { key: 'knowledge' }
  | { key: 'alerts' }
  | { key: 'customers' }
  | { key: 'customer-detail'; id: string }
  | { key: 'orders' }
  | { key: 'templates' }
;

export default function App() {
  const [page, setPage] = useState<Page>({ key: 'tickets' });
  const [menuOpen, setMenuOpen] = useState(false);
  const { isMobile } = useResponsive();

  const menuItems = [
    { key: 'tickets', icon: <CustomerServiceOutlined />, label: '工单' },
    { key: 'customers', icon: <TeamOutlined />, label: '客户' },
    { key: 'orders', icon: <ShoppingCartOutlined />, label: '订单' },
    { type: 'divider' as const },
    { key: 'knowledge', icon: <BulbOutlined />, label: '知识建议' },
    { key: 'alerts', icon: <BellOutlined />, label: '预警中心' },
    { type: 'divider' as const },
    { key: 'tasks', icon: <SettingOutlined />, label: 'AI 员工' },
    { key: 'workflows', icon: <BranchesOutlined />, label: '工作流' },
    { key: 'templates', icon: <AppstoreOutlined />, label: '区块模板' },
  ];

  const navigate = (key: string) => {
    setPage({ key } as Page);
    setMenuOpen(false);
  };
  const openTicket = (id: string) => setPage({ key: 'ticket-detail', id });
  const openCustomer = (id: string) => setPage({ key: 'customer-detail', id });

  const renderPage = () => {
    switch (page.key) {
      case 'tickets':
        return <TicketList onOpenTicket={openTicket} />;
      case 'ticket-detail':
        return <TicketDetail ticketId={page.id} onBack={() => navigate('tickets')} />;
      case 'tasks':
        return <TaskManager />;
      case 'workflows':
        return <WorkflowEditor onBack={() => navigate('tasks')} />;
      case 'knowledge':
        return <KnowledgePanel />;
      case 'alerts':
        return <AlertPanel />;
      case 'customers':
        return <CustomerPanel onOpenCustomer={openCustomer} />;
      case 'customer-detail':
        return <CustomerDetail customerId={page.id} onBack={() => navigate('customers')} />;
      case 'orders':
        return <OrderPanel />;
      case 'templates':
        return <BlockTemplateManager />;
      default:
        return <div style={{ padding: 40, color: '#999' }}>"{(page as { key: string }).key}" 页面开发中...</div>;
    }
  };

  const selectedKey = page.key === 'ticket-detail' ? 'tickets' : page.key === 'customer-detail' ? 'customers' : page.key;

  const menuContent = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => navigate(key)}
      style={{ borderRight: 'none' }}
    />
  );

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: '100vh' }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
            <div style={{ padding: '16px 20px', fontWeight: 700, fontSize: 16, borderBottom: '1px solid #f0f0f0' }}>
              AI CRM Demo
            </div>
            {menuContent}
          </Sider>
        )}

        {/* Mobile drawer menu */}
        {isMobile && (
          <Drawer
            placement="left"
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            width={240}
            styles={{ body: { padding: 0 } }}
          >
            <div style={{ padding: '16px 20px', fontWeight: 700, fontSize: 16, borderBottom: '1px solid #f0f0f0' }}>
              AI CRM Demo
            </div>
            {menuContent}
          </Drawer>
        )}

        <Layout>
          <Header style={{
            background: '#fff', padding: isMobile ? '0 12px' : '0 24px',
            height: 48, lineHeight: '48px',
            borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)}
                style={{ marginRight: 8 }} />
            )}
            <span style={{ fontSize: isMobile ? 12 : 14, color: '#666' }}>
              {isMobile ? 'AI CRM Demo' : 'NocoBase AI Integration Demo — Gemini 3 Flash'}
            </span>
          </Header>
          <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
            {renderPage()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
