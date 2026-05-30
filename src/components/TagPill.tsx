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
 * Tag chip. All tags share the same pill chrome; tags without a `<color>`
 * suffix use the theme-tuned neutral gray palette from `src/index.css`.
 */
export function TagPill({ label, color, size = 'sm', className }: TagPillProps) {
  const textSize = size === 'xs' ? 'text-xxs' : 'text-xs';
  const base = 'font-mono px-1.5 py-0.5 rounded-sm shrink-0';
  const palette = color ?? 'gray';
  const style: CSSProperties = {
    backgroundColor: `var(--tag-${palette}-bg)`,
    color: `var(--tag-${palette}-fg)`,
  };

  return (
    <span className={cn(textSize, base, !color && 'tag-pill-neutral', className)} style={style}>
      {label}
    </span>
  );
}
