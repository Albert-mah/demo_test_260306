import { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Input, Select, Drawer, Form,
  Popconfirm, message, Empty, Badge, Tabs,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined,
  SearchOutlined, AppstoreOutlined, EyeOutlined, MessageOutlined,
} from '@ant-design/icons';
import {
  getBlockTemplates, createBlockTemplate, updateBlockTemplate,
  deleteBlockTemplate, type BlockTemplate, type TemplateBlock,
} from '../api';
import { useResponsive } from '../hooks/useResponsive';
import { BlockTemplatePreview } from '../components/BlockTemplatePreview';
import { AIChatModal, type ChatMessage } from '../components/AIChatModal';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  form: { label: '表单', color: 'blue' },
  approval: { label: '审批', color: 'green' },
  report: { label: '报告', color: 'purple' },
  card: { label: '卡片', color: 'cyan' },
  custom: { label: '自定义', color: 'default' },
};

const BLOCK_TYPES = [
  { value: 'text', label: '文本', icon: '📝' },
  { value: 'form', label: '表单', icon: '📋' },
  { value: 'table', label: '表格', icon: '📊' },
  { value: 'stat', label: '统计指标', icon: '📈' },
  { value: 'approval', label: '审批流程', icon: '✅' },
  { value: 'action', label: '操作按钮', icon: '🔘' },
];

