import { Sparkline } from './Sparkline';
import { useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUp, ArrowDown, Activity, Clock, Network, Signal } from 'lucide-react';
import { SystemIcon } from '@/lib/systemIcon';
import type { NodeWithStatus } from '@/services/api';
import { getBestPingLatency } from '@/services/api';
import { useRecentStats } from '@/hooks/useRecentStats';
import { formatBytes, formatSpeed, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { RegionFlag } from './RegionFlag';
import { TagPill } from './TagPill';
import { parseTagList } from '@/lib/parseTags';
import dayjs from 'dayjs';

interface NodeCardProps {
  node: NodeWithStatus;
}

type GaugeChannel = 'cpu' | 'ram' | 'disk' | 'traffic';
type GaugeStatus = 'normal' | 'warning' | 'critical';

function CompactMetric({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="telemetry-stat hud-data-cell">
      <div className="telemetry-stat__label">
        <Icon className="h-3 w-3 shrink-0 opacity-75" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('telemetry-stat__value', tone)}>{value}</div>
      {sub && <div className="telemetry-stat__sub">{sub}</div>}
    </div>
  );
}

/**
 * Polished resource gauge.
 * - Per-channel hue (cpu=chart-1, ram=chart-2, disk=chart-3) so eye can scan
 *   "which resource is hot" across many cards without reading labels.
 * - Status (warning/critical) overrides channel color — semantic always wins.
 * - Inset-shadow track gives a "machined groove" feel; gradient fill + leading
 *   cursor head adds direction & precise readout anchor.
 * - 3 unobtrusive 25/50/75% tick marks above the track (not on it) act as a
 *   ruler instead of cutting the bar into segments.
 */
