import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from '@/components/Globe';
import { Sidebar } from '@/components/Sidebar';
import { HudSpinner } from './HudSpinner';
import { useTheme } from '@/hooks/useTheme';
import type { NodeWithStatus } from '@/services/api';

const MAX_LOG_LINES = 50;

interface LogLine {
  id: number;
  text: string;
  critical: boolean;
}

function fmtSpeed(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'G';
  if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M';
  if (b >= 1024) return (b / 1024).toFixed(0) + 'K';
  return b.toFixed(0) + 'B';
}

interface GlobeViewProps {
  nodes: NodeWithStatus[];
  loading?: boolean;
  onViewCharts: (uuid: string, name: string) => void;
}

export function GlobeView({ nodes, loading = false, onViewCharts }: GlobeViewProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Rolling log stream state
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const prevSnapshotRef = useRef<Map<string, { status: string; cpu: number; ramPct: number; netUp: number; netDown: number }>>(new Map());
  const logIdRef = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = prevSnapshotRef.current;
    const newLines: LogLine[] = [];
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    for (const node of nodes) {
      const tag = node.name.substring(0, 8).toUpperCase();
      const old = prev.get(node.uuid);

      if (node.status === 'offline') {
        if (!old || old.status !== 'offline') {
          newLines.push({ id: ++logIdRef.current, text: `[${ts}] ${tag} :: SIGNAL LOST`, critical: true });
        }
        prev.set(node.uuid, { status: 'offline', cpu: 0, ramPct: 0, netUp: 0, netDown: 0 });
        continue;
      }

      if (!node.stats) continue;
      const s = node.stats;
      const cpu = Math.round(s.cpu.usage);
      const ramPct = Math.round((s.ram.used / s.ram.total) * 100);
      const netUp = s.network.up;
      const netDown = s.network.down;

      if (!old || old.status === 'offline') {
        // Node just came online
        newLines.push({ id: ++logIdRef.current, text: `[${ts}] ${tag} :: ONLINE | CPU ${String(cpu).padStart(3)}% | RAM ${String(ramPct).padStart(3)}%`, critical: false });
      } else {
        // Detect meaningful changes
        const cpuDelta = cpu - old.cpu;
        const ramDelta = ramPct - old.ramPct;
        const isCritical = cpu > 90 || ramPct > 95;

        if (Math.abs(cpuDelta) >= 3 || Math.abs(ramDelta) >= 3) {
          const cpuArrow = cpuDelta > 0 ? '▲' : cpuDelta < 0 ? '▼' : '=';
          const ramArrow = ramDelta > 0 ? '▲' : ramDelta < 0 ? '▼' : '=';
          newLines.push({
            id: ++logIdRef.current,
            text: `[${ts}] ${tag} :: CPU ${cpuArrow}${String(cpu).padStart(3)}% | RAM ${ramArrow}${String(ramPct).padStart(3)}% | ▲${fmtSpeed(netUp)} ▼${fmtSpeed(netDown)}`,
            critical: isCritical,
          });
        } else if (isCritical && !(old.cpu > 90 || old.ramPct > 95)) {
          // Just crossed into critical
          newLines.push({
            id: ++logIdRef.current,
            text: `[${ts}] ${tag} :: ⚠ CRITICAL | CPU ${String(cpu).padStart(3)}% | RAM ${String(ramPct).padStart(3)}%`,
            critical: true,
          });
        }
      }

      prev.set(node.uuid, { status: 'online', cpu, ramPct, netUp, netDown });
    }

    if (newLines.length > 0) {
      setLogLines(lines => [...lines, ...newLines].slice(-MAX_LOG_LINES));
    }
  }, [nodes]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [logLines]);

  return (
    <div className="relative z-10 flex flex-col lg:flex-row gap-4 w-full h-[calc(100vh-theme(spacing.12)-theme(spacing.9)-2rem)] sm:h-[calc(100vh-theme(spacing.12)-theme(spacing.9)-3rem)]">
      {/* Globe — Main */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative commander-corners z-30">
        <span className="corner-bottom" />
        
        {/* DeepSpace Visuals */}
        {theme === 'deepspace' && (
          <>
            <div className="deepspace-nebula" />
            <div className="deepspace-grid" />
            <div className="deepspace-circles" style={{ width: '90%', height: '90%' }} />
            <div className="deepspace-circles" style={{ width: '70%', height: '70%', animationDelay: '-5s' }} />
            
            {/* Live Telemetry Stream for DeepSpace */}
            <div
              ref={feedRef}
              className="absolute bottom-4 left-4 h-40 w-64 overflow-hidden pointer-events-none hidden xl:flex flex-col-reverse z-20"
            >
              <div className="flex flex-col gap-1 text-xxs font-mono leading-tight">
                {logLines.map(line => (
                  <div
                    key={line.id}
                    className={`whitespace-nowrap transition-opacity duration-500 ${line.critical ? 'text-red-400/50' : 'text-primary/30'}`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Lumina Lab Visuals */}
        {theme === 'lumina' && (
          <>
            {/* Hex grid background */}
            <div className="lumina-hex-grid" />

            {/* Holographic orbit rings */}
            <div className="lumina-orbit" style={{ width: '85%', height: '85%' }} />
            <div className="lumina-orbit lumina-orbit-reverse" style={{ width: '65%', height: '65%', animationDelay: '-3s' }} />

            {/* Data pulse ring */}
            <div className="lumina-pulse-ring" />

            {/* Live Telemetry Stream for Lumina */}
            <div
              ref={feedRef}
              className="absolute bottom-4 left-4 h-36 w-60 overflow-hidden pointer-events-none hidden xl:flex flex-col-reverse z-20"
            >
              <div className="flex flex-col gap-1 text-xxs font-mono leading-tight">
                {logLines.map(line => (
                  <div
                    key={line.id}
                    className={`whitespace-nowrap transition-opacity duration-500 ${line.critical ? 'text-red-500/40' : 'text-primary/35'}`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </div>


          </>
        )}

        {/* Radar Background */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="radar-scan" />
          {/* Radial grids */}
          <div className="absolute w-[60%] aspect-square border border-primary/10 rounded-full" />
          <div className="absolute w-[40%] aspect-square border border-primary/10 rounded-full" />
          <div className="absolute w-[20%] aspect-square border border-primary/10 rounded-full" />
        </div>

        {/* HUD Decorations — Top Left */}
        <div className="absolute top-4 left-4 z-20 pointer-events-none">
          <div className="text-xs font-mono text-primary/40 uppercase tracking-[0.2em] mb-1">
            {theme === 'lumina' ? t('hud.labMonitor') : t('hud.orbitalMonitoring')}
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-4 h-0.5 bg-primary/20" />
            ))}
          </div>
        </div>

        {/* HUD Decorations — Bottom Right */}
        <div className="absolute bottom-4 right-4 z-20 pointer-events-none text-right">
          <div className="text-xs font-mono text-primary/40 uppercase tracking-[0.2em] mb-1">{t('hud.globalTelemetry')}</div>
          <div className="flex gap-1 justify-end">
            <div className="w-16 h-0.5 bg-primary/20" />
          </div>
        </div>

        {/* Threat Detection - Critical Nodes */}
        {nodes.some(n => n.status === 'online' && (
          (n.stats?.cpu.usage ?? 0) > 90 || 
          (n.stats ? (n.stats.ram.used / n.stats.ram.total) > 0.95 : false)
        )) && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
            <div className="text-xs font-mono text-red-500/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {t('hud.activeThreats')}
            </div>
            <div className="space-y-1">
              {nodes.filter(n => n.status === 'online' && (
                (n.stats?.cpu.usage ?? 0) > 90 || 
                (n.stats ? (n.stats.ram.used / n.stats.ram.total) > 0.95 : false)
              )).slice(0, 3).map(node => (
                <div key={node.uuid} className="text-xxs font-mono text-red-400/50 flex gap-2 items-center">
                  <span className="bg-red-500/10 px-1 border border-red-500/20">{node.name.substring(0, 10)}</span>
                  <span className="animate-pulse">{" >> "}{t('hud.criticalLoad')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Globe
          nodes={nodes}
          theme={theme}
          selectedNodeId={selectedNodeId}
          className="w-full h-full"
        />

        {/* Loading overlay */}
        {loading && nodes.length === 0 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/30 backdrop-blur-sm">
            <HudSpinner size="lg" />
            <div className="mt-4 text-xs font-mono text-primary/60 uppercase tracking-[0.15em]">
              {t('telemetry.acquiring')}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        nodes={nodes}
        loading={loading}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onViewCharts={onViewCharts}
        className="w-full lg:w-[22rem] h-[50%] sm:h-[55%] lg:h-full shrink-0"
      />
    </div>
  );
}