export default function BlockTemplateManager() {
  const { isMobile, isTablet } = useResponsive();
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [editDrawer, setEditDrawer] = useState(false);
  const [previewDrawer, setPreviewDrawer] = useState(false);
  const [current, setCurrent] = useState<Partial<BlockTemplate> | null>(null);
  const [previewTpl, setPreviewTpl] = useState<BlockTemplate | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTpl, setChatTpl] = useState<BlockTemplate | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (categoryFilter) params.category = categoryFilter;
    const data = await getBlockTemplates(params);
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, categoryFilter]);

  const handleCreate = () => {
    setCurrent({
      name: '', description: '', category: 'custom',
      icon: '📋', color: '#8b5cf6', blocks: [], tags: [],
    });
    form.resetFields();
    setEditDrawer(true);
  };

  const handleEdit = (tpl: BlockTemplate) => {
    setCurrent(tpl);
    form.setFieldsValue({
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      icon: tpl.icon,
      color: tpl.color,
      tags: tpl.tags,
    });
    setEditDrawer(true);
  };

  const handlePreview = (tpl: BlockTemplate) => {
    setPreviewTpl(tpl);
    setPreviewDrawer(true);
  };

  const handleTryInChat = (tpl: BlockTemplate) => {
    setChatTpl(tpl);
    setChatMessages([
      { role: 'ai', text: `你好！我可以帮你使用「${tpl.name}」。${tpl.description}` },
      { role: 'ai', text: `已加载模板，请在下方填写：`, template: tpl },
    ]);
    setChatOpen(true);
  };

  const handleChatSend = async (text: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setChatMessages(prev => [...prev, {
      role: 'ai', text: '收到！正在处理你的请求...\n\n（Demo 模式 — 实际使用时 AI 会根据输入执行模板对应的操作）',
    }]);
    setChatLoading(false);
  };

  const handleChatTemplateSelect = (tpl: BlockTemplate) => {
    setChatMessages(prev => [...prev, { role: 'user', text: `使用模板: ${tpl.icon} ${tpl.name}` }]);
    setChatLoading(true);
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'ai', text: `已加载「${tpl.name}」模板，请填写以下内容：`, template: tpl,
      }]);
      setChatLoading(false);
    }, 600);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      blocks: current?.blocks || [],
    };
    if (current?.id) {
      await updateBlockTemplate(current.id, data);
      message.success('模板已更新');
    } else {
      await createBlockTemplate(data);
      message.success('模板已创建');
    }
    setEditDrawer(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteBlockTemplate(id);
    message.success('模板已删除');
    load();
  };

  const handleDuplicate = async (tpl: BlockTemplate) => {
    await createBlockTemplate({
      ...tpl,
      id: undefined as unknown as string,
      name: tpl.name + ' (副本)',
      use_count: 0,
    });
    message.success('已复制模板');
    load();
  };

  const addBlock = (type: string) => {
    const newBlock: TemplateBlock = { type: type as TemplateBlock['type'], config: {} };
    if (type === 'text') newBlock.config = { content: '请输入内容...', style: 'normal' };
    if (type === 'form') newBlock.config = { fields: [{ name: 'field1', label: '字段1', type: 'text' }], submit_label: '提交' };
    if (type === 'stat') newBlock.config = { items: [{ label: '指标', value: '0' }] };
    if (type === 'table') newBlock.config = { title: '数据表', columns: ['列1', '列2'], data_source: 'source' };
    if (type === 'approval') newBlock.config = { steps: [{ role: '审批人', status: 'pending' }] };
    if (type === 'action') newBlock.config = { buttons: [{ label: '操作', action: 'click' }] };
    setCurrent(prev => prev ? { ...prev, blocks: [...(prev.blocks || []), newBlock] } : prev);
  };

  const removeBlock = (idx: number) => {
    setCurrent(prev => prev ? { ...prev, blocks: (prev.blocks || []).filter((_, i) => i !== idx) } : prev);
  };

  const columns = [
    {
      title: '模板', dataIndex: 'name', key: 'name',
      render: (v: string, r: BlockTemplate) => (
        <Space size={8}>
          <span style={{ fontSize: 20 }}>{r.icon}</span>
          <div>
            <div style={{ fontWeight: 600 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{r.description}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '类型', dataIndex: 'category', key: 'category', width: 80,
      render: (v: string) => {
        const cfg = CATEGORY_CONFIG[v] || CATEGORY_CONFIG.custom;
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '区块', dataIndex: 'blocks', key: 'blocks', width: 200,
      render: (blocks: TemplateBlock[]) => (
        <Space size={2} wrap>
          {blocks.map((b, i) => {
            const bt = BLOCK_TYPES.find(t => t.value === b.type);
            return <Tag key={i} style={{ fontSize: 11 }}>{bt?.icon} {bt?.label || b.type}</Tag>;
          })}
        </Space>
      ),
    },
    {
      title: '标签', dataIndex: 'tags', key: 'tags', width: 160,
      render: (tags: string[]) => (
        <Space size={2} wrap>
          {tags.map(t => <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>)}
        </Space>
      ),
    },
    {
      title: '使用', dataIndex: 'use_count', key: 'use_count', width: 70,
      sorter: (a: BlockTemplate, b: BlockTemplate) => a.use_count - b.use_count,
      render: (v: number) => <Badge count={v} style={{ background: '#8b5cf6' }} overflowCount={999} />,
    },
    {
      title: '操作', key: 'actions', width: 170,
      render: (_: unknown, r: BlockTemplate) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<MessageOutlined />}
            style={{ color: '#8b5cf6' }}
            onClick={(e) => { e.stopPropagation(); handleTryInChat(r); }}
            title="在对话中试用" />
          <Button size="small" type="text" icon={<EyeOutlined />}
            onClick={(e) => { e.stopPropagation(); handlePreview(r); }} />
          <Button size="small" type="text" icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); handleEdit(r); }} />
          <Button size="small" type="text" icon={<CopyOutlined />}
            onClick={(e) => { e.stopPropagation(); handleDuplicate(r); }} />
          <Popconfirm title="删除此模板？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />}
              onClick={e => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppstoreOutlined /> 区块模板
        </h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
          新建模板
        </Button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        管理可复用的区块模板。AI 可通过模板 ID 在对话中弹出表单、审批、报告等丰富内容，用户也可搜索选择。
      </div>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          placeholder="搜索模板名称 / 描述"
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 240, minWidth: 160 }}
        />
        <Select
          placeholder="筛选类型"
          allowClear
          value={categoryFilter}
          onChange={v => setCategoryFilter(v)}
          options={Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
          style={{ width: isMobile ? 120 : 150 }}
        />
      </Space>

      {templates.length === 0 && !loading ? (
        <Empty description="暂无模板，点击「新建模板」开始创建">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
            新建模板
          </Button>
        </Empty>
      ) : (
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={templates}
          columns={columns}
          pagination={false}
        />
      )}

      {/* Edit Drawer */}
      <Drawer
        title={current?.id ? '编辑模板' : '新建模板'}
        open={editDrawer}
        onClose={() => setEditDrawer(false)}
        width={isMobile ? '100%' : 560}
        extra={
          <Button type="primary" onClick={handleSave}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Form.Item name="icon" label="图标" style={{ width: 80 }}>
              <Input placeholder="📋" maxLength={4} />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true }]} style={{ flex: 1, minWidth: 160 }}>
              <Input placeholder="模板名称" />
            </Form.Item>
            <Form.Item name="category" label="类型" style={{ width: 120 }}>
              <Select options={Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="一句话描述模板用途" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="添加标签" />
          </Form.Item>
          <Form.Item name="color" label="主题色" style={{ width: 120 }}>
            <Input type="color" />
          </Form.Item>
        </Form>

        {/* Block list */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>区块列表 ({(current?.blocks || []).length})</span>
          </div>

          {(current?.blocks || []).map((block, idx) => {
            const bt = BLOCK_TYPES.find(t => t.value === block.type);
            return (
              <Card key={idx} size="small" style={{ marginBottom: 8 }}
                title={
                  <Space size={4}>
                    <span>{bt?.icon}</span>
                    <span style={{ fontSize: 12 }}>{bt?.label || block.type}</span>
                    <Tag style={{ fontSize: 10 }}>#{idx + 1}</Tag>
                  </Space>
                }
                extra={
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => removeBlock(idx)} />
                }
              >
                <pre style={{
                  fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4,
                  maxHeight: 120, overflow: 'auto', margin: 0,
                }}>
                  {JSON.stringify(block.config, null, 2)}
                </pre>
              </Card>
            );
          })}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {BLOCK_TYPES.map(bt => (
              <Button key={bt.value} size="small" onClick={() => addBlock(bt.value)}>
                {bt.icon} {bt.label}
              </Button>
            ))}
          </div>
        </div>
      </Drawer>

      {/* Preview Drawer */}
      <Drawer
        title={previewTpl ? `预览: ${previewTpl.icon} ${previewTpl.name}` : '预览'}
        open={previewDrawer}
        onClose={() => setPreviewDrawer(false)}
        width={isMobile ? '100%' : 480}
      >
        {previewTpl && <BlockTemplatePreview template={previewTpl} />}
      </Drawer>

      {/* Try in chat — demo AI invoking template */}
      <AIChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        avatar={chatTpl?.icon || '🤖'}
        color={chatTpl?.color || '#8b5cf6'}
        name="AI 助手"
        subtitle={chatTpl ? `模板试用: ${chatTpl.name}` : '模板试用'}
        messages={chatMessages}
        loading={chatLoading}
        onSend={handleChatSend}
        onTemplateSelect={handleChatTemplateSelect}
        placeholder="输入消息或选择其他模板..."
      />
    </div>
  );
}
