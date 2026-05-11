import { MessageSquareText, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Variant = 'public' | 'private';
type Layout = 'block' | 'inline';

interface RemarkNoteProps {
  text?: string | null;
  variant?: Variant;
  /**
   * `block` — full note card with header chip + body, used in side panels & detail header.
   * `inline` — single-line compact form (icon + text), used inside dense cards.
   */
  layout?: Layout;
  className?: string;
}

/**
 * RemarkNote — a clearly-labelled annotation block so users can tell at a glance
 * that the text is a human-written note rather than another data field.
 *
 * - Public remark uses the primary accent.
 * - Private remark uses the warning accent and is gated upstream.
 */
export function RemarkNote({
  text,
  variant = 'public',
  layout = 'block',
  className,
}: RemarkNoteProps) {
  const { t } = useTranslation();
  if (!text) return null;

  const Icon = variant === 'private' ? Lock : MessageSquareText;
  const label = variant === 'private' ? t('label.privateRemark') : t('label.remark');

  const accent =
    variant === 'private'
      ? {
          chipBg: 'bg-warning/10',
          chipText: 'text-warning',
          ring: 'ring-warning/25',
          bar: 'bg-warning/40',
          body: 'text-foreground/75',
          surface: 'bg-warning/5',
        }
      : {
          chipBg: 'bg-primary/10',
          chipText: 'text-primary',
          ring: 'ring-primary/25',
          bar: 'bg-primary/40',
          body: 'text-foreground/80',
          surface: 'bg-primary/5',
        };

  if (layout === 'inline') {
    return (
      <p
        className={cn(
          'flex items-start gap-1.5 text-xs leading-relaxed',
          accent.body,
          className,
        )}
      >
        <Icon
          className={cn('h-3 w-3 mt-0.5 shrink-0', accent.chipText)}
          aria-hidden
        />
        <span className="line-clamp-1" title={text}>
          <span className="sr-only">{label}: </span>
          {text}
        </span>
      </p>
    );
  }

  return (
    <div
      className={cn(
        'relative flex gap-2.5 rounded-md py-1.5 pr-2.5 pl-3',
        accent.surface,
        'ring-1',
        accent.ring,
        className,
      )}
      role="note"
      aria-label={label}
    >
      <span
        className={cn('absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full', accent.bar)}
        aria-hidden
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-xxs font-mono font-bold uppercase tracking-wider',
            accent.chipBg,
            accent.chipText,
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
          <span>{label}</span>
        </div>
        <p className={cn('text-xs leading-relaxed whitespace-pre-line wrap-break-word', accent.body)}>
          {text}
        </p>
      </div>
    </div>
  );
}
