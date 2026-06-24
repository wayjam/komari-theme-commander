import { Suspense, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { NodeInfoPanel } from '@/components/NodeInfoPanel';
import { RegionFlag } from '@/components/RegionFlag';
import { ChartsRouteFallback } from '@/components/ViewLoadingFallback';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNodesContext } from '@/contexts/NodesContext';
import { useAppConfig } from '@/hooks/useAppConfig';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { NodeCharts } from '@/lib/lazyViews';
import { cn } from '@/lib/utils';
import { apiService } from '@/services/api';

export function NodeDetailPage() {
  const { t } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { nodes } = useNodesContext();
  const appConfig = useAppConfig();
  const { maskName } = usePrivacyMode();
  const node = nodes.find(n => n.uuid === uuid);
  const [nodeName, setNodeName] = useState('');

  useEffect(() => {
    if (node) {
      setNodeName(node.name);
    } else if (uuid) {
      apiService.getNodes().then(all => {
        const found = all.find(n => n.uuid === uuid);
        if (found) setNodeName(found.name);
      });
    }
  }, [uuid, node]);

  const displayName = uuid ? maskName(uuid, nodeName) : nodeName;
  const isOnline = node?.status === 'online';
  const lastReport = node?.stats?.updated_at;
  const nodeTitle = (
    <h1 className="text-sm sm:text-base font-display font-bold truncate max-w-[60vw] sm:max-w-md">
      {displayName || uuid}
    </h1>
  );
  const renderIpChip = (
    label: 'IPv4' | 'IPv6',
    value: string | undefined,
    className: string,
  ) => {
    const ip = value?.trim();
    if (!ip) return null;

    const chip = (
      <span className={cn(
        'text-xxs font-mono font-bold px-1.5 py-0.5 rounded cursor-default shrink-0',
        className,
      )}>
        {label}
      </span>
    );

    if (!appConfig.isLoggedIn) return chip;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {chip}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs font-mono select-all break-all">
          {label}: {ip}
        </TooltipContent>
      </Tooltip>
    );
  };

  if (!uuid) return null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden />
          {t('action.back')}
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xxs font-mono text-muted-foreground/50 uppercase tracking-[0.2em]">NODE</span>
          <span className="text-xxs font-mono text-muted-foreground/30">/</span>
          {node && (
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                isOnline ? 'bg-success motion-safe:animate-pulse' : 'bg-destructive',
              )}
              aria-hidden
            />
          )}
          {node?.region && <RegionFlag region={node.region} size="lg" tooltipSide="bottom" />}
          {node && appConfig.isLoggedIn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {nodeTitle}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono select-all">UUID: {node.uuid}</TooltipContent>
            </Tooltip>
          ) : nodeTitle}
          {node && (
            isOnline && lastReport ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded cursor-default shrink-0 bg-success/15 text-success">
                    {t('status.online')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {t('label.lastReport')}: {new Date(lastReport).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className={cn(
                'text-xxs font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
                isOnline ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
              )}>
                {isOnline ? t('status.online') : t('status.offline')}
              </span>
            )
          )}
          {renderIpChip('IPv4', node?.ipv4, 'bg-chart-7/15 text-chart-7 ring-1 ring-chart-7/25')}
          {renderIpChip('IPv6', node?.ipv6, 'bg-chart-6/15 text-chart-6 ring-1 ring-chart-6/25')}
        </div>
      </div>

      {node && <NodeInfoPanel node={node} />}

      <Suspense fallback={<ChartsRouteFallback />}>
        <NodeCharts nodeUuid={uuid} nodeName={displayName} />
      </Suspense>
    </div>
  );
}
