import { RobotOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

/**
 * AI 填充字段的视觉标记
 * - 紫色左边框 + 浅紫色背景 = 一眼分辨 AI 填的 vs 手动填的
 * - inline 模式用于 Tag 内嵌
 */
export function AIFieldBadge({
  children,
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <RobotOutlined style={{ color: '#8b5cf6', fontSize: 11 }} />
        {children}
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#faf8ff', borderLeft: '3px solid #8b5cf6',
      padding: '2px 8px', borderRadius: '0 4px 4px 0',
      fontSize: 13,
    }}>
      <RobotOutlined style={{ color: '#8b5cf6', fontSize: 11 }} />
      {children}
    </span>
  );
}