function HudGauge({
  label,
  value,
  unit = '%',
  status,
  total,
  channel,
}: {
  label: string;
  value: number;
  unit?: string;
  status: GaugeStatus;
  total?: string;
  channel: GaugeChannel;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  const textColor =
    status === 'critical' ? 'text-destructive' : status === 'warning' ? 'text-warning' : '';
  return (
    <div className="hud-gauge" data-channel={channel} data-status={status}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider hud-gauge__label">
          {label}
        </span>
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className={cn('hud-gauge__value text-xs font-metric font-bold tabular-nums', textColor)}>
            {value.toFixed(1)}
            <span className="hud-gauge__unit text-xxs font-metric text-muted-foreground/70 ml-0.5">
              {unit}
            </span>
          </span>
          {total && (
            <span className="text-xxs font-metric text-muted-foreground/60 leading-none">
              {total}
            </span>
          )}
        </span>
      </div>
      <div className="hud-gauge__track-wrap">
        {/* Tick ruler — sits above the track, not inside it */}
        <div className="hud-gauge__ticks" aria-hidden="true">
          <span style={{ left: '25%' }} />
          <span style={{ left: '50%' }} />
          <span style={{ left: '75%' }} />
        </div>
        <div className="hud-gauge__track">
          <div className="hud-gauge__fill" style={{ width: `${pct}%` }}>
            <span className="hud-gauge__cursor" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrafficBar({
  totalUp,
  totalDown,
  limit,
  type,
  label,
}: {
  totalUp: number;
  totalDown: number;
  limit: number;
  type: TrafficLimitType;
  label: string;
}) {
  const used = calcTrafficUsage(totalUp, totalDown, type);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const status = getUsageStatus(pct, { warning: 70, critical: 90 });
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="hud-gauge" data-channel="traffic" data-status={status}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-mono text-muted-foreground hud-gauge__label">
          {label} <span className="text-muted-foreground/60">({formatTrafficType(type)})</span>
        </span>
        <span
          className={cn(
            'min-w-0 text-right text-xs font-metric font-bold tabular-nums leading-none wrap-break-word',
            status === 'critical'
              ? 'text-destructive'
              : status === 'warning'
                ? 'text-warning'
                : '',
          )}
        >
          {formatBytes(used)}
          <span className="text-muted-foreground/60 mx-1">/</span>
          <span className="text-muted-foreground/80">{formatBytes(limit)}</span>
        </span>
      </div>
      <div className="hud-gauge__track-wrap">
        <div className="hud-gauge__ticks" aria-hidden="true">
          <span style={{ left: '25%' }} />
          <span style={{ left: '50%' }} />
          <span style={{ left: '75%' }} />
        </div>
        <div className="hud-gauge__track">
          <div className="hud-gauge__fill" style={{ width: `${clamped}%` }}>
            <span className="hud-gauge__cursor" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileResourcePill({
  label,
  value,
  status,
  channel,
}: {
  label: string;
  value: number;
  status: GaugeStatus;
  channel: GaugeChannel;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  const tone =
    status === 'critical'
      ? 'text-destructive border-destructive/25 bg-destructive/8'
      : status === 'warning'
        ? 'text-warning border-warning/25 bg-warning/8'
        : 'text-foreground border-border/25 bg-muted/20';

  return (
    <div className={cn('min-w-0 rounded-md border px-2 py-1.5', tone)} data-channel={channel}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-xxs font-mono uppercase tracking-wider text-muted-foreground/75">
          {label}
        </span>
        <span className="shrink-0 text-xs font-metric font-bold tabular-nums">
          {value.toFixed(0)}<span className="text-xxs opacity-60">%</span>
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-background/45">
        <div
          className={cn(
            'h-full rounded-full',
            status === 'critical'
              ? 'bg-destructive'
              : status === 'warning'
                ? 'bg-warning'
                : channel === 'cpu'
                  ? 'bg-chart-1'
                  : channel === 'ram'
                    ? 'bg-chart-2'
                    : 'bg-chart-3',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MobileTelemetryTile({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/20 bg-background/35 px-2.5 py-1.5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] hud-data-cell">
      <div className="mb-1 flex items-center gap-1.5 type-hud-label-sm">
        <Icon className={cn('h-3 w-3 shrink-0', tone ? `${tone} opacity-90` : 'opacity-75')} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('truncate text-sm font-metric font-bold leading-none tabular-nums', tone)}>
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-xxs font-metric text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

function MobileNetworkTile({
  up,
  down,
  totalUp,
  totalDown,
  label,
  upLabel,
  downLabel,
  totalLabel,
}: {
  up: number;
  down: number;
  totalUp: number;
  totalDown: number;
  label: string;
  upLabel: string;
  downLabel: string;
  totalLabel: string;
}) {
  return (
    <div className="col-span-2 min-w-0 rounded-md border border-border/20 bg-background/35 px-2.5 py-1.5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] hud-data-cell">
      <div className="mb-1.5 flex items-center gap-1.5 type-hud-label-sm">
        <span className="stat-chip stat-chip--network"><Network className="h-3 w-3" /></span>
        <span>{label}</span>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 type-hud-label-sm text-chart-7">
            <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
            <span>{upLabel}</span>
          </div>
          <div className="truncate text-sm font-metric font-bold leading-none tabular-nums">
            {formatSpeed(up)}
          </div>
          <div className="mt-1 truncate text-xxs font-metric text-muted-foreground/60">
            {totalLabel} {formatBytes(totalUp)}
          </div>
        </div>
        <div className="min-w-0 border-l border-border/20 pl-2">
          <div className="flex items-center gap-1 type-hud-label-sm text-chart-8">
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
            <span>{downLabel}</span>
          </div>
          <div className="truncate text-sm font-metric font-bold leading-none tabular-nums">
            {formatSpeed(down)}
          </div>
          <div className="mt-1 truncate text-xxs font-metric text-muted-foreground/60">
            {totalLabel} {formatBytes(totalDown)}
          </div>
        </div>
      </div>
    </div>
  );
}

export const NodeCard = memo(function NodeCard({ node }: NodeCardProps) {
  const { t } = useTranslation();
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const { getCpuSparkline } = useRecentStats();
  const { isLoggedIn } = useAppConfig();
  const cpuSparkline = isOnline ? getCpuSparkline(node.uuid) : null;
  const navigate = useNavigate();

  const tagList = useMemo(() => {
    return parseTagList(node.tags).sort((a, b) => (a.color ? 0 : 1) - (b.color ? 0 : 1));
  }, [node.tags]);

  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;

  const cpuStatus = getUsageStatus(cpuUsage, { warning: 60, critical: 80 });
  const ramStatus = getUsageStatus(ramUsage, { warning: 70, critical: 85 });
  const diskStatus = getUsageStatus(diskUsage, { warning: 75, critical: 90 });
  const loadRatio = stats ? stats.load.load1 / (node.cpu_cores || 1) : 0;
  const loadStatus = getUsageStatus(loadRatio * 100, { warning: 100, critical: 150 });
  const pingLatency = getBestPingLatency(stats?.ping);
  const expiryStatus = getExpiryStatus(node.expired_at);
  const priceLabel =
    node.price === -1 ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`;

  return (
    <div className={cn(
      'node-card-commander group relative overflow-hidden rounded-lg border bg-card/80 backdrop-blur-xl transition-all duration-300',
      'hover:shadow-lg hover:shadow-primary/5 commander-corners',
      isOnline ? 'border-border/50' : 'border-border/30 opacity-70 offline-card'
    )}>
      <span className="corner-bottom" />
      
      {/* Corner brackets + real data overlay (Visible on Hover or Critical) */}
      <div className={cn(
        "absolute inset-0 pointer-events-none transition-opacity duration-500 z-20",
        (cpuStatus === 'critical' || ramStatus === 'critical') ? "opacity-100" : "opacity-0 group-hover:opacity-40"
      )}>
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary/40" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary/40" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary/40" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary/40" />
      </div>

      {/* Top neon accent line */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-[2px] z-10',
        isOnline ? 'bg-gradient-to-r from-primary via-primary to-accent' : 'bg-destructive/60'
      )} />

      {/* Header */}
      <div className="p-3 sm:p-4 relative z-10">
        <div className="min-w-0 flex flex-col gap-2">
          {/* Node name row — status · flag · name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              isOnline ? 'bg-success motion-safe:animate-pulse' : 'bg-destructive'
            )} />
            <RegionFlag region={node.region} size="md" />
            <h3
              className={cn(
                "node-name min-w-0 flex-1 text-base truncate cursor-pointer hover:text-primary transition-colors",
                (cpuStatus === 'critical' || ramStatus === 'critical') && "text-destructive"
              )}
              onClick={() => navigate(`/node/${node.uuid}`)}
            >{node.name}</h3>

            {(cpuStatus === 'critical' || ramStatus === 'critical') && (
              <div className="flex items-center gap-1 text-xs font-mono text-destructive font-bold motion-safe:animate-pulse ml-auto">
                <AlertTriangle className="h-3 w-3" />
              </div>
            )}
          </div>
          {/* Tags row */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-4 flex-wrap">
            {node.group && (
              <span className="text-xs font-mono text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                {node.group}
              </span>
            )}
            {tagList.slice(0, 5).map((tag, i) => (
              <TagPill key={i} label={tag.label} color={tag.color} size="sm" />
            ))}
            {tagList.length > 5 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded-sm cursor-default">
                    +{tagList.length - 5}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {tagList.slice(5).map(t => t.label).join(', ')}
                </TooltipContent>
              </Tooltip>
            )}
            {node.hidden && (
              <span className="text-xs font-mono text-warning/80 bg-warning/15 px-1.5 py-0.5 rounded-sm">
                {t('node.hidden')}
              </span>
            )}
            {(() => {
              if (!expiryStatus) return null;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      'text-xxs font-mono px-1.5 py-0.5 rounded-sm cursor-default shrink-0',
                      expiryStatus === 'expired'
                        ? 'text-destructive/85 bg-destructive/15'
                        : expiryStatus === 'warning'
                          ? 'text-warning/85 bg-warning/15'
                          : 'text-muted-foreground/55 bg-muted/35',
                    )}>
                      {formatExpiry(node.expired_at)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="whitespace-pre-line text-xs font-mono">
                    {isLoggedIn
                      ? t('label.expiryTooltipDetail', {
                          date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                          cycle: node.billing_cycle ?? '-',
                          renewal: node.auto_renewal ? t('label.yes') : t('label.no'),
                          price: priceLabel,
                        })
                      : t('label.expiryTooltip', {
                          date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                        })
                    }
                  </TooltipContent>
                </Tooltip>
              );
            })()}
          </div>
          {/* System info row */}
          {(node.os || node.arch) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground/65 truncate ml-0 sm:ml-4 cursor-default">
                  <SystemIcon kind="os" value={node.os} className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate">
                    {node.os}{node.os && node.arch && ' · '}{node.virtualization && `${node.virtualization}/`}{node.arch}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
                {[node.cpu_name && `CPU: ${node.cpu_name} (${node.cpu_cores}C)`, node.os && `OS: ${node.os}`, node.arch && `Arch: ${node.arch}`, node.virtualization && `Virt: ${node.virtualization}`, node.kernel_version && `Kernel: ${node.kernel_version}`].filter(Boolean).join('\n')}
              </TooltipContent>
            </Tooltip>
          )}
          {node.public_remark && (
            <p className="text-xs text-muted-foreground/70 ml-0 sm:ml-4 line-clamp-1 leading-relaxed">
              {node.public_remark}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 sm:px-4 relative z-10">
        {stats ? (
          <div className="space-y-2">
            {/* Mobile summary — compact scan-first layout for GRID view. */}
            <div className="grid grid-cols-3 gap-1.5 sm:hidden">
              <MobileResourcePill channel="cpu" label={t('label.cpu')} value={cpuUsage} status={cpuStatus} />
              <MobileResourcePill channel="ram" label={t('label.ram')} value={ramUsage} status={ramStatus} />
              <MobileResourcePill channel="disk" label={t('label.disk')} value={diskUsage} status={diskStatus} />
            </div>

            {/* Desktop/tablet resource gauges */}
            <div className="hidden space-y-2 sm:block">
              <HudGauge channel="cpu" label={t('label.cpu')} value={cpuUsage} status={cpuStatus} total={`${node.cpu_cores}C`} />
              <HudGauge channel="ram" label={t('label.ram')} value={ramUsage} status={ramStatus} total={formatBytes(stats.ram.total)} />
              <HudGauge channel="disk" label={t('label.disk')} value={diskUsage} status={diskStatus} total={formatBytes(stats.disk.total)} />
            </div>

            {/* Traffic limit bar */}
            {!!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit') && (
              <TrafficBar
                totalUp={stats.network.totalUp}
                totalDown={stats.network.totalDown}
                limit={node.traffic_limit}
                type={node.traffic_limit_type as TrafficLimitType}
                label={t('label.traffic')}
              />
            )}

            {/* CPU Sparkline (login required) */}
            {isLoggedIn && cpuSparkline && (
              <div className="hidden sm:flex items-center gap-2 pt-0.5">
                <span className="text-xxs font-mono text-muted-foreground">{t('label.cpu1m')}</span>
                <Sparkline data={cpuSparkline} width={80} height={18} />
              </div>
            )}

            {/* Mobile telemetry — clarify ambiguous UP by separating UPTIME from NET FLOW. */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 sm:hidden">
              <MobileTelemetryTile
                icon={Activity}
                label={`${t('label.load')} · ${t('label.load1m')}`}
                value={stats.load.load1.toFixed(2)}
                tone={loadStatus === 'critical' ? 'text-destructive' : loadStatus === 'warning' ? 'text-warning' : undefined}
              />
              {pingLatency !== null ? (
                <MobileTelemetryTile
                  icon={Signal}
                  label={t('label.viewPingLatency')}
                  value={`${Math.round(pingLatency)} ms`}
                />
              ) : (
                <MobileTelemetryTile
                  icon={Clock}
                  label={t('label.uptime')}
                  value={formatUptime(stats.uptime)}
                />
              )}
              <MobileNetworkTile
                up={stats.network.up}
                down={stats.network.down}
                totalUp={stats.network.totalUp}
                totalDown={stats.network.totalDown}
                label={t('label.netFlow')}
                upLabel={t('label.uploadShort')}
                downLabel={t('label.downloadShort')}
                totalLabel={t('label.total')}
              />
            </div>

            {/* Desktop/tablet HUD metric strip */}
            <div className={cn(
              'hidden sm:grid gap-1.5 pt-1',
              pingLatency !== null ? 'grid-cols-5' : 'grid-cols-4',
            )}>
              <CompactMetric
                icon={Activity}
                label={t('label.load')}
                value={stats.load.load1.toFixed(2)}
                tone={loadStatus === 'critical' ? 'text-destructive' : loadStatus === 'warning' ? 'text-warning' : undefined}
              />
              {pingLatency !== null && (
                <CompactMetric
                  icon={Signal}
                  label={t('label.viewPingLatency')}
                  value={`${Math.round(pingLatency)} ms`}
                />
              )}
              <CompactMetric
                icon={ArrowUp}
                label={t('label.uploadShort')}
                value={formatSpeed(stats.network.up).replace('/s', '')}
                sub={formatBytes(stats.network.totalUp)}
                tone="text-chart-7"
              />
              <CompactMetric
                icon={ArrowDown}
                label={t('label.downloadShort')}
                value={formatSpeed(stats.network.down).replace('/s', '')}
                sub={formatBytes(stats.network.totalDown)}
                tone="text-chart-8"
              />
              <CompactMetric
                icon={Clock}
                label={t('label.uptime')}
                value={formatUptime(stats.uptime)}
              />
            </div>


          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-20 text-muted-foreground text-xs gap-1.5">
            <span className="no-signal-pulse uppercase tracking-widest text-muted-foreground/60">{t('telemetry.noData')}</span>
          </div>
        )}
      </div>
    </div>
  );
});
