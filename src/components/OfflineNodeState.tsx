import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Clock3,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Signal,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { NodeData, NodeStats } from '@/services/api';
import { cn, formatBytes } from '@/lib/utils';
import { Progress } from './ui/progress';

type OfflineNodeStateProps = {
  node: Pick<NodeData, 'cpu_cores' | 'mem_total' | 'disk_total'>;
  lastStats?: NodeStats;
  lastSeenAt?: string;
  variant?: 'card' | 'compact' | 'detail' | 'sidebar';
  className?: string;
};

type OfflineResourceChannel = 'cpu' | 'ram' | 'disk';

function formatSnapshotTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function formatPercent(used: number, total: number): string {
  if (total <= 0) return '—';
  return `${((used / total) * 100).toFixed(1)}%`;
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0">
      <div className="truncate text-xxs font-mono uppercase tracking-wider text-muted-foreground/65">
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-metric font-semibold tabular-nums text-foreground/75">
        {value}
      </div>
    </div>
  );
}

function CapacityLine({
  node,
  t,
}: {
  node: OfflineNodeStateProps['node'];
  t: TFunction;
}) {
  const capacity = [
    node.cpu_cores > 0 ? `${node.cpu_cores}C` : null,
    node.mem_total > 0 ? formatBytes(node.mem_total) : null,
    node.disk_total > 0 ? formatBytes(node.disk_total) : null,
  ].filter(Boolean);

  if (capacity.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xxs font-metric text-muted-foreground/60">
      <span className="shrink-0 uppercase tracking-wider">{t('telemetry.staticCapacity')}</span>
      <span className="truncate tabular-nums">{capacity.join(' · ')}</span>
    </div>
  );
}

function OfflineResourceGauge({
  channel,
  label,
  total,
}: {
  channel: OfflineResourceChannel;
  label: string;
  total?: string;
}) {
  return (
    <div className="hud-gauge" data-channel={channel} data-status="offline">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground/70 hud-gauge__label">
          {label}
        </span>
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="hud-gauge__value text-xs font-metric font-bold tabular-nums text-muted-foreground/55">
            —
          </span>
          {total && (
            <span className="text-xxs font-metric leading-none text-muted-foreground/55">
              {total}
            </span>
          )}
        </span>
      </div>
      <div className="hud-gauge__track-wrap">
        <div className="hud-gauge__ticks" aria-hidden="true">
          <span style={{ left: '25%' }} />
          <span style={{ left: '50%' }} />
          <span style={{ left: '75%' }} />
        </div>
        <div className="hud-gauge__track" aria-hidden="true">
          <span className="offline-gauge__signal" />
        </div>
      </div>
    </div>
  );
}

function OfflineMiniResource({ label, total }: { label: string; total?: string }) {
  return (
    <div className="min-w-0 border-t border-border/20 pt-1.5">
      <div className="truncate text-xxs font-mono uppercase tracking-wider text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1">
        <span className="text-xs font-metric font-bold text-muted-foreground/55">—</span>
        {total && <span className="truncate text-xxs font-metric text-muted-foreground/50">{total}</span>}
      </div>
    </div>
  );
}

function OfflineMetricTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text-muted-foreground/60',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 border-t border-border/20 pt-1.5">
      <div className="flex min-w-0 items-center gap-1 type-hud-label-sm text-muted-foreground/55">
        <Icon className="h-3 w-3 shrink-0 opacity-75" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('mt-0.5 truncate text-xs font-metric font-bold leading-none tabular-nums', tone)}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate text-xxs font-metric text-muted-foreground/45">
          {sub}
        </div>
      )}
    </div>
  );
}

function OfflineCardState({
  node,
  snapshotTime,
  t,
}: {
  node: OfflineNodeStateProps['node'];
  snapshotTime: string | null;
  t: TFunction;
}) {
  const cpuTotal = node.cpu_cores > 0 ? `${node.cpu_cores}C` : undefined;
  const memTotal = node.mem_total > 0 ? formatBytes(node.mem_total) : undefined;
  const diskTotal = node.disk_total > 0 ? formatBytes(node.disk_total) : undefined;
  const reportLabel = snapshotTime ? t('telemetry.lastSeen') : t('telemetry.neverReported');

  return (
    <div className="flex flex-1 flex-col justify-between gap-4 py-2">
      <div className="hidden space-y-2 sm:block">
        <OfflineResourceGauge channel="cpu" label={t('label.cpu')} total={cpuTotal} />
        <OfflineResourceGauge channel="ram" label={t('label.ram')} total={memTotal} />
        <OfflineResourceGauge channel="disk" label={t('label.disk')} total={diskTotal} />
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:hidden">
        <OfflineMiniResource label={t('label.cpu')} total={cpuTotal} />
        <OfflineMiniResource label={t('label.ram')} total={memTotal} />
        <OfflineMiniResource label={t('label.disk')} total={diskTotal} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-1 sm:grid-cols-5">
        <OfflineMetricTile
          icon={Activity}
          label={t('label.load')}
          value="—"
          sub={t('telemetry.signalLost')}
        />
        <OfflineMetricTile
          icon={Signal}
          label={t('label.viewPingLatency')}
          value="—"
          sub={t('telemetry.signalLost')}
        />
        <OfflineMetricTile
          icon={ArrowUp}
          label={t('label.uploadShort')}
          value="—"
          sub={t('telemetry.signalLost')}
          tone="text-chart-7/55"
        />
        <OfflineMetricTile
          icon={ArrowDown}
          label={t('label.downloadShort')}
          value="—"
          sub={t('telemetry.signalLost')}
          tone="text-chart-8/55"
        />
        <OfflineMetricTile
          icon={Clock}
          label={t('label.uptime')}
          value={t('status.offline')}
          sub={reportLabel}
          tone="text-destructive/80"
        />
      </div>
    </div>
  );
}

