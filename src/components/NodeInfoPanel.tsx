import { CircularGauge } from '@/components/CircularGauge';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { RemarkNote } from '@/components/RemarkNote';
import { TagPill } from '@/components/TagPill';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAppConfig } from '@/hooks/useAppConfig';
import { parseTagList } from '@/lib/parseTags';
import { SystemIcon } from '@/lib/systemIcon';
import {
  formatSpeed,
  formatBytes,
  formatUptime,
  getUsageStatus,
  calcTrafficUsage,
  formatTrafficType,
  getExpiryStatus,
  formatExpiryRelative,
  cn,
} from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import type { NodeWithStatus } from '@/services/api';
import {
  ArrowUp,
  ArrowDown,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Network,
  Clock,
  ExternalLink,
  Calendar,
  Gauge,
  RefreshCw,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NodeInfoPanel({ node }: { node: NodeWithStatus }) {
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const isFree = node.price === -1;
  const expiryStatus = getExpiryStatus(node.expired_at);
  const hasTraffic = !!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit');
  const tagList = parseTagList(node.tags);
  const hasSystemTags = !!(node.group || node.hidden);
  const shouldShowTagDivider = hasSystemTags && tagList.length > 0;
  const hasTagStrip = hasSystemTags || tagList.length > 0 || !!node.region;
  const priceLabel = isFree ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`;
  const cores = node.cpu_cores || 1;
  const loadRatio = stats ? stats.load.load1 / cores : 0;
  const loadStatusTone =
    loadRatio >= 1.5 ? 'text-destructive' : loadRatio >= 1 ? 'text-warning' : 'text-foreground';

  return (
    <div className="node-card-commander node-info-panel rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl p-4 sm:p-5 commander-corners relative overflow-hidden">
      <div className="commander-scanner-effect" />
      <span className="corner-bottom" />
      <div className="flex flex-col gap-3">
      {hasTagStrip && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          {node.group && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">[{node.group}]</span>
          )}
          {node.hidden && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0">
              {t('node.hidden')}
            </span>
          )}
          {shouldShowTagDivider && <span className="mx-1 h-3 w-px bg-border/40" aria-hidden />}
          {tagList.map((tag, i) => (
            <TagPill key={i} label={tag.label} color={tag.color} size="sm" />
          ))}
        </div>
      )}

      <RemarkNote text={node.public_remark} variant="public" />

      {appConfig.isLoggedIn && <RemarkNote text={node.remark} variant="private" />}

      {(node.cpu_name || node.gpu_name || node.os || node.arch) && (
        <div className="network-stats-panel telemetry-panel overflow-hidden">
          <div className="flex flex-col divide-y divide-border/20">
            {(node.cpu_name || node.gpu_name) && (
              <div className="flex flex-col divide-y divide-border/20 sm:flex-row sm:divide-x sm:divide-y-0">
                {node.cpu_name && (
                  <OverflowTooltip
                    content={`${node.cpu_name} (${node.cpu_cores}C)`}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--cpu"><SystemIcon kind="cpu" value={node.cpu_name} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.cpu')}</span>
                      </div>
                      <div className="type-spec-value">{node.cpu_name} ({node.cpu_cores}C)</div>
                    </div>
                  </OverflowTooltip>
                )}
                {node.gpu_name && (
                  <OverflowTooltip
                    content={node.gpu_name}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--gpu"><SystemIcon kind="gpu" value={node.gpu_name} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.gpu')}</span>
                      </div>
                      <div className="type-spec-value">{node.gpu_name}</div>
                    </div>
                  </OverflowTooltip>
                )}
              </div>
            )}
            {(node.os || node.arch) && (
              <div className="flex flex-col divide-y divide-border/20 sm:flex-row sm:divide-x sm:divide-y-0">
                {node.os && (
                  <OverflowTooltip
                    content={`${node.os}${node.kernel_version ? `\n${t('label.kernel')}: ${node.kernel_version}` : ''}`}
                    contentClassName="max-w-xs text-xs font-mono whitespace-pre-line"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--system"><SystemIcon kind="os" value={node.os} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.system')}</span>
                      </div>
                      <div className="type-spec-value">
                        {node.os}{node.kernel_version ? ` · ${node.kernel_version}` : ''}
                      </div>
                    </div>
                  </OverflowTooltip>
                )}
                {node.arch && (
                  <OverflowTooltip
                    content={`${node.arch}${node.virtualization ? ` · ${node.virtualization}` : ''}`}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--system"><SystemIcon kind="arch" value={node.arch} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.arch')}</span>
                      </div>
                      <div className="type-spec-value">
                        {node.arch}{node.virtualization ? ` · ${node.virtualization}` : ''}
                      </div>
                    </div>
                  </OverflowTooltip>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {stats ? (
        <>
          <div className="network-stats-panel telemetry-panel overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border/20">
              <CircularGauge
                channel="cpu"
                label={t('label.cpu')}
                value={cpuUsage}
                icon={<Cpu className="h-3 w-3" />}
                status={getUsageStatus(cpuUsage, { warning: 60, critical: 80 })}
                detail={node.cpu_cores ? `${node.cpu_cores} ${t('label.cores')}` : undefined}
              />
              <CircularGauge
                channel="ram"
                label={t('label.ram')}
                value={ramUsage}
                icon={<MemoryStick className="h-3 w-3" />}
                status={getUsageStatus(ramUsage, { warning: 70, critical: 85 })}
                detail={`${formatBytes(stats.ram.used)} / ${formatBytes(stats.ram.total)}`}
                subDetail={stats.swap.total > 0 ? `${t('label.swap')}: ${formatBytes(stats.swap.used)} / ${formatBytes(stats.swap.total)}` : undefined}
              />
              <CircularGauge
                channel="disk"
                label={t('label.disk')}
                value={diskUsage}
                icon={<HardDrive className="h-3 w-3" />}
                status={getUsageStatus(diskUsage, { warning: 75, critical: 90 })}
                detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
              />
            </div>

            <div className="grid grid-cols-1 divide-y divide-border/20 border-t border-border/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="network">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/node/${node.uuid}/network`}
                      aria-label={t('label.networkDetailHint')}
                      className="group inline-flex w-fit max-w-full items-center gap-1.5 rounded-md -ml-1 px-1 py-0.5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span className="stat-chip stat-chip--network"><Network className="h-3 w-3" /></span>
                      <span className="type-hud-label transition-colors group-hover:text-primary">{t('label.network')}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 text-primary/50 transition-colors group-hover:text-primary" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {t('label.networkDetailHint')}
                  </TooltipContent>
                </Tooltip>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 type-metric-md tabular-nums">
                    <ArrowUp className="h-3 w-3 shrink-0 text-chart-7" aria-hidden />
                    <span>{formatSpeed(stats.network.up)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 type-metric-md tabular-nums">
                    <ArrowDown className="h-3 w-3 shrink-0 text-chart-8" aria-hidden />
                    <span>{formatSpeed(stats.network.down)}</span>
                  </div>
                </div>
                {appConfig.isLoggedIn && (
                  <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-border/15">
                    <span className="type-hud-label-sm">{t('label.tcp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-5">{stats.connections.tcp}</span>
                    <span className="text-xxs text-muted-foreground/20">|</span>
                    <span className="type-hud-label-sm">{t('label.udp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-6">{stats.connections.udp}</span>
                  </div>
                )}
              </div>
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="load">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--load"><Activity className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.load')}</span>
                </div>
                <div className={cn('type-metric-hero tabular-nums', loadStatusTone)}>
                  {stats.load.load1.toFixed(2)}
                </div>
                <div className="grid grid-cols-3 gap-1 mt-auto pt-1.5 border-t border-border/15">
                  <div>
                    <div className="type-hud-label-sm">{t('label.load1m')}</div>
                    <div className="type-metric-md tabular-nums">{stats.load.load1.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load5m')}</div>
                    <div className="type-metric-md font-semibold tabular-nums text-foreground/85">{stats.load.load5.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load15m')}</div>
                    <div className="type-metric-md font-medium tabular-nums text-foreground/65">{stats.load.load15.toFixed(2)}</div>
                  </div>
                </div>
              </div>
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="uptime">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--uptime"><Clock className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.uptime')}</span>
                </div>
                <div className="type-metric-hero tabular-nums text-foreground">
                  {formatUptime(stats.uptime, 'minute', 5)}
                </div>
                {stats.process > 0 && (
                  <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-border/15">
                    <span className="type-hud-label-sm">{t('label.proc')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums">{stats.process}</span>
                  </div>
                )}
              </div>
            </div>

            {hasTraffic && (() => {
              const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
              const pct = (used / node.traffic_limit!) * 100;
              const s = getUsageStatus(pct, { warning: 70, critical: 90 });
              const clamped = Math.min(Math.max(pct, 0), 100);
              return (
                <div
                  className="hud-gauge stat-section flex flex-col gap-2 border-t border-border/20 p-3 sm:p-4"
                  data-accent="traffic"
                  data-channel="traffic"
                  data-status={s}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="stat-chip stat-chip--traffic"><Gauge className="h-3 w-3" /></span>
                      <span className="type-hud-label truncate">
                        {t('label.traffic')} <span className="text-muted-foreground/60 normal-case">({formatTrafficType(node.traffic_limit_type!)})</span>
                      </span>
                    </div>
                    <span className={cn(
                      'text-xs font-metric font-bold tabular-nums leading-none flex-shrink-0',
                      s === 'critical' ? 'text-destructive' : s === 'warning' ? 'text-warning' : '',
                    )}>
                      {formatBytes(used)}
                      <span className="text-muted-foreground/60 mx-1">/</span>
                      <span className="text-muted-foreground/80">{formatBytes(node.traffic_limit!)}</span>
                    </span>
                  </div>
                  <div className="mt-auto hud-gauge__track-wrap">
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
            })()}
          </div>

          {expiryStatus && (
            <div className="network-stats-panel telemetry-panel overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  {appConfig.isLoggedIn ? (
                  <div className="stat-section flex min-w-0 flex-col gap-1 p-3 sm:p-4 cursor-default" data-accent="billing">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--billing"><Calendar className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.billing')}</span>
                      </div>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-metric font-bold tabular-nums leading-none text-primary ring-1 ring-primary/20">
                        {priceLabel}
                      </span>
                    </div>
                    <div className={cn(
                      'type-metric-lg tabular-nums leading-none',
                      expiryStatus === 'expired' ? 'text-destructive' : expiryStatus === 'warning' ? 'text-warning' : 'text-foreground/85',
                    )}>
                      {formatExpiryRelative(node.expired_at)}
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-auto pt-1 border-t border-border/15">
                      <span className="type-hud-label-sm tabular-nums">
                        {dayjs(node.expired_at).format('YYYY-MM-DD')}
                      </span>
                      {node.billing_cycle > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xxs font-mono text-muted-foreground/70">{node.billing_cycle}d</span>
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xxs font-mono',
                            node.auto_renewal ? 'text-success/80' : 'text-muted-foreground/50',
                          )}>
                            {node.auto_renewal ? (
                              <><RefreshCw className="h-2.5 w-2.5" aria-hidden />{t('label.autoRenewal')}</>
                            ) : t('label.manualRenewal')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="stat-section flex min-w-0 items-center justify-between gap-3 p-3 sm:p-4 cursor-default" data-accent="billing">
                    <div className="flex items-center gap-1.5">
                      <span className="stat-chip stat-chip--billing"><Calendar className="h-3 w-3" /></span>
                      <span className="type-hud-label">{t('label.billing')}</span>
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                      <span className={cn(
                        'type-metric-lg tabular-nums leading-none',
                        expiryStatus === 'expired' ? 'text-destructive' : expiryStatus === 'warning' ? 'text-warning' : 'text-foreground/85',
                      )}>
                        {formatExpiryRelative(node.expired_at)}
                      </span>
                      <span className="type-hud-label-sm tabular-nums">
                        {dayjs(node.expired_at).format('YYYY-MM-DD')}
                      </span>
                    </div>
                  </div>
                )}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="whitespace-pre-line text-xs">
                  {appConfig.isLoggedIn
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
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center min-h-[4.5rem] text-muted-foreground text-xs leading-relaxed px-2 text-center">
          {isOnline ? t('telemetry.waiting') : t('telemetry.nodeOffline')}
        </div>
      )}
      </div>
    </div>
  );
}
