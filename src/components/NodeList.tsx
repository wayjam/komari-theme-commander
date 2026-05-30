import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { NodeCard } from './NodeCard';
import { NodeTable } from './NodeTable';
import { HudSpinner } from './HudSpinner';
import { RefreshCw, Search, X, ChevronDown } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { cn } from '@/lib/utils';
import { parseTagList } from '@/lib/parseTags';

interface NodeListProps {
  nodes?: NodeWithStatus[];
  loading?: boolean;
  onRefresh?: () => void;
  defaultView?: 'grid' | 'table';
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const currentLabel = current?.label ?? t('filter.all');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label}: ${currentLabel}`}
        className={cn(
          'flex items-center gap-1.5 h-9 sm:h-7 px-2.5 rounded text-xs font-mono transition-colors cursor-pointer shrink-0',
          'border border-border/40 hover:border-primary/40 hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          value !== 'all'
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/30 text-muted-foreground'
        )}
      >
        <span className="text-muted-foreground/60">{label}:</span>
        <span className="font-bold">{currentLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            className="fixed inset-x-3 bottom-[calc(3rem+env(safe-area-inset-bottom,0px))] z-50 max-h-[45svh] min-w-[140px] overflow-y-auto py-1 rounded-md border border-border/50 bg-popover backdrop-blur-none shadow-lg commander-dropdown sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full min-h-9 px-3 py-2 sm:py-1.5 text-left text-xs font-mono transition-colors cursor-pointer',
                  'hover:bg-primary/10 hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                  value === opt.value && 'text-primary bg-primary/5 font-bold'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VirtualGrid — virtualized grid using @tanstack/react-virtual
   ══════════════════════════════════════════════════════════════ */
function VirtualGrid({ nodes }: { nodes: NodeWithStatus[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);

  const updateCols = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    if (w >= 1024) setCols(3);
    else if (w >= 640) setCols(2);
    else setCols(1);
  }, []);

  useEffect(() => {
    updateCols();
    const observer = new ResizeObserver(updateCols);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateCols]);

  const rowCount = Math.ceil(nodes.length / cols);
  const estimatedRowHeight = cols === 1 ? 235 : 320;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  // Keep scrollMargin in sync when layout shifts
  useEffect(() => {
    if (containerRef.current) {
      virtualizer.options.scrollMargin = containerRef.current.offsetTop;
    }
  });

  return (
    <div ref={containerRef} className="w-full">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * cols;
          const rowNodes = nodes.slice(startIdx, startIdx + cols);

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start - (virtualizer.options.scrollMargin ?? 0)}px)` }}
            >
              <div
                className="grid gap-4 sm:gap-5 pb-4 sm:pb-5"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {rowNodes.map(node => (
                  <NodeCard key={node.uuid} node={node} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NodeList({ nodes = [], loading = false, onRefresh, defaultView = 'grid' }: NodeListProps) {
  const { t } = useTranslation();
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [onRefresh, isRefreshing]);

  // Derive groups + tag set in a single pass — runs at every WS tick (every 2s),
  // so we keep it cheap and skip allocations when nothing changes.
  // Tags are deduped by their parsed label, so `prod<red>` and `prod<blue>`
  // collapse into a single `prod` filter option even when authored
  // inconsistently across nodes.
  const { groups, allTags } = useMemo(() => {
    const groupSet = new Set<string>();
    const tagSet = new Set<string>();
    for (const n of nodes) {
      if (n.group) groupSet.add(n.group);
      const parsed = parseTagList(n.tags);
      for (let i = 0; i < parsed.length; i++) tagSet.add(parsed[i].label);
    }
    return {
      groups: Array.from(groupSet),
      allTags: Array.from(tagSet).sort(),
    };
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery ? searchQuery.toLowerCase() : '';
    return nodes.filter(node => {
      if (groupFilter !== 'all' && node.group !== groupFilter) return false;
      if (tagFilter !== 'all') {
        const labels = parseTagList(node.tags).map(p => p.label);
        if (!labels.includes(tagFilter)) return false;
      }
      if (statusFilter !== 'all' && node.status !== statusFilter) return false;
      if (q) {
        // Search against parsed labels so users typing `prod` still match
        // `prod<red>`, and typing `red` doesn't accidentally hit every tag
        // that happens to use the red suffix.
        const tagLabels = parseTagList(node.tags)
          .map(p => p.label.toLowerCase())
          .join(' ');
        const match = node.name.toLowerCase().includes(q)
          || node.region?.toLowerCase().includes(q)
          || node.group?.toLowerCase().includes(q)
          || tagLabels.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [nodes, groupFilter, tagFilter, statusFilter, searchQuery]);

  // IMPORTANT: keep `sortedNodes` reference-stable across re-renders when the
  // filtered set hasn't changed. Without `useMemo`, every WS tick produces a
  // new array → VirtualGrid / NodeTable see a new prop reference → the entire
  // virtualizer/react-table recomputes even though nothing meaningful changed.
  const sortedNodes = useMemo(
    () => [...filteredNodes].sort((a, b) => a.weight - b.weight),
    [filteredNodes],
  );

  const onlineCount = useMemo(
    () => nodes.reduce((acc, n) => acc + (n.status === 'online' ? 1 : 0), 0),
    [nodes],
  );
  const hasFilters = groupFilter !== 'all' || tagFilter !== 'all' || statusFilter !== 'all' || searchQuery !== '';

  const groupOptions = useMemo(() => [
    { value: 'all', label: t('filter.all') },
    ...groups.map(g => ({ value: g, label: g })),
  ], [groups, t]);
  const tagOptions = useMemo(() => [
    { value: 'all', label: t('filter.all') },
    ...allTags.map(tag => ({ value: tag, label: tag })),
  ], [allTags, t]);
  const statusOptions = useMemo(() => [
    { value: 'all', label: t('filter.all') },
    { value: 'online', label: t('status.online') },
    { value: 'offline', label: t('status.offline') },
  ], [t]);

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-5">
        {/* Skeleton command bar */}
        <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden commander-corners relative">
          <span className="corner-bottom" />
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/15">
            <div className="flex items-center gap-2 text-xs font-mono min-w-0">
              <span className="font-display font-bold text-xs tracking-wider shrink-0">{t('fleet.title')}</span>
              <div className="h-3 w-24 rounded bg-muted/30 motion-safe:animate-pulse" />
            </div>
          </div>
        </div>

        {/* Skeleton card grid */}
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden commander-corners relative"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                {/* Skeleton header */}
                <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/30 bg-muted/10">
                  <div className="w-2 h-2 rounded-full bg-muted/40 motion-safe:animate-pulse" />
                  <div className="h-3.5 rounded bg-muted/25 motion-safe:animate-pulse" style={{ width: `${50 + Math.random() * 30}%` }} />
                </div>
                {/* Skeleton content */}
                <div className="px-3 py-3 space-y-2.5">
                  {/* Gauge bars */}
                  {[0.7, 0.5, 0.6].map((w, j) => (
                    <div key={j} className="space-y-1">
                      <div className="flex justify-between">
                        <div className="h-2.5 w-8 rounded bg-muted/20 motion-safe:animate-pulse" />
                        <div className="h-2.5 w-10 rounded bg-muted/20 motion-safe:animate-pulse" />
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/15 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/15 motion-safe:animate-pulse hud-skeleton-bar"
                          style={{ width: `${w * 100}%`, animationDelay: `${(i * 3 + j) * 150}ms` }}
                        />
                      </div>
                    </div>
                  ))}
                  {/* Data cells */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 pt-1">
                    {[0, 1, 2, 3].map(j => (
                      <div key={j} className="text-center p-1.5 rounded bg-muted/10 border border-border/15">
                        <div className="h-2 w-6 mx-auto rounded bg-muted/20 motion-safe:animate-pulse mb-1" />
                        <div className="h-3 w-10 mx-auto rounded bg-muted/15 motion-safe:animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Center spinner overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-background/60 backdrop-blur-sm rounded-2xl p-6">
              <HudSpinner size="lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Terminal-style command bar */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-visible commander-corners relative z-40">
        <span className="corner-bottom" />
        {/* Top status line */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/15 gap-2">
          <div className="flex items-center gap-2 text-xs font-mono min-w-0 flex-wrap">
            <span className="font-display font-bold text-xs tracking-wider shrink-0">{t('fleet.title')}</span>
            <span className="text-muted-foreground/40 shrink-0" aria-hidden>·</span>
            <span className="text-success font-metric">{onlineCount}</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-destructive font-metric">{nodes.length - onlineCount}</span>
            <span className="text-muted-foreground/40 shrink-0" aria-hidden>·</span>
            <span className="text-muted-foreground truncate">
              {sortedNodes.length === nodes.length
                ? `${nodes.length} ${t('label.nodes')}`
                : `${sortedNodes.length}/${nodes.length} ${t('filter.matched')}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasFilters && (
              <button
                onClick={() => { setGroupFilter('all'); setTagFilter('all'); setStatusFilter('all'); setSearchQuery(''); }}
                className="text-xs font-mono text-destructive hover:text-destructive/80 transition-colors h-9 sm:h-6 px-2 rounded hover:bg-destructive/10 cursor-pointer"
              >
                {t('action.clear')}
              </button>
            )}
            {onRefresh && (
              <button
                onClick={handleRefresh}
                className={cn(
                  'fleet-refresh-btn flex items-center gap-1.5 h-9 sm:h-6 px-2 rounded text-xs font-mono border transition-colors duration-200 cursor-pointer',
                  isRefreshing
                    ? 'border-primary/40 text-primary bg-primary/10'
                    : 'border-border/30 text-muted-foreground/70 hover:border-primary/50 hover:text-primary hover:bg-primary/5'
                )}
                title={t('action.refresh')}
              >
                <RefreshCw className={cn('h-3 w-3 transition-transform', isRefreshing && 'motion-safe:animate-spin')} />
                <span className="uppercase tracking-wider text-xxs font-bold hidden sm:inline">{t('action.refresh')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter row — search owns its own row on phones; dropdowns scroll
            horizontally so adding extra group/tag chips never wraps the
            command bar into 3+ tall rows. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 sm:flex-wrap relative z-50">
          {/* Search input */}
          <div className="relative w-full sm:flex-1 sm:min-w-[160px] sm:max-w-[280px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('placeholder.searchNodes')}
              className="w-full h-8 sm:h-7 pl-7 pr-7 text-xs font-mono bg-muted/20 border border-border/30 rounded placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/50 cursor-pointer"
                aria-label={t('action.clear')}
              >
                <X className="h-3 w-3 text-muted-foreground/50" />
              </button>
            )}
          </div>

          {/* Filter dropdowns — horizontal scroll on phones, wrap on desktop */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
            <FilterDropdown label={t('filter.group')} value={groupFilter} options={groupOptions} onChange={setGroupFilter} />
            <FilterDropdown label={t('filter.tag')} value={tagFilter} options={tagOptions} onChange={setTagFilter} />
            <FilterDropdown label={t('filter.status')} value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          </div>
        </div>
      </div>

      {/* Node list content */}
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed border-border/50 bg-card/80 backdrop-blur-xl px-4 text-center">
          <div className="flex flex-col items-center gap-2 max-w-sm">
            <span className="text-sm font-display font-bold text-muted-foreground/60 uppercase tracking-widest no-signal-pulse">{t('hud.noSignal')}</span>
            <div className="text-xs text-muted-foreground">{t('node.noNodesAvailable')}</div>
            <div className="text-xs text-muted-foreground/60">{t('node.addFromAdmin')}</div>
          </div>
        </div>
      ) : defaultView === 'grid' ? (
        <VirtualGrid nodes={sortedNodes} />
      ) : (
        <NodeTable nodes={sortedNodes} />
      )}
    </div>
  );
}
