import { getRegionEnglishName } from '@/data/regionCoords';
import { extractRegionEmoji, extractRegionText, cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

type RegionFlagSize = 'sm' | 'md' | 'lg';
type RegionFlagTooltipSide = 'top' | 'right' | 'bottom' | 'left';

export function getRegionDisplayName(region?: string): string {
  if (!region) return '';
  const text = extractRegionText(region);
  if (text) return text;

  const emoji = extractRegionEmoji(region);
  return emoji ? getRegionEnglishName(emoji) : region.trim();
}

/**
 * RegionFlag — compact geographic identity badge.
 *
 * Tooltip is enabled by default because most surfaces only show the flag.
 * Set `showTooltip={false}` when the region name is already visible nearby.
 */
export function RegionFlag({
  region,
  size = 'sm',
  className,
  showTooltip = true,
  tooltipSide = 'bottom',
}: {
  region?: string;
  size?: RegionFlagSize;
  className?: string;
  showTooltip?: boolean;
  tooltipSide?: RegionFlagTooltipSide;
}) {
  if (!region) return null;
  const emoji = extractRegionEmoji(region);
  const text = extractRegionText(region);
  const displayName = getRegionDisplayName(region);

  const ariaLabel = emoji && displayName ? `${emoji} ${displayName}` : emoji || displayName || region;
  const tooltipLabel = showTooltip ? displayName : '';

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
        <span aria-hidden>{text.slice(0, 2)}</span>
      )}
    </span>
  );

  if (!tooltipLabel) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side={tooltipSide} className="text-xs font-mono">
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}
