import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { TagColor } from '@/lib/parseTags';

interface TagPillProps {
  label: string;
  color: TagColor | null;
  /** `sm` = NodeCard (text-xs), `xs` = NodeTable / mobile rows (text-xxs). */
  size?: 'sm' | 'xs';
  className?: string;
}

/**
 * Tag chip. When `color` is null we fall back to the neutral muted treatment
 * we've always shown (zero visual change for users who never adopted the
 * `<color>` suffix). When `color` is set we read three CSS custom properties
 * defined per-theme in `src/index.css`, so each theme tunes its own palette
 * — colored pills never break the lumina / deepspace / clean调性.
 */
export function TagPill({ label, color, size = 'sm', className }: TagPillProps) {
  const textSize = size === 'xs' ? 'text-xxs' : 'text-xs';
  const base = 'font-mono px-1.5 py-0.5 rounded-sm shrink-0';

  if (!color) {
    // Default (no <color>) — we deliberately keep the neutral chrome to
    // signal "no semantic emphasis". But the bg/fg are pulled up so the
    // pill carries the same visual weight as a colored sibling and does
    // not look like a downgraded chip when both appear in the same row.
    return (
      <span
        className={cn(
          textSize,
          base,
          'text-foreground/85 bg-muted/70 border border-border/35',
          className,
        )}
      >
        {label}
      </span>
    );
  }

  const style: CSSProperties = {
    backgroundColor: `var(--tag-${color}-bg)`,
    color: `var(--tag-${color}-fg)`,
  };
  return (
    <span className={cn(textSize, base, className)} style={style}>
      {label}
    </span>
  );
}
