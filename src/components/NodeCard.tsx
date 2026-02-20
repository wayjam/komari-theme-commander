import { Sparkline } from './Sparkline';
import { useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { useRecentStats } from '@/hooks/useRecentStats';
import { formatBytes, formatSpeed, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface NodeCardProps {
  node: NodeWithStatus;
  onViewCharts?: (nodeUuid: string, nodeName: string) => void;
}

function HudGauge({ label, value, unit = '%', status, total }: { label: string; value: number; unit?: string; status: 'normal' | 'warning' | 'critical'; total?: string }) {
  const barColor = status === 'critical' ? 'bg-red-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-primary';
  const textColor = status === 'critical' ? 'text-red-500' : status === 'warning' ? 'text-yellow-500' : '';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className={cn('text-xs font-mono font-bold tabular-nums', textColor)}>
            {value.toFixed(1)}{unit}
          </span>
          {total && <span className="text-xxs font-mono text-muted-foreground/50">{total}</span>}
        </span>
      </div>
      <div className="h-[3px] w-full bg-muted/40 rounded-full overflow-hidden relative">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
        {/* Subtle segments for non-clean themes */}
        <div className="absolute inset-0 flex justify-between px-[10%] pointer-events-none opacity-20 [data-theme='clean']:hidden">
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
        </div>
      </div>
    </div>
  );
}

function TrafficBar({ totalUp, totalDown, limit, type, label }: { totalUp: number; totalDown: number; limit: number; type: TrafficLimitType; label: string }) {
  const used = calcTrafficUsage(totalUp, totalDown, type);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const status = getUsageStatus(pct, { warning: 70, critical: 90 });
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">{label} ({formatTrafficType(type)})</span>
        <span className={cn(
          'text-xs font-mono font-bold tabular-nums',
          status === 'critical' ? 'text-red-500' : status === 'warning' ? 'text-yellow-500' : '',
        )}>
          {formatBytes(used)} / {formatBytes(limit)}
        </span>
      </div>
      <div className="h-[3px] w-full bg-muted/40 rounded-full overflow-hidden relative">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            status === 'critical' ? 'bg-red-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-primary',
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {/* Subtle segments */}
        <div className="absolute inset-0 flex justify-between px-[10%] pointer-events-none opacity-20 [data-theme='clean']:hidden">
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
          <div className="w-[1px] h-full bg-background" />
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
    if (!node.tags) return [];
    return node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean);
  }, [node.tags]);

  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;

  const cpuStatus = getUsageStatus(cpuUsage, { warning: 60, critical: 80 });
  const ramStatus = getUsageStatus(ramUsage, { warning: 70, critical: 85 });
  const diskStatus = getUsageStatus(diskUsage, { warning: 75, critical: 90 });

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-lg border bg-card/80 backdrop-blur-xl transition-all duration-300',
      'hover:shadow-lg hover:shadow-primary/5 commander-corners',
      isOnline ? 'border-border/50' : 'border-border/30 opacity-70 offline-card'
    )}>
      <div className="commander-scanner-effect" />
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
      <div className="p-3 pb-2 relative z-10">
        <div className="min-w-0 space-y-1">
          {/* Node name row */}
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            <span className="text-base flex-shrink-0">{node.region}</span>
            <h3
              className={cn(
                "text-base font-display font-bold truncate cursor-pointer hover:text-primary transition-colors",
                (cpuStatus === 'critical' || ramStatus === 'critical') && "text-red-500"
              )}
              onClick={() => navigate(`/node/${node.uuid}`)}
            >{node.name}</h3>
            
            {isLoggedIn && node.price !== -1 && (() => {
              const expiryStatus = getExpiryStatus(node.expired_at);
              if (!expiryStatus) return null;
              return (
                <span className={cn(
                  'text-xxs leading-none font-mono px-1.5 py-0.5 rounded-sm flex-shrink-0 border',
                  expiryStatus === 'expired'
                    ? 'text-red-500 bg-red-500/10 border-red-500/20'
                    : expiryStatus === 'warning'
                      ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                      : 'text-muted-foreground/60 bg-muted/20 border-border/20',
                )}>
                  {formatExpiry(node.expired_at)}
                </span>
              );
            })()}

            {(cpuStatus === 'critical' || ramStatus === 'critical') && (
              <div className="flex items-center gap-1 text-xs font-mono text-red-500 font-bold animate-pulse ml-auto">
                <AlertTriangle className="h-3 w-3" />
              </div>
            )}
          </div>
          {/* Tags row */}
          <div className="flex items-center gap-2 ml-4 flex-wrap">
            {node.group && (
              <span className="text-xs font-mono text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                {node.group}
              </span>
            )}
            {tagList.map((tag, i) => (
              <span key={i} className="text-xs font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-sm">
                {tag}
              </span>
            ))}
            {node.hidden && (
              <span className="text-xs font-mono text-yellow-500/80 bg-yellow-500/15 px-1.5 py-0.5 rounded-sm">
                {t('node.hidden')}
              </span>
            )}
          </div>
          {/* System info row */}
          {(node.os || node.arch) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs font-mono text-muted-foreground/50 truncate ml-4 cursor-default">
                  {node.os}{node.os && node.arch && ' · '}{node.virtualization && `${node.virtualization}/`}{node.arch}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
                {[node.cpu_name && `CPU: ${node.cpu_name} (${node.cpu_cores}C)`, node.os && `OS: ${node.os}`, node.arch && `Arch: ${node.arch}`, node.virtualization && `Virt: ${node.virtualization}`, node.kernel_version && `Kernel: ${node.kernel_version}`].filter(Boolean).join('\n')}
              </TooltipContent>
            </Tooltip>
          )}
          {node.public_remark && (
            <p className="text-xs font-mono text-muted-foreground/70 ml-4 line-clamp-1">
              {node.public_remark}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 relative z-10">
        {stats ? (
          <div className="space-y-2">
            {/* Resource gauges */}
            <div className="space-y-1.5">
              <HudGauge label={t('label.cpu')} value={cpuUsage} status={cpuStatus} total={`${node.cpu_cores}C`} />
              <HudGauge label={t('label.ram')} value={ramUsage} status={ramStatus} total={formatBytes(stats.ram.total)} />
              <HudGauge label={t('label.disk')} value={diskUsage} status={diskStatus} total={formatBytes(stats.disk.total)} />
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
              <div className="flex items-center gap-2 pt-0.5">
              <span className="text-xxs font-mono text-muted-foreground">{t('label.cpu1m')}</span>
                <Sparkline data={cpuSparkline} width={80} height={18} />
              </div>
            )}

            {/* Data grid — 4 columns HUD */}
            <div className="grid grid-cols-4 gap-1 pt-1">
              <div className="text-center p-1.5 rounded bg-muted/20 border border-border/20 hud-data-cell">
                <div className="text-xs font-mono text-muted-foreground">{t('label.load')}</div>
                <div className="text-xs font-mono font-bold tabular-nums">{stats.load.load1.toFixed(2)}</div>
              </div>
              <div className="text-center p-1.5 rounded bg-muted/20 border border-border/20 hud-data-cell">
                <div className="text-xs font-mono text-muted-foreground">{t('label.netUp')}</div>
                <div className="text-xs font-mono font-bold tabular-nums">{formatSpeed(stats.network.up).replace('/s','')}</div>
                <div className="text-xxs font-mono text-muted-foreground/50">{formatBytes(stats.network.totalUp)}</div>
              </div>
              <div className="text-center p-1.5 rounded bg-muted/20 border border-border/20 hud-data-cell">
                <div className="text-xs font-mono text-muted-foreground">{t('label.netDown')}</div>
                <div className="text-xs font-mono font-bold tabular-nums">{formatSpeed(stats.network.down).replace('/s','')}</div>
                <div className="text-xxs font-mono text-muted-foreground/50">{formatBytes(stats.network.totalDown)}</div>
              </div>
              <div className="text-center p-1.5 rounded bg-muted/20 border border-border/20 hud-data-cell">
                <div className="text-xs font-mono text-muted-foreground">{t('label.up')}</div>
                <div className="text-xs font-mono font-bold tabular-nums">{formatUptime(stats.uptime)}</div>
              </div>
            </div>


          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-20 text-muted-foreground text-xs font-mono gap-1.5">
            <span className="no-signal-pulse uppercase tracking-widest text-muted-foreground/60">{t('telemetry.noData')}</span>
          </div>
        )}
      </div>
    </div>
  );
});
