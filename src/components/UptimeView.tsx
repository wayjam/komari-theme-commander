import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDown01,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { RegionFlag } from './RegionFlag';
import { apiService } from '@/services/api';
import type { NodeWithStatus } from '@/services/api';
import { cn } from '@/lib/utils';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  computeUptime,
  mergeRecords,
  buildUptimeRanges,
  type UptimeResult,
  type UptimeSlot,
  type LoadRecord,
} from '@/lib/uptime-utils';

/* ──────────────────────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────────────────────── */
/** SLO threshold — only used to color the avg pillar / row %. */
const SLO_THRESHOLD = 99.9;

/** After this long since individual node fetch, do incremental refresh */
const NODE_REFRESH_INTERVAL = 2 * 60_000;

/** Stagger initial fetches to avoid network burst */
const FETCH_STAGGER_MS = 35;

/* ──────────────────────────────────────────────────────────────
   Date helpers
   ────────────────────────────────────────────────────────────── */
function formatAxisDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
}

function formatTooltipDate(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/* ──────────────────────────────────────────────────────────────
   Shared IntersectionObserver — one observer for all rows
   (was: N observers, one per row — wasteful at scale)
   ────────────────────────────────────────────────────────────── */
type VisibilityCb = (visible: boolean) => void;
const visibilityCallbacks = new WeakMap<Element, VisibilityCb>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const cb = visibilityCallbacks.get(entry.target);
        if (cb) cb(entry.isIntersecting);
      }
    },
    { rootMargin: '400px' },
  );
  return sharedObserver;
}

function useLazyVisible() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = getSharedObserver();
    const cb: VisibilityCb = (visible) => {
      if (visible) {
        setIsVisible(true);
        observer.unobserve(el);
        visibilityCallbacks.delete(el);
      }
    };
    visibilityCallbacks.set(el, cb);
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      visibilityCallbacks.delete(el);
    };
  }, []);

  return { ref, isVisible };
}

/* ──────────────────────────────────────────────────────────────
   Uptime Bar — slot list memoized; hover state lifted to a ref-less
   single tooltip overlay so hovering one slot does NOT re-render the
   other N-1 slots.
   ────────────────────────────────────────────────────────────── */
interface UptimeBarProps {
  slots: UptimeSlot[];
}

const UptimeBar = memo(function UptimeBar({ slots }: UptimeBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ idx: number; left: number } | null>(null);

  // Render slot DOM only once per `slots` reference. Hover effects are pure CSS
  // (group-hover dimming), avoiding React re-renders on mouse move.
  const slotEls = useMemo(
    () => (
      <>
        {/* Incident tick row */}
        <div
          className="absolute -top-[3px] left-0 right-0 flex gap-[1px] h-[2px] pointer-events-none"
          aria-hidden
        >
          {slots.map((slot, i) => (
            <div
              key={i}
              className={cn('flex-1 min-w-[2px]', slot.status === 'offline' && 'bg-destructive')}
            />
          ))}
        </div>
        <div className="uptime-bar flex gap-[1px] h-6 rounded overflow-hidden">
          {slots.map((slot, i) => (
            <div
              key={i}
              data-idx={i}
              data-status={slot.status}
              role="img"
              aria-label={`${formatTooltipDate(slot.start)} ${slot.status}`}
              className={cn(
                'uptime-slot flex-1 min-w-[2px]',
                slot.status === 'online' && 'uptime-bar-online',
                slot.status === 'offline' && 'bg-destructive',
                slot.status === 'unknown' && 'bg-muted/30',
              )}
            />
          ))}
        </div>
      </>
    ),
    [slots],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('uptime-slot')) {
      setTooltip(null);
      return;
    }
    const idxStr = target.dataset.idx;
    if (idxStr === undefined) return;
    const idx = Number(idxStr);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const slotRect = target.getBoundingClientRect();
    const center = slotRect.left + slotRect.width / 2 - rect.left;
    setTooltip((prev) =>
      prev && prev.idx === idx && Math.abs(prev.left - center) < 0.5
        ? prev
        : { idx, left: center },
    );
  }, []);

  const onMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {slotEls}
      {tooltip && slots[tooltip.idx] && (
        <div
          className="absolute -top-9 z-10 px-2 py-1 rounded border border-border bg-popover text-xxs font-mono text-popover-foreground whitespace-nowrap pointer-events-none shadow-lg"
          style={{ left: tooltip.left, transform: 'translateX(-50%)' }}
        >
          {formatTooltipDate(slots[tooltip.idx].start)} — {slots[tooltip.idx].status.toUpperCase()}
        </div>
      )}
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────
   Single node row — list-row treatment
   ────────────────────────────────────────────────────────────── */
