/**
 * AI Employee Avatar — single avatar circle
 */
export function AIAvatar({
  avatar = '🤖',
  color = '#8b5cf6',
  size = 28,
  style,
}: {
  avatar?: string;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: color, fontSize: size * 0.5,
      border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      flexShrink: 0,
      ...style,
    }}>
      {avatar}
    </span>
  );
}

/**
 * Fused team avatar — multiple emojis merged into one circle
 * Used for collaborative mode: single AI call with merged prompt
 * Visual: gradient background from member colors, emojis packed inside
 */
export function AIFusedAvatar({
  members,
  size = 28,
}: {
  members: { avatar?: string; color?: string }[];
  size?: number;
}) {
  if (members.length === 0) return null;
  if (members.length === 1) {
    return <AIAvatar avatar={members[0].avatar} color={members[0].color} size={size} />;
  }

  // Create gradient from member colors
  const colors = members.map(m => m.color || '#8b5cf6');
  const gradient = colors.length === 2
    ? `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`
    : `conic-gradient(${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`;

  const emojiSize = members.length <= 2 ? size * 0.35 : members.length <= 4 ? size * 0.28 : size * 0.22;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: gradient,
      border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      {/* Inner ring overlay for depth */}
      <span style={{
        position: 'absolute', inset: 2, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
      }} />
      {/* Packed emojis */}
      <span style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
        gap: 0, lineHeight: 1, position: 'relative', zIndex: 1,
      }}>
        {members.slice(0, 4).map((m, i) => (
          <span key={i} style={{ fontSize: emojiSize, lineHeight: 1 }}>{m.avatar}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * Parallel team avatars — separate circles in a row (not overlapping)
 * Used for parallel mode: independent calls, separate results
 */
export function AIParallelAvatars({
  members,
  size = 28,
  max = 5,
}: {
  members: { avatar?: string; color?: string }[];
  size?: number;
  max?: number;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - max;

  if (members.length === 1) {
    return <AIAvatar avatar={shown[0].avatar} color={shown[0].color} size={size} />;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {shown.map((m, i) => (
        <AIAvatar key={i} avatar={m.avatar} color={m.color} size={size} />
      ))}
      {overflow > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%',
          background: '#f0f0f0', color: '#999', fontSize: 10, fontWeight: 600,
          border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>+{overflow}</span>
      )}
    </span>
  );
}

/**
 * Team avatars — auto-selects fused or parallel based on mode
 * Also supports legacy stacked display (default when no mode specified)
 */
export function AITeamAvatars({
  members,
  size = 28,
  max = 4,
  mode,
}: {
  members: { avatar?: string; color?: string; name?: string }[];
  size?: number;
  max?: number;
  mode?: 'collaborative' | 'parallel';
}) {
  if (members.length === 0) return null;
  if (members.length === 1) {
    return <AIAvatar avatar={members[0].avatar} color={members[0].color} size={size} />;
  }

  // Mode-specific rendering
  if (mode === 'collaborative') {
    return <AIFusedAvatar members={members} size={size} />;
  }
  if (mode === 'parallel') {
    return <AIParallelAvatars members={members} size={size} max={max} />;
  }

  // Default: stacked overlapping (backwards compatible)
  const shown = members.slice(0, max);
  const overflow = members.length - max;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <AIAvatar
          key={i}
          avatar={m.avatar}
          color={m.color}
          size={size}
          style={{ marginLeft: i > 0 ? -(size * 0.3) : 0, zIndex: shown.length - i }}
        />
      ))}
      {overflow > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%',
          background: '#f0f0f0', color: '#999', fontSize: 11, fontWeight: 600,
          border: '2px solid #fff', marginLeft: -(size * 0.3),
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>
          +{overflow}
        </span>
      )}
    </span>
  );
}
