import { extractRegionEmoji, extractRegionText, cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

/**
 * RegionFlag — A geographic identity badge.
 *
 * Promotes the country flag emoji from being mixed inside the raw `region`
 * string into a standalone visual anchor (a small circular chip). The chip
 * shows the flag; the tooltip shows the region *name* only so it decodes
 * the flag rather than echoing it.
 *
 * Behavior:
 *  - region = "🇸🇬 Singapore" → flag chip + tooltip "Singapore"
 *  - region = "🇯🇵"            → flag chip + no tooltip (nothing to clarify)
 *  - region = "Tokyo"           → text-only chip + tooltip "Tokyo"
 *  - region = ""                → renders nothing
 *
 * `aria-label` still carries the full "emoji + name" for screen readers.
 *
 * Sizes:
 *  - sm: 16px chip, base emoji — for table/list rows
 *  - md: 20px chip, base emoji — for cards
 *  - lg: 24px chip, lg emoji  — for route header
 */
export function RegionFlag({
  region,
  size = 'sm',
  className,
}: {
  region?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (!region) return null;
  const emoji = extractRegionEmoji(region);
  const text = extractRegionText(region);

  // a11y label: prefer "emoji name" → "emoji" → "text" → raw region
  const ariaLabel = emoji && text ? `${emoji} ${text}` : emoji || text || region;
  // Tooltip label: show only the name. The flag is already visible in the chip,
  // so repeating it would be redundant. If there is *no* textual name to add
  // (e.g. region = "🇯🇵"), suppress the tooltip entirely.
  const tooltipLabel = text || (emoji ? '' : region);

  const dim = size === 'lg' ? 'h-6 min-w-6' : size === 'md' ? 'h-5 min-w-5' : 'h-4 min-w-4';
  const emojiText = size === 'lg' ? 'text-lg leading-none' : 'text-sm leading-none';
  const fallbackText = size === 'lg' ? 'text-xs' : 'text-xxs';

  const chip = (
    <span
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full',
        'bg-muted/40 ring-1 ring-border/40',
        'cursor-default select-none',
        dim,
        emoji ? 'px-0' : `px-1.5 ${fallbackText} font-mono text-muted-foreground/80 uppercase tracking-wider`,
        className,
      )}
    >
      {emoji ? (
        <span className={emojiText} aria-hidden>
          {emoji}
        </span>
      ) : (
        // Fallback: first 2 chars as a "code"
        <span aria-hidden>{text.slice(0, 2)}</span>
      )}
    </span>
  );

  // Emoji-only region → no tooltip (nothing to disambiguate).
  if (!tooltipLabel) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs font-mono">
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}