interface NodeRowProps {
  node: NodeWithStatus;
  uptime: UptimeResult | null;
  loading: boolean;
  onNavigate: (uuid: string) => void;
}

const NodeRow = memo(function NodeRow({ node, uptime, loading, onNavigate }: NodeRowProps) {
  const { t } = useTranslation();
  const isOnline = node.status === 'online';
  const pct = uptime?.uptimePercent ?? null;
  const incidents = uptime?.offlineSlots ?? 0;

  const pctTone =
    pct === null
      ? 'text-muted-foreground'
      : pct >= SLO_THRESHOLD
      ? 'text-success uptime-accent-soft'
      : pct >= 95
      ? 'text-warning'
      : 'text-destructive';

  const handleClick = useCallback(() => onNavigate(node.uuid), [onNavigate, node.uuid]);

  return (
    <div
      className="uptime-row group relative px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              isOnline ? 'uptime-status-dot bg-success' : 'bg-destructive',
            )}
          />
          <RegionFlag region={node.region} size="sm" />
          <span className="text-sm font-display font-bold truncate group-hover:text-primary transition-colors">
            {node.name}
          </span>
          {node.group && (
            <span className="text-[10px] font-mono text-primary/80 bg-primary/10 px-1 rounded">
              [{node.group}]
            </span>
          )}

          <span className="ml-auto flex items-center gap-2">
            {incidents > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-metric font-bold text-destructive bg-destructive/10 border border-destructive/30 px-1.5 py-0.5 rounded">
                <AlertTriangle className="h-3 w-3" />
                {t('uptime.downSlots', { count: incidents })}
              </span>
            )}
            {loading && !uptime ? (
              <HudSpinner size="sm" className="text-muted-foreground" />
            ) : pct !== null ? (
              <span className={cn('text-sm font-metric font-bold tabular-nums', pctTone)}>
                {pct.toFixed(2)}%
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground">—</span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
          </span>
        </div>

        <div className="relative pt-[3px]">
          {uptime ? (
            <UptimeBar slots={uptime.slots} />
          ) : loading ? (
            <div className="h-6 rounded bg-muted/15 border border-border/20" />
          ) : (
            <div className="h-6 rounded bg-muted/10 flex items-center justify-center border border-dashed border-border/40">
              <span className="text-xs text-muted-foreground">{t('uptime.noData')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────
   Module-level incremental cache
   ────────────────────────────────────────────────────────────── */
interface NodeCache {
  records: LoadRecord[];
  result: UptimeResult;
  fetchedAt: number;
}

interface IncrementalCache {
  nodes: Map<string, NodeCache>;
  rangeHours: number;
}

let _cache: IncrementalCache | null = null;

/* ──────────────────────────────────────────────────────────────
   Concurrency limiter — cap parallel fetches to N (avoid 50+ in flight)
   ────────────────────────────────────────────────────────────── */
const FETCH_CONCURRENCY = 6;
let _activeFetches = 0;
const _fetchQueue: Array<() => void> = [];

function acquireFetchSlot(): Promise<void> {
  if (_activeFetches < FETCH_CONCURRENCY) {
    _activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    _fetchQueue.push(() => {
      _activeFetches++;
      resolve();
    });
  });
}

function releaseFetchSlot() {
  _activeFetches--;
  const next = _fetchQueue.shift();
  if (next) next();
}

/* ──────────────────────────────────────────────────────────────
   LazyNodeRow — fetches data only when scrolled into view
   ────────────────────────────────────────────────────────────── */
interface LazyNodeRowProps {
  node: NodeWithStatus;
  rangeHours: number;
  onNavigate: (uuid: string) => void;
  onResult: (uuid: string, result: UptimeResult) => void;
  forceKey: number;
  /** Index used for tiny initial-fetch stagger */
  indexHint: number;
}

const LazyNodeRow = memo(function LazyNodeRow({
  node,
  rangeHours,
  onNavigate,
  onResult,
  forceKey,
  indexHint,
}: LazyNodeRowProps) {
  const { ref, isVisible } = useLazyVisible();
  const [uptime, setUptime] = useState<UptimeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const lastForceKey = useRef(forceKey);

  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Hydrate from cache synchronously on mount/range change
  useEffect(() => {
    if (_cache && _cache.rangeHours === rangeHours) {
      const cached = _cache.nodes.get(node.uuid);
      if (cached) {
        setUptime(cached.result);
        onResultRef.current(node.uuid, cached.result);
        fetchedRef.current = true;
        return;
      }
    }
    // range changed and no cache → reset local state
    setUptime(null);
    fetchedRef.current = false;
  }, [node.uuid, rangeHours]);

  useEffect(() => {
    const isForceRefresh = forceKey !== lastForceKey.current;
    lastForceKey.current = forceKey;

    if (!isVisible && !isForceRefresh) return;
    if (fetchedRef.current && !isForceRefresh) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const doFetch = async () => {
      if (!_cache || _cache.rangeHours !== rangeHours) {
        _cache = { nodes: new Map(), rangeHours };
      }

      const cached = _cache.nodes.get(node.uuid);
      const isIncremental =
        cached && !isForceRefresh && Date.now() - cached.fetchedAt < 30 * 60_000;

      await acquireFetchSlot();
      if (cancelled) {
        releaseFetchSlot();
        return;
      }

      setLoading(true);
      try {
        let fetchHours = rangeHours;
        if (isIncremental) {
          const deltaMs = Date.now() - cached!.fetchedAt;
          fetchHours = Math.ceil(deltaMs / 3600_000) + 1;
        }

        const data = await apiService.getLoadHistory(node.uuid, fetchHours);
        if (cancelled) return;

        const newRecords = (data?.records ?? []) as unknown as LoadRecord[];
        const finalRecords =
          isIncremental && cached
            ? mergeRecords(cached.records, newRecords, rangeHours)
            : newRecords;

        const result = computeUptime(finalRecords, rangeHours);

        _cache!.nodes.set(node.uuid, {
          records: finalRecords,
          result,
          fetchedAt: Date.now(),
        });

        setUptime(result);
        onResultRef.current(node.uuid, result);
        fetchedRef.current = true;
      } catch {
        if (!cancelled && cached) setUptime(cached.result);
      } finally {
        releaseFetchSlot();
        if (!cancelled) setLoading(false);
      }
    };

    // Stagger initial fetches a touch to spread network load smoothly
    const delay = !fetchedRef.current ? Math.min(indexHint * FETCH_STAGGER_MS, 500) : 0;
    if (delay > 0) {
      timeoutId = setTimeout(doFetch, delay);
    } else {
      doFetch();
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isVisible, forceKey, node.uuid, rangeHours, indexHint]);

  // Background incremental refresh
  useEffect(() => {
    if (!isVisible || !fetchedRef.current) return;
    const timer = setInterval(async () => {
      if (!_cache || _cache.rangeHours !== rangeHours) return;
      const cached = _cache.nodes.get(node.uuid);
      if (!cached || Date.now() - cached.fetchedAt < NODE_REFRESH_INTERVAL) return;

      await acquireFetchSlot();
      try {
        const deltaMs = Date.now() - cached.fetchedAt;
        const deltaHours = Math.ceil(deltaMs / 3600_000) + 1;
        const data = await apiService.getLoadHistory(node.uuid, deltaHours);
        const newRecords = (data?.records ?? []) as unknown as LoadRecord[];
        const merged = mergeRecords(cached.records, newRecords, rangeHours);
        const result = computeUptime(merged, rangeHours);

        _cache!.nodes.set(node.uuid, {
          records: merged,
          result,
          fetchedAt: Date.now(),
        });

        setUptime(result);
        onResultRef.current(node.uuid, result);
      } catch {
        /* ignore */
      } finally {
        releaseFetchSlot();
      }
    }, NODE_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [isVisible, node.uuid, rangeHours]);

  return (
    <div ref={ref}>
      <NodeRow node={node} uptime={uptime} loading={loading} onNavigate={onNavigate} />
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   UptimeView — main exported component
   ══════════════════════════════════════════════════════════════ */
interface UptimeViewProps {
  nodes: NodeWithStatus[];
}

type SortMode = 'weight' | 'uptime';

export function UptimeView({ nodes }: UptimeViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recordPreserveTime } = useAppConfig();

  const uptimeRanges = useMemo(
    () => buildUptimeRanges(recordPreserveTime),
    [recordPreserveTime],
  );

  const [rangeIdx, setRangeIdx] = useState(0);
  const range = uptimeRanges[Math.min(rangeIdx, uptimeRanges.length - 1)];

  const [forceKey, setForceKey] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>('weight');

  /* ─── Batched result map ──────────────────────────────────────
     LazyNodeRow children call onResult; we accumulate in a ref and
     flush once per animation frame to avoid N state-updates → N
     parent re-renders during initial load. */
  const [resultMap, setResultMap] = useState<Map<string, UptimeResult>>(new Map());
  const pendingResultsRef = useRef<Map<string, UptimeResult>>(new Map());
  const flushScheduledRef = useRef(false);

  const handleResult = useCallback((uuid: string, result: UptimeResult) => {
    pendingResultsRef.current.set(uuid, result);
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(() => {
      flushScheduledRef.current = false;
      const pending = pendingResultsRef.current;
      if (pending.size === 0) return;
      pendingResultsRef.current = new Map();
      setResultMap((prev) => {
        const next = new Map(prev);
        pending.forEach((v, k) => next.set(k, v));
        return next;
      });
    });
  }, []);

  // Reset on range change
  useEffect(() => {
    pendingResultsRef.current.clear();
    setResultMap(new Map());
  }, [range.hours]);

  // Stable navigation handler reference
  const handleNavigate = useCallback((uuid: string) => navigate(`/node/${uuid}`), [navigate]);

  // Stable node uuid list — only changes when nodes are truly added/removed
  const nodeUuidKey = useMemo(() => nodes.map((n) => n.uuid).sort().join(','), [nodes]);

  const baseSortedNodes = useMemo(
    () => [...nodes].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeUuidKey],
  );

  // Apply optional sort by uptime
  const visibleList = useMemo(() => {
    if (sortMode === 'weight') return baseSortedNodes;
    return [...baseSortedNodes].sort((a, b) => {
      const ap = resultMap.get(a.uuid)?.uptimePercent ?? 101;
      const bp = resultMap.get(b.uuid)?.uptimePercent ?? 101;
      return ap - bp;
    });
  }, [baseSortedNodes, resultMap, sortMode]);

  // Aggregate metrics
  const totalCount = nodes.length;
  const onlineCount = useMemo(
    () => nodes.filter((n) => n.status === 'online').length,
    [nodes],
  );
  const loadedCount = resultMap.size;
  const isLoading = loadedCount === 0 && baseSortedNodes.length > 0;
  const loadProgress =
    baseSortedNodes.length > 0 ? loadedCount / baseSortedNodes.length : 1;

  const { avgUptime, totalIncidents } = useMemo(() => {
    if (resultMap.size === 0) return { avgUptime: null as number | null, totalIncidents: 0 };
    let sum = 0;
    let inc = 0;
    resultMap.forEach((v) => {
      sum += v.uptimePercent;
      inc += v.offlineSlots;
    });
    return { avgUptime: sum / resultMap.size, totalIncidents: inc };
  }, [resultMap]);

  const sloMet = avgUptime !== null && avgUptime >= SLO_THRESHOLD;

  const handleRefresh = useCallback(() => {
    _cache = null;
    pendingResultsRef.current.clear();
    setResultMap(new Map());
    setForceKey((k) => k + 1);
  }, []);

  // Time-axis ticks — recomputed only when range changes
  const axisTicks = useMemo(() => {
    const now = Date.now();
    const rangeMs = range.hours * 3600_000;
    return [
      { label: formatAxisDate(now - rangeMs) },
      { label: t('uptime.axisQuarter') },
      { label: t('uptime.axisHalf') },
      { label: t('uptime.axisThreeQuarter') },
      { label: t('time.now') },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.hours, t]);

  return (
    <div className="space-y-4 sm:space-y-5 uptime-view">
      {/* ═══ Status strip — single source of truth for KPIs ═══ */}
      <div className="uptime-status-strip relative rounded-lg border border-border/60 bg-card/70 backdrop-blur-xl overflow-hidden">
        {/* Loading progress sliver */}
        {loadProgress < 1 && baseSortedNodes.length > 0 && (
          <div
            className="absolute top-0 left-0 h-[2px] bg-primary/70 transition-[width] duration-500 ease-out"
            style={{ width: `${loadProgress * 100}%` }}
            aria-hidden
          />
        )}

        <div className="flex flex-col lg:flex-row lg:items-stretch divide-y lg:divide-y-0 lg:divide-x divide-border/40">
          {/* Pillar 1 — SLO verdict */}
          <div className="flex items-center gap-3 px-4 py-3 lg:py-4 lg:flex-[1.4]">
            <div
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0',
                isLoading
                  ? 'bg-muted/30 text-muted-foreground'
                  : sloMet
                  ? 'bg-success/12 text-success uptime-accent-soft'
                  : avgUptime === null
                  ? 'bg-muted/30 text-muted-foreground'
                  : 'bg-warning/12 text-warning',
              )}
            >
              {isLoading ? (
                <HudSpinner size="sm" />
              ) : sloMet ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : avgUptime === null ? (
                <Activity className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {t('uptime.slo')}
                </span>
                <span className="text-[10px] font-metric text-muted-foreground tabular-nums">
                  ≥ {SLO_THRESHOLD}%
                </span>
              </div>
              <div
                className={cn(
                  'text-sm font-display font-bold leading-tight truncate',
                  isLoading
                    ? 'text-muted-foreground'
                    : sloMet
                    ? 'text-success uptime-accent-soft'
                    : avgUptime === null
                    ? 'text-muted-foreground'
                    : 'text-warning',
                )}
              >
                {isLoading
                  ? t('uptime.loading')
                  : sloMet
                  ? t('uptime.allSystemsOperational')
                  : avgUptime === null
                  ? t('uptime.noDataAvailable')
                  : t('uptime.degradedPerformance')}
              </div>
            </div>
          </div>

          {/* Pillar 2 — avg uptime % */}
          <div className="flex items-center gap-3 px-4 py-3 lg:flex-1">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {t('label.avg')} · {range.label}
              </span>
              <span
                className={cn(
                  'text-2xl font-metric font-bold leading-none mt-0.5 tabular-nums',
                  avgUptime === null
                    ? 'text-muted-foreground'
                    : avgUptime >= SLO_THRESHOLD
                    ? 'text-success uptime-accent-soft'
                    : avgUptime >= 95
                    ? 'text-warning'
                    : 'text-destructive',
                )}
              >
                {avgUptime !== null ? avgUptime.toFixed(2) : '—'}
                <span className="text-sm ml-0.5 opacity-60">%</span>
              </span>
            </div>
          </div>

          {/* Pillar 3 — fleet status counts */}
          <div className="flex items-center gap-4 px-4 py-3 lg:flex-1">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {t('label.nodes')}
              </span>
              <span className="text-sm font-metric font-bold tabular-nums mt-0.5">
                <span className="text-success uptime-accent-soft">{onlineCount}</span>
                <span className="text-muted-foreground">/{totalCount}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {t('uptime.incidents')}
              </span>
              <span
                className={cn(
                  'text-sm font-metric font-bold tabular-nums mt-0.5',
                  totalIncidents > 0 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {totalIncidents}
              </span>
            </div>
          </div>

          {/* Pillar 4 — controls */}
          <div className="flex items-center gap-2 px-3 py-3 lg:py-3 flex-wrap">
            <button
              onClick={() => setSortMode((m) => (m === 'weight' ? 'uptime' : 'weight'))}
              className={cn(
                'p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50',
                sortMode === 'uptime' && 'text-primary bg-primary/10',
              )}
              title={sortMode === 'weight' ? t('uptime.sortByUptime') : t('uptime.sortByWeight')}
              aria-pressed={sortMode === 'uptime'}
            >
              <ArrowDown01 className="h-3.5 w-3.5" />
            </button>

            <div className="flex border border-border/60 rounded overflow-hidden">
              {uptimeRanges.map((r, idx) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(idx)}
                  className={cn(
                    'px-2 py-1 text-[11px] font-mono transition-colors',
                    rangeIdx === idx
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              title={t('action.refresh')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'motion-safe:animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Shared time-axis ═══ */}
      {baseSortedNodes.length > 0 && (
        <div className="uptime-axis relative px-3 sm:px-4">
          <div className="relative h-4 text-xxs font-metric text-muted-foreground tabular-nums select-none">
            {axisTicks.map((tick, i) => {
              const pct =
                i === 0 ? 0 : i === axisTicks.length - 1 ? 100 : (i / (axisTicks.length - 1)) * 100;
              const isEdge = i === 0 || i === axisTicks.length - 1;
              return (
                <span
                  key={i}
                  className={cn(
                    'absolute top-0',
                    isEdge ? '' : 'opacity-60',
                    i === 0 && 'left-0',
                    i === axisTicks.length - 1 && 'right-0',
                  )}
                  style={
                    !isEdge
                      ? { left: `${pct}%`, transform: 'translateX(-50%)' }
                      : undefined
                  }
                >
                  {tick.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Node list — show ALL nodes by default ═══ */}
      {baseSortedNodes.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden commander-corners relative">
          <span className="corner-bottom" />
          <div className="divide-y divide-border/40">
            {visibleList.map((n, i) => (
              <LazyNodeRow
                key={n.uuid}
                node={n}
                rangeHours={range.hours}
                onNavigate={handleNavigate}
                onResult={handleResult}
                forceKey={forceKey}
                indexHint={i}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