function OfflineSidebarState({
  node,
  snapshotTime,
  t,
  className,
}: {
  node: OfflineNodeStateProps['node'];
  snapshotTime: string | null;
  t: TFunction;
  className?: string;
}) {
  const cpuTotal = node.cpu_cores > 0 ? `${node.cpu_cores}C` : undefined;
  const memTotal = node.mem_total > 0 ? formatBytes(node.mem_total) : undefined;
  const diskTotal = node.disk_total > 0 ? formatBytes(node.disk_total) : undefined;

  return (
    <div className={cn('sidebar-detail-telemetry', className)}>
      <div className="stat-section border-t border-border/20 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="stat-chip stat-chip--network text-destructive">
            <WifiOff className="h-3 w-3" aria-hidden />
          </span>
          <span className="type-hud-label text-destructive/85">{t('status.offline')}</span>
          <span className="type-hud-label-sm text-muted-foreground/60">
            {t('telemetry.noLiveMetrics')}
          </span>
        </div>
        <div className="mt-1.5 text-xxs leading-relaxed text-muted-foreground/65">
          {t('telemetry.nodeOffline')}
        </div>
      </div>

      {/* Keep Globe's original instrument sections. Offline only changes the
          readouts; the sidebar should not turn into a Grid card. */}
      <div className="stat-section border-t border-border/20 p-2.5 space-y-2.5">
        <OfflineSidebarResource
          icon={Cpu}
          chipClass="stat-chip--cpu"
          label={t('label.cpu')}
          total={cpuTotal}
        />
        <OfflineSidebarResource
          icon={MemoryStick}
          chipClass="stat-chip--ram"
          label={t('label.ram')}
          total={memTotal}
        />
        <OfflineSidebarResource
          icon={HardDrive}
          chipClass="stat-chip--disk"
          label={t('label.disk')}
          total={diskTotal}
        />
      </div>

      <div className="stat-section border-t border-border/20 p-2.5 flex flex-col gap-1.5" data-accent="load">
        <div className="flex items-center gap-1.5">
          <span className="stat-chip stat-chip--load"><Activity className="h-3 w-3" /></span>
          <span className="type-hud-label">{t('label.load')}</span>
        </div>
        <div className="type-metric-hero tabular-nums text-muted-foreground/45">—</div>
        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/15">
          <OfflineSidebarReadout label={t('label.load1m')} />
          <OfflineSidebarReadout label={t('label.load5m')} />
          <OfflineSidebarReadout label={t('label.load15m')} />
        </div>
      </div>

      <div className="stat-section border-t border-border/20 p-2.5 flex flex-col gap-2" data-accent="network">
        <div className="flex items-center gap-1.5">
          <span className="stat-chip stat-chip--network"><Network className="h-3 w-3" /></span>
          <span className="type-hud-label">{t('label.network')}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <OfflineSidebarNetworkRow label={t('label.totalUp')} tone="text-chart-7/55" />
          <OfflineSidebarNetworkRow label={t('label.totalDown')} tone="text-chart-8/55" />
        </div>
      </div>

      <div className="stat-section border-t border-border/20 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="stat-chip stat-chip--uptime"><Clock className="h-3 w-3" /></span>
            <span className="type-hud-label">{t('label.uptime')}</span>
          </div>
          <span className="type-metric-md tabular-nums shrink-0 text-destructive/80">
            {t('status.offline')}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-1.5 mt-1.5 border-t border-border/15 tabular-nums">
          <span className="type-hud-label-sm">{t('telemetry.lastSeen')}</span>
          <span className="text-xxs font-metric text-muted-foreground/65 truncate">
            {snapshotTime ?? t('telemetry.neverReported')}
          </span>
        </div>
      </div>
    </div>
  );
}

