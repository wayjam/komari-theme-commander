import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, useReducedMotion, type PanInfo } from 'motion/react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeWithStatus } from '@/services/api';
import { cn } from '@/lib/utils';

/**
 * Bottom-sheet wrapper for the Globe view's `Sidebar` (fleet) on phones &
 * portrait tablets. Three goals:
 *
 *   1. Let the 3D globe own the whole viewport; fleet glides up over the
 *      stage instead of cutting it in half.
 *   2. Stay one tap away — a peek bar with the on/offline counts is always
 *      visible. Flick up to expand.
 *   3. Auto-expand to "detail" when the user taps a node marker on the
 *      globe (the parent passes `selectedNodeId`); collapse to peek again
 *      when they back out.
 *
 * The sheet itself is positioned **relative to the GlobeView container**
 * (the parent applies `relative`). We therefore use `absolute` rather than
 * `fixed`, which keeps the sheet inside the dashboard's main-content area
 * (below the sticky header / above the sticky footer) without manual
 * arithmetic. `pb-safe` keeps the home indicator off the content.
 */
interface MobileFleetSheetProps {
  /** Stable list of nodes — used only for the peek-bar counts; the inner
   *  Sidebar gets the same array via children. */
  nodes: NodeWithStatus[];
  /** Currently-selected node UUID; when this transitions from null to a
   *  value we automatically expand the sheet so users see the detail view
   *  they just triggered. */
  selectedNodeId: string | null;
  /** Sidebar (or any other content). The sheet provides the chrome,
   *  scroll container, drag handle and expand state — the body is just
   *  rendered as-is so we can reuse the desktop sidebar verbatim. */
  children: ReactNode;
}

type SheetState = 'peek' | 'open';

// Heights as % of the parent (stage) height. The peek state is just
// enough room for a status pill + handle — large enough to grab, small
// enough that the globe stays the visual focus.
const PEEK_PCT = 8;       // ~6-8% of stage height
const OPEN_PCT = 70;      // 70% — leaves a slice of globe still visible

export function MobileFleetSheet({ nodes, selectedNodeId, children }: MobileFleetSheetProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<SheetState>('peek');
  const lastSelectedRef = useRef<string | null>(null);

  // Auto-expand when a node is selected (typically by tapping the globe
  // marker). Don't auto-collapse when it's cleared — the user might have
  // expanded manually, and pulling the sheet down on them would feel
  // surprising. Manual handle/click controls collapse explicitly.
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== lastSelectedRef.current) {
      setState('open');
    }
    lastSelectedRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const onlineCount = nodes.reduce((acc, n) => acc + (n.status === 'online' ? 1 : 0), 0);
  const offlineCount = nodes.length - onlineCount;

  const toggle = useCallback(() => {
    setState((s) => (s === 'peek' ? 'open' : 'peek'));
  }, []);

  // Vertical drag → snap to the nearest state. We only care about the
  // gesture's final intent (offset.y > 60 = pull down → close, < -60 =
  // pull up → open); intermediate movement is purely visual via the
  // `drag` prop on the motion.div.
  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y < -40 || info.velocity.y < -300) {
      setState('open');
    } else if (info.offset.y > 40 || info.velocity.y > 300) {
      setState('peek');
    }
  }, []);

  const isOpen = state === 'open';

  return (
    <motion.div
      role="dialog"
      aria-label={t('fleet.status')}
      aria-expanded={isOpen}
      // Position: span the bottom of the stage. Width 100% so it tracks
      // the parent's responsive padding via the GlobeView container.
      className={cn(
        'absolute inset-x-0 bottom-0 z-40 lg:hidden',
        'flex flex-col overflow-hidden',
        'border-t border-border/60 bg-card/92 backdrop-blur-md',
        'shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.4)]',
        'rounded-t-2xl pb-safe',
        'commander-corners',
      )}
      // Height drives whether we're peeking or open; framer-motion
      // animates this smoothly. We use percentages of the parent so the
      // sheet adapts to phones in portrait (tall stage) vs landscape.
      animate={{ height: isOpen ? `${OPEN_PCT}%` : `${PEEK_PCT}%` }}
      initial={false}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', damping: 28, stiffness: 280 }
      }
    >
      <span className="corner-bottom" />

      {/* Drag handle + status pills — entire bar is the drag affordance.
          Tapping it toggles state for users who prefer click to flick. */}
      <motion.button
        type="button"
        onClick={toggle}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.15}
        onDragEnd={onDragEnd}
        aria-label={isOpen ? t('action.collapse', 'Collapse fleet panel') : t('action.expand', 'Expand fleet panel')}
        className={cn(
          'shrink-0 flex flex-col items-center gap-1 px-3 py-2',
          'cursor-grab active:cursor-grabbing select-none',
          'touch-none', // tells the browser we own the vertical pan
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
        )}
      >
        {/* Grip — wider hit area than the visual line */}
        <span
          className="block h-1 w-10 rounded-full bg-muted-foreground/40"
          aria-hidden
        />

        {/* Compact status row — visible only while peeking. The embedded
            Sidebar already shows its own (richer) status row when open,
            so duplicating it here would stack two near-identical headers. */}
        {!isOpen && (
          <div className="flex items-center justify-between w-full text-xxs font-mono">
            <span className="font-display font-bold uppercase tracking-wider text-muted-foreground/85">
              {t('fleet.status')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-success">
                <span className="font-metric tabular-nums">{onlineCount}</span> {t('status.on')}
              </span>
              <span className="text-muted-foreground/40" aria-hidden>|</span>
              <span className="text-destructive">
                <span className="font-metric tabular-nums">{offlineCount}</span> {t('status.off')}
              </span>
              <span className="text-muted-foreground/40" aria-hidden>·</span>
              <ChevronUp className="h-3 w-3 text-primary/80 motion-safe:animate-pulse" aria-hidden />
            </div>
          </div>
        )}
        {/* When open the chevron sits alone, right-aligned, as a hint
            that tapping the handle (or pulling down) collapses the sheet. */}
        {isOpen && (
          <div className="flex items-center justify-end w-full text-xxs">
            <ChevronDown className="h-3 w-3 text-muted-foreground/60" aria-hidden />
          </div>
        )}
      </motion.button>

      {/* Sidebar body — gets a real scroll container only when open so the
          peek state doesn't accidentally allow scrolling content that is
          mostly clipped. We also disable pointer events while peeking to
          prevent accidental taps from registering on hidden rows. */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-hidden',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none opacity-0 invisible',
        )}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </motion.div>
  );
}
