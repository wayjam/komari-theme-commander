import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { NodeCard } from './NodeCard';
import { NodeTable } from './NodeTable';
import { Button } from './ui/button';
import { RefreshCw, Search, X, ChevronDown } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { cn } from '@/lib/utils';

interface NodeListProps {
  nodes?: NodeWithStatus[];
  loading?: boolean;
  onRefresh?: () => void;
  onViewCharts?: (nodeUuid: string, nodeName: string) => void;
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
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-mono transition-colors cursor-pointer',
          'border border-border/40 hover:border-primary/40 hover:text-primary',
          value !== 'all'
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/30 text-muted-foreground'
        )}
      >
        <span className="text-muted-foreground/60">{label}:</span>
        <span className="font-bold">{current?.label || 'ALL'}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] py-1 rounded-md border border-border/50 bg-popover backdrop-blur-none shadow-lg commander-dropdown">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs font-mono transition-colors cursor-pointer',
                  'hover:bg-primary/10 hover:text-primary',
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
function VirtualGrid({ nodes, onViewCharts }: { nodes: NodeWithStatus[]; onViewCharts?: (uuid: string, name: string) => void }) {
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

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 320,
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
                className="grid gap-4 pb-4"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {rowNodes.map(node => (
                  <NodeCard key={node.uuid} node={node} onViewCharts={onViewCharts} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NodeList({ nodes = [], loading = false, onRefresh, onViewCharts, defaultView = 'grid' }: NodeListProps) {
  const { t } = useTranslation();
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const groups = Array.from(new Set(nodes.map(n => n.group).filter(Boolean)));

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    nodes.forEach(n => {
      if (n.tags) {
        n.tags.split(/[,;]/).forEach(t => {
          const trimmed = t.trim();
          if (trimmed) tagSet.add(trimmed);
        });
      }
    });
    return Array.from(tagSet).sort();
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      if (groupFilter !== 'all' && node.group !== groupFilter) return false;
      if (tagFilter !== 'all') {
        if (!node.tags) return false;
        const nodeTags = node.tags.split(/[,;]/).map(t => t.trim());
        if (!nodeTags.includes(tagFilter)) return false;
      }
      if (statusFilter !== 'all' && node.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = node.name.toLowerCase().includes(q)
          || node.region?.toLowerCase().includes(q)
          || node.group?.toLowerCase().includes(q)
          || node.tags?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [nodes, groupFilter, tagFilter, statusFilter, searchQuery]);

  const sortedNodes = [...filteredNodes].sort((a, b) => a.weight - b.weight);

  const onlineCount = nodes.filter(n => n.status === 'online').length;
  const hasFilters = groupFilter !== 'all' || tagFilter !== 'all' || statusFilter !== 'all' || searchQuery !== '';

  const groupOptions = [
    { value: 'all', label: t('filter.all') },
    ...groups.map(g => ({ value: g, label: g })),
  ];
  const tagOptions = [
    { value: 'all', label: t('filter.all') },
    ...allTags.map(t => ({ value: t, label: t })),
  ];
  const statusOptions = [
    { value: 'all', label: t('filter.all') },
    { value: 'online', label: t('status.online') },
    { value: 'offline', label: t('status.offline') },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Terminal-style command bar */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-visible commander-corners relative z-40">
        <span className="corner-bottom" />
        {/* Top status line */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/15 relative overflow-hidden">
          {/* Subtle animated light bar */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-pulse" />
          
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground/60">$</span>
            <span className="font-display font-bold text-xs tracking-wider">{t('fleet.title')}</span>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-green-500">{onlineCount}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-red-500">{nodes.length - onlineCount}</span>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-muted-foreground">
              {sortedNodes.length === nodes.length
                ? `${nodes.length} ${t('label.nodes')}`
                : `${sortedNodes.length}/${nodes.length} ${t('filter.matched')}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasFilters && (
              <button
                onClick={() => { setGroupFilter('all'); setTagFilter('all'); setStatusFilter('all'); setSearchQuery(''); }}
                className="text-xs font-mono text-destructive hover:text-destructive/80 transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/10 cursor-pointer"
              >
                {t('action.clear')}
              </button>
            )}
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-6 w-6 p-0 hover:bg-primary/15 hover:text-primary">
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap overflow-visible relative z-50">
          {/* Search input */}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('placeholder.searchNodes')}
              className="w-full h-7 pl-7 pr-7 text-xs font-mono bg-muted/20 border border-border/30 rounded placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/50 cursor-pointer"
              >
                <X className="h-3 w-3 text-muted-foreground/50" />
              </button>
            )}
          </div>

          <span className="text-border/60 hidden sm:inline">|</span>

          {/* Filter dropdowns */}
          <FilterDropdown label={t('filter.group')} value={groupFilter} options={groupOptions} onChange={setGroupFilter} />
          <FilterDropdown label={t('filter.tag')} value={tagFilter} options={tagOptions} onChange={setTagFilter} />
          <FilterDropdown label={t('filter.status')} value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
        </div>
      </div>

      {/* Node list content */}
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed border-border/50 bg-card/80 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-1.5">
            <span className="text-sm font-display font-bold text-muted-foreground/60 uppercase tracking-widest no-signal-pulse">NO SIGNAL</span>
            <div className="text-xs font-mono text-muted-foreground">{t('node.noNodesAvailable')}</div>
            <div className="text-xxs font-mono text-muted-foreground/60 mt-1">{t('node.addFromAdmin')}</div>
          </div>
        </div>
      ) : defaultView === 'grid' ? (
        <VirtualGrid nodes={sortedNodes} onViewCharts={onViewCharts} />
      ) : (
        <NodeTable nodes={sortedNodes} onViewCharts={onViewCharts} />
      )}
    </div>
  );
}
