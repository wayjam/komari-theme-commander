import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldCheck, ShieldX, RefreshCw, ChevronRight } from 'lucide-react';
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

/* ══════════════════════════════════════════════════════════════
   Lazy-load hook — triggers when element enters viewport
   ══════════════════════════════════════════════════════════════ */
function useLazyVisible(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isVisible };
}

/* ══════════════════════════════════════════════════════════════
   Uptime Bar — the coloured status-slot timeline
   ══════════════════════════════════════════════════════════════ */
function UptimeBar({ slots }: { slots: UptimeSlot[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const { t } = useTranslation();

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const fmtShort = (ts: number) => {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
  };

  return (
    <div className="relative group">
      <div className="flex gap-[1px] h-6 rounded overflow-hidden relative">
        {slots.map((slot, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 min-w-[2px] transition-opacity',
              slot.status === 'online' && 'bg-green-500',
              slot.status === 'offline' && 'bg-red-500',
              slot.status === 'unknown' && 'bg-muted/30',
              hoveredIdx !== null && hoveredIdx !== i && 'opacity-40',
            )}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
        {/* Inline time labels */}
        <span className="absolute left-1.5 inset-y-0 flex items-center text-xs font-mono pointer-events-none uptime-bar-label">
          {slots.length > 0 && fmtShort(slots[0].start)}
        </span>
        <span className="absolute right-1.5 inset-y-0 flex items-center text-xs font-mono pointer-events-none uptime-bar-label">
          {t('time.now')}
        </span>
      </div>

      {/* Tooltip */}
      {hoveredIdx !== null && slots[hoveredIdx] && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-popover border border-border text-xxs font-mono text-popover-foreground whitespace-nowrap z-10 pointer-events-none shadow-lg">
          {fmtDate(slots[hoveredIdx].start)} — {slots[hoveredIdx].status.toUpperCase()}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Single node row
   ══════════════════════════════════════════════════════════════ */
interface NodeRowProps {
  node: NodeWithStatus;
  uptime: UptimeResult | null;
  loading: boolean;
  onNavigate: (uuid: string) => void;
}

function NodeRow({ node, uptime, loading, onNavigate }: NodeRowProps) {
  const { t } = useTranslation();
  const isOnline = node.status === 'online';
  const pct = uptime?.uptimePercent ?? null;

  const pctColor = pct === null
    ? 'text-muted-foreground'
    : pct >= 99 ? 'text-green-500'
    : pct >= 95 ? 'text-yellow-500'
    : 'text-red-500';

  return (
    <div
      className="group rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl px-3 py-2 sm:px-4 sm:py-2.5 hover:border-primary/30 transition-all commander-corners relative overflow-hidden"
    >
      <div className="commander-scanner-effect opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className="corner-bottom" />
      {/* Top: name + status + uptime % — clickable */}
      <div
        className="flex items-center gap-2 mb-1.5 relative z-10 cursor-pointer"
        onClick={() => onNavigate(node.uuid)}
      >
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
        <span className="text-sm font-display font-bold truncate group-hover:text-primary transition-colors">{node.name}</span>
        {node.region && (
          <span className="text-xs font-mono text-muted-foreground/60">{node.region}</span>
        )}
        {node.group && (
          <span className="text-xs font-mono text-primary/80 bg-primary/10 px-1 rounded">[{node.group}]</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : pct !== null ? (
            <span className={cn('text-sm font-mono font-bold tabular-nums px-2 py-0.5 rounded bg-muted/20 border border-border/30', pctColor)}>
              {pct.toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">—</span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
        </span>
      </div>

      {/* Uptime bar */}
      <div className="relative z-10">
        {uptime ? (
          <UptimeBar slots={uptime.slots} />
        ) : loading ? (
          <div className="h-6 rounded bg-muted/20 animate-pulse border border-border/20" />
        ) : (
          <div className="h-6 rounded bg-muted/10 flex items-center justify-center border border-dashed border-border/40">
            <span className="text-xs font-mono text-muted-foreground">{t('uptime.noData')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Module-level incremental cache — survives unmount / remount
   ══════════════════════════════════════════════════════════════ */

/** Per-node cached data: raw records + computed result */
interface NodeCache {
  records: LoadRecord[];       // raw records kept for incremental merge
  result: UptimeResult;        // last computed uptime result
  fetchedAt: number;           // Date.now() when last fetched
}

interface IncrementalCache {
  /** Per-node cache keyed by uuid */
  nodes: Map<string, NodeCache>;
  /** Which range (hours) was this cache built for */
  rangeHours: number;
}

let _cache: IncrementalCache | null = null;

/** After this long since individual node fetch, do incremental refresh */
const NODE_REFRESH_INTERVAL = 2 * 60_000;  // 2 minutes

/* ══════════════════════════════════════════════════════════════
   LazyNodeRow — fetches data only when scrolled into view
   ══════════════════════════════════════════════════════════════ */
interface LazyNodeRowProps {
  node: NodeWithStatus;
  rangeHours: number;
  onNavigate: (uuid: string) => void;
  /** Callback to report computed result upward for avg calculation */
  onResult: (uuid: string, result: UptimeResult) => void;
  /** Force refetch counter — incremented on manual refresh */
  forceKey: number;
}

function LazyNodeRow({ node, rangeHours, onNavigate, onResult, forceKey }: LazyNodeRowProps) {
  const { ref, isVisible } = useLazyVisible('300px');
  const [uptime, setUptime] = useState<UptimeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const lastForceKey = useRef(forceKey);

  // Check cache on mount
  useEffect(() => {
    if (_cache && _cache.rangeHours === rangeHours) {
      const cached = _cache.nodes.get(node.uuid);
      if (cached) {
        setUptime(cached.result);
        onResult(node.uuid, cached.result);
        fetchedRef.current = true;
      }
    }
  }, [node.uuid, rangeHours]);

  // Fetch when visible (lazy) or on force refresh
  useEffect(() => {
    const isForceRefresh = forceKey !== lastForceKey.current;
    lastForceKey.current = forceKey;

    if (!isVisible && !isForceRefresh) return;
    // Skip if already fetched and not forced
    if (fetchedRef.current && !isForceRefresh) return;

    let cancelled = false;

    const doFetch = async () => {
      setLoading(true);

      // Ensure cache structure exists
      if (!_cache || _cache.rangeHours !== rangeHours) {
        _cache = { nodes: new Map(), rangeHours };
      }

      const cached = _cache.nodes.get(node.uuid);
      const isIncremental = cached && !isForceRefresh && (Date.now() - cached.fetchedAt < 30 * 60_000);

      try {
        let fetchHours = rangeHours;
        if (isIncremental) {
          const deltaMs = Date.now() - cached!.fetchedAt;
          fetchHours = Math.ceil(deltaMs / 3600_000) + 1;
        }

        const data = await apiService.getLoadHistory(node.uuid, fetchHours);
        if (cancelled) return;

        const newRecords: LoadRecord[] = data?.records ?? [];

        let finalRecords: LoadRecord[];
        if (isIncremental && cached) {
          finalRecords = mergeRecords(cached.records, newRecords, rangeHours);
        } else {
          finalRecords = newRecords;
        }

        const result = computeUptime(finalRecords, rangeHours);

        _cache!.nodes.set(node.uuid, {
          records: finalRecords,
          result,
          fetchedAt: Date.now(),
        });

        setUptime(result);
        onResult(node.uuid, result);
        fetchedRef.current = true;
      } catch {
        if (!cancelled) {
          // Use cached result if available
          if (cached) {
            setUptime(cached.result);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [isVisible, forceKey, node.uuid, rangeHours]);

  // Incremental refresh timer — only for visible & already-fetched nodes
  useEffect(() => {
    if (!isVisible || !fetchedRef.current) return;

    const timer = setInterval(async () => {
      if (!_cache || _cache.rangeHours !== rangeHours) return;
      const cached = _cache.nodes.get(node.uuid);
      if (!cached || Date.now() - cached.fetchedAt < NODE_REFRESH_INTERVAL) return;

      try {
        const deltaMs = Date.now() - cached.fetchedAt;
        const deltaHours = Math.ceil(deltaMs / 3600_000) + 1;
        const data = await apiService.getLoadHistory(node.uuid, deltaHours);
        const newRecords: LoadRecord[] = data?.records ?? [];
        const merged = mergeRecords(cached.records, newRecords, rangeHours);
        const result = computeUptime(merged, rangeHours);

        _cache!.nodes.set(node.uuid, {
          records: merged,
          result,
          fetchedAt: Date.now(),
        });

        setUptime(result);
        onResult(node.uuid, result);
      } catch {
        // ignore
      }
    }, NODE_REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [isVisible, node.uuid, rangeHours]);

  return (
    <div ref={ref}>
      <NodeRow
        node={node}
        uptime={uptime}
        loading={loading}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   UptimeView — main exported component
   ══════════════════════════════════════════════════════════════ */
interface UptimeViewProps {
  nodes: NodeWithStatus[];
}

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

  // Force refresh counter
  const [forceKey, setForceKey] = useState(0);

  // Collect results from lazy rows for avg calculation
  const resultMapRef = useRef(new Map<string, UptimeResult>());
  const [avgUptime, setAvgUptime] = useState<number | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  // Reset results on range change
  useEffect(() => {
    resultMapRef.current.clear();
    setAvgUptime(null);
    setLoadedCount(0);
  }, [range.hours]);

  const handleResult = useCallback((uuid: string, result: UptimeResult) => {
    resultMapRef.current.set(uuid, result);
    const map = resultMapRef.current;
    let sum = 0;
    map.forEach(v => { sum += v.uptimePercent; });
    setAvgUptime(map.size > 0 ? sum / map.size : null);
    setLoadedCount(map.size);
  }, []);

  // Stable node uuid list — only changes when nodes are truly added/removed
  const nodeUuidKey = useMemo(
    () => nodes.map(n => n.uuid).sort().join(','),
    [nodes],
  );

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeUuidKey],
  );

  // Summary stats
  const onlineCount = nodes.filter(n => n.status === 'online').length;
  const totalCount = nodes.length;
  const isLoading = loadedCount === 0 && sortedNodes.length > 0;

  const handleRefresh = useCallback(() => {
    _cache = null;
    resultMapRef.current.clear();
    setAvgUptime(null);
    setLoadedCount(0);
    setForceKey(k => k + 1);
  }, []);

  return (
    <div className="space-y-4">
      {/* ═══ Header bar ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-display font-bold">{t('uptime.monitor')}</h2>
        </div>

        <div className="flex items-center gap-3 sm:ml-auto">
          {/* Summary badges */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
              {onlineCount}/{totalCount}
            </span>
            {avgUptime !== null && (
              <>
                <span className="text-muted-foreground/40">|</span>
                <span className={cn(
                  'font-bold tabular-nums',
                  avgUptime >= 99 ? 'text-green-500' : avgUptime >= 95 ? 'text-yellow-500' : 'text-red-500',
                )}>
                  {t('label.avg')} {avgUptime.toFixed(1)}%
                </span>
              </>
            )}
          </div>

          {/* Range selector */}
          <div className="flex border border-border/50 rounded overflow-hidden">
            {uptimeRanges.map((r, idx) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(idx)}
                className={cn(
                  'px-2 py-1 text-xs font-mono transition-colors',
                  rangeIdx === idx
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted/50 text-muted-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title={t('action.refresh')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ═══ All-systems summary ═══ */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl p-4 flex items-center gap-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('uptime.loading')}
          </div>
        ) : avgUptime !== null && avgUptime >= 99 ? (
          <>
            <ShieldCheck className="h-6 w-6 text-green-500" />
            <div>
              <div className="text-sm font-semibold text-green-500">{t('uptime.allSystemsOperational')}</div>
              <div className="text-xs font-mono text-muted-foreground">
                {t('uptime.averageDesc', { value: avgUptime.toFixed(2) + '%', period: range.label.toLowerCase() })}
              </div>
            </div>
          </>
        ) : avgUptime !== null ? (
          <>
            <ShieldX className="h-6 w-6 text-yellow-500" />
            <div>
              <div className="text-sm font-semibold text-yellow-500">{t('uptime.degradedPerformance')}</div>
              <div className="text-xs font-mono text-muted-foreground">
                {t('uptime.averageDesc', { value: avgUptime.toFixed(2) + '%', period: range.label.toLowerCase() })}
              </div>
            </div>
          </>
        ) : (
          <>
            <Shield className="h-6 w-6 text-muted-foreground" />
            <div className="text-sm font-mono text-muted-foreground">{t('uptime.noDataAvailable')}</div>
          </>
        )}
      </div>

      {/* ═══ Node rows ═══ */}
      <div className="space-y-1.5">
        {sortedNodes.map(node => (
          <LazyNodeRow
            key={node.uuid}
            node={node}
            rangeHours={range.hours}
            onNavigate={(uuid) => navigate(`/node/${uuid}`)}
            onResult={handleResult}
            forceKey={forceKey}
          />
        ))}
      </div>
    </div>
  );
}