function OfflineSidebarResource({
  icon: Icon,
  chipClass,
  label,
  total,
}: {
  icon: LucideIcon;
  chipClass: string;
  label: string;
  total?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('stat-chip', chipClass)}><Icon className="h-3 w-3" /></span>
          <span className="type-hud-label shrink-0">{label}</span>
          {total && (
            <span className="truncate text-xxs text-muted-foreground font-metric tabular-nums">
              {total}
            </span>
          )}
        </div>
        <span className="type-metric-md shrink-0 text-muted-foreground/45">—</span>
      </div>
      <Progress
        value={0}
        className="h-1.5 bg-muted-foreground/12"
        indicatorClassName="bg-muted-foreground/10"
      />
    </div>
  );
}

function OfflineSidebarReadout({ label }: { label: string }) {
  return (
    <div>
      <div className="type-hud-label-sm">{label}</div>
      <div className="type-metric-md tabular-nums text-muted-foreground/45">—</div>
    </div>
  );
}

function OfflineSidebarNetworkRow({ label, tone }: { label: string; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 tabular-nums">
      <span className="type-hud-label-sm shrink-0">{label}</span>
      <span className={cn('type-metric-md shrink-0', tone)}>—</span>
    </div>
  );
}

type OfflineTableColumn = 'cpu' | 'ram' | 'disk' | 'load' | 'network' | 'uptime';

export function OfflineTableCell({
  column,
  node,
}: {
  column: OfflineTableColumn;
  node: Pick<NodeData, 'cpu_cores' | 'mem_total' | 'disk_total'>;
}) {
  const { t } = useTranslation();

  if (column === 'uptime') {
    return (
      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xxs font-metric font-semibold text-destructive/75">
        <WifiOff className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{t('status.offline')}</span>
      </div>
    );
  }

  const capacity = column === 'cpu'
    ? (node.cpu_cores > 0 ? `${node.cpu_cores}C` : null)
    : column === 'ram'
      ? (node.mem_total > 0 ? formatBytes(node.mem_total) : null)
      : column === 'disk'
        ? (node.disk_total > 0 ? formatBytes(node.disk_total) : null)
        : null;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-sm font-metric font-semibold text-muted-foreground/50">—</span>
        <span className="truncate text-xxs font-mono uppercase tracking-wider text-muted-foreground/50">
          {t('telemetry.signalLost')}
        </span>
      </div>
      {capacity && (
        <span className="truncate text-xxs font-metric tabular-nums text-muted-foreground/45">
          {capacity}
        </span>
      )}
    </div>
  );
}

export function OfflineNodeState({
  node,
  lastStats,
  lastSeenAt,
  variant = 'card',
  className,
}: OfflineNodeStateProps) {
  const { t } = useTranslation();
  const snapshotTime = formatSnapshotTime(lastSeenAt ?? lastStats?.updated_at);
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <div className={cn('flex min-w-0 items-center gap-2 text-xs', className)}>
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-destructive/75" aria-hidden />
        <span className="font-mono font-semibold text-destructive/80">{t('status.offline')}</span>
        <span className="truncate text-muted-foreground/60">{t('telemetry.noLiveMetrics')}</span>
        {snapshotTime && (
          <span className="hidden truncate text-xxs font-metric text-muted-foreground/45 xl:inline">
            · {t('telemetry.lastSeen')}: {snapshotTime}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return <OfflineCardState node={node} snapshotTime={snapshotTime} t={t} />;
  }

  const isSidebar = variant === 'sidebar';
  const isDetail = variant === 'detail';

  if (isSidebar) {
    return (
      <OfflineSidebarState
        node={node}
        snapshotTime={snapshotTime}
        t={t}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-3 py-3',
        isSidebar ? 'min-h-[11rem]' : isDetail ? 'min-h-[6rem]' : 'min-h-[10rem]',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-destructive/10 text-destructive/80">
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-destructive/85">
              {t('status.offline')}
            </span>
            <span className="text-xxs font-mono uppercase tracking-wider text-muted-foreground/55">
              {t('telemetry.noLiveMetrics')}
            </span>
          </div>
          <div className="mt-1 text-xxs leading-relaxed text-muted-foreground/65">
            {t('telemetry.nodeOffline')}
          </div>
        </div>
      </div>

      {lastStats && (
        <div className="space-y-2 border-y border-border/20 py-2.5">
          <div className="text-xxs font-mono uppercase tracking-wider text-muted-foreground/50">
            {t('telemetry.lastSnapshot')}
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/20">
            <SnapshotMetric label="CPU" value={`${lastStats.cpu.usage.toFixed(1)}%`} />
            <SnapshotMetric label={t('label.ram')} value={formatPercent(lastStats.ram.used, lastStats.ram.total)} />
            <SnapshotMetric label={t('label.disk')} value={formatPercent(lastStats.disk.used, lastStats.disk.total)} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CapacityLine node={node} t={t} />
        <div className="flex min-w-0 items-center gap-1.5 text-xxs font-metric text-muted-foreground/60">
          <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="uppercase tracking-wider">{t('telemetry.lastSeen')}</span>
          <span className="truncate tabular-nums text-muted-foreground/75">
            {snapshotTime ?? t('telemetry.neverReported')}
          </span>
        </div>
      </div>
    </div>
  );
}
