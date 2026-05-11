import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, AlertTriangle, WifiOff, Link2, Minus } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';

const MAX_LOG_LINES = 60;

type LogKind =
  | 'signal-lost'
  | 'link-established'
  | 'delta'
  | 'critical';

interface DeltaPayload {
  cpu: number;
  cpuDelta: number;
  ramPct: number;
  ramDelta: number;
  netUp: number;
  netDown: number;
}

interface LinkPayload {
  cpu: number;
  ramPct: number;
}

interface CriticalPayload {
  cpu: number;
  ramPct: number;
}

interface LogLine {
  id: number;
  ts: string;
  tag: string;
  kind: LogKind;
  critical: boolean;
  payload?: DeltaPayload | LinkPayload | CriticalPayload;
}

function fmtSpeed(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'G';
  if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M';
  if (b >= 1024) return (b / 1024).toFixed(0) + 'K';
  return b.toFixed(0) + 'B';
}

interface GlobeTelemetryFeedProps {
  nodes: NodeWithStatus[];
  enabled: boolean;
}

/**
 * Bottom-spanning telemetry feed (single line, marquee-like, append-only).
 * Replaces the old hidden-xl angle-tucked feed.
 * Higher contrast than before so it actually reads on lumina.
 */
export function GlobeTelemetryFeed({ nodes, enabled }: GlobeTelemetryFeedProps) {
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const prevSnapshotRef = useRef<
    Map<string, { status: string; cpu: number; ramPct: number; netUp: number; netDown: number }>
  >(new Map());
  const logIdRef = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const prev = prevSnapshotRef.current;
    const newLines: LogLine[] = [];
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    for (const node of nodes) {
      const tag = node.name.substring(0, 12).toUpperCase();
      const old = prev.get(node.uuid);

      if (node.status === 'offline') {
        if (!old || old.status !== 'offline') {
          newLines.push({
            id: ++logIdRef.current,
            ts,
            tag,
            kind: 'signal-lost',
            critical: true,
          });
        }
        prev.set(node.uuid, { status: 'offline', cpu: 0, ramPct: 0, netUp: 0, netDown: 0 });
        continue;
      }

      if (!node.stats) continue;
      const s = node.stats;
      const cpu = Math.round(s.cpu.usage);
      const ramPct = s.ram.total > 0 ? Math.round((s.ram.used / s.ram.total) * 100) : 0;
      const netUp = s.network.up;
      const netDown = s.network.down;

      if (!old || old.status === 'offline') {
        newLines.push({
          id: ++logIdRef.current,
          ts,
          tag,
          kind: 'link-established',
          critical: false,
          payload: { cpu, ramPct } satisfies LinkPayload,
        });
      } else {
        const cpuDelta = cpu - old.cpu;
        const ramDelta = ramPct - old.ramPct;
        const isCritical = cpu > 90 || ramPct > 95;

        if (Math.abs(cpuDelta) >= 4 || Math.abs(ramDelta) >= 4) {
          newLines.push({
            id: ++logIdRef.current,
            ts,
            tag,
            kind: 'delta',
            critical: isCritical,
            payload: { cpu, cpuDelta, ramPct, ramDelta, netUp, netDown } satisfies DeltaPayload,
          });
        } else if (isCritical && !(old.cpu > 90 || old.ramPct > 95)) {
          newLines.push({
            id: ++logIdRef.current,
            ts,
            tag,
            kind: 'critical',
            critical: true,
            payload: { cpu, ramPct } satisfies CriticalPayload,
          });
        }
      }

      prev.set(node.uuid, { status: 'online', cpu, ramPct, netUp, netDown });
    }

    if (newLines.length === 0) return;

    setLogLines(lines => {
      const total = lines.length + newLines.length;
      if (total <= MAX_LOG_LINES) return lines.concat(newLines);
      const drop = total - MAX_LOG_LINES;
      return lines.slice(drop).concat(newLines);
    });
  }, [nodes, enabled]);

  // Auto-scroll to newest (right edge of single-row track)
  useEffect(() => {
    if (!enabled) return;
    const el = feedRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
    return () => cancelAnimationFrame(id);
  }, [logLines, enabled]);

  // Render an empty, equal-height placeholder when disabled so the parent
  // stage's available height (and therefore the cobe canvas size) stays
  // identical across themes. Without this, the clean theme's stage would be
  // ~27px taller, producing a visibly larger globe when switching themes.
  if (!enabled) {
    return (
      <div
        aria-hidden
        className="relative w-full px-3 sm:px-4 py-1.5 flex items-center gap-3 text-xxs font-mono pointer-events-none invisible"
      >
        <span className="shrink-0 tracking-[0.2em] uppercase">▌FEED</span>
      </div>
    );
  }

  return (
    <div className="globe-feed relative w-full px-3 sm:px-4 py-1.5 flex items-center gap-3 text-xxs font-mono overflow-hidden pointer-events-none">
      <span className="shrink-0 text-primary/55 tracking-[0.2em] uppercase">
        ▌FEED
      </span>
      <div
        ref={feedRef}
        className="flex-1 min-w-0 overflow-x-hidden whitespace-nowrap flex items-center gap-4"
      >
        {logLines.length === 0 ? (
          <span className="text-muted-foreground/45">… awaiting stream …</span>
        ) : (
          logLines.map(line => (
            <span
              key={line.id}
              className={`inline-flex items-center gap-1.5 shrink-0 ${line.critical ? 'text-destructive/80' : 'text-foreground/55'}`}
            >
              <span className="text-primary/40">[{line.ts}]</span>
              <span className={line.critical ? 'text-destructive' : 'text-primary/70'}>
                {line.tag}
              </span>
              <span className="text-muted-foreground/45">::</span>
              <LogBody line={line} />
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────── Line body renderer ─────────── */

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUp className="inline h-2.5 w-2.5 -mt-px" style={{ color: 'var(--chart-5, var(--destructive))' }} />;
  if (delta < 0) return <ArrowDown className="inline h-2.5 w-2.5 -mt-px" style={{ color: 'var(--chart-2, var(--success))' }} />;
  return <Minus className="inline h-2.5 w-2.5 -mt-px opacity-60" />;
}

function LogBody({ line }: { line: LogLine }) {
  switch (line.kind) {
    case 'signal-lost':
      return (
        <span className="inline-flex items-center gap-1">
          <WifiOff className="h-2.5 w-2.5" />
          <span>SIGNAL LOST</span>
        </span>
      );
    case 'link-established': {
      const p = line.payload as LinkPayload;
      return (
        <span className="inline-flex items-center gap-1">
          <Link2 className="h-2.5 w-2.5" style={{ color: 'var(--success)' }} />
          <span>LINK ESTABLISHED</span>
          <span className="text-muted-foreground/45">·</span>
          <span>CPU {String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span>RAM {String(p.ramPct).padStart(3)}%</span>
        </span>
      );
    }
    case 'delta': {
      const p = line.payload as DeltaPayload;
      return (
        <span className="inline-flex items-center gap-1">
          <span>CPU</span>
          <DeltaArrow delta={p.cpuDelta} />
          <span>{String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span>RAM</span>
          <DeltaArrow delta={p.ramDelta} />
          <span>{String(p.ramPct).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <ArrowUp className="inline h-2.5 w-2.5 -mt-px" style={{ color: 'var(--chart-2)' }} />
          <span>{fmtSpeed(p.netUp)}</span>
          <ArrowDown className="inline h-2.5 w-2.5 -mt-px" style={{ color: 'var(--chart-1)' }} />
          <span>{fmtSpeed(p.netDown)}</span>
        </span>
      );
    }
    case 'critical': {
      const p = line.payload as CriticalPayload;
      return (
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5 motion-safe:animate-pulse" />
          <span>CRITICAL</span>
          <span className="text-muted-foreground/45">·</span>
          <span>CPU {String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span>RAM {String(p.ramPct).padStart(3)}%</span>
        </span>
      );
    }
  }
}
