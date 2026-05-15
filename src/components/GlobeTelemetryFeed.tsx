import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, AlertTriangle, WifiOff, Link2, Minus } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';

/**
 * Single-Slot Telemetry Ticker
 * ─────────────────────────────
 * The bottom feed is a *narrative pulse*, not a verdict surface.
 *  - Verdict lives in the top KPI strip (avg CPU, alert tally) and the
 *    right-hand sidebar fleet status. This bar must NOT duplicate them.
 *  - At any moment, exactly ONE event is visible. It enters from the right,
 *    holds for ~3.5s, then leaves to the left while the next one rides in.
 *  - Idle queue → a calm "TELEMETRY STREAM IDLE" placeholder breathes.
 *  - Critical events (signal-lost OR cpu>90 / ram>95 first-cross) cut the line:
 *    they slot in right after the current item and compress the current
 *    item's remaining hold to ~1s.
 *  - First mount silently primes the prev-snapshot — no opening flood of
 *    `link-established` lines. We start narrating from the *next* tick.
 */

const HOLD_MS = 3500;            // normal per-item hold
const TRANSIT_MS = 600;          // crossfade duration
const CRITICAL_HOLD_TAIL_MS = 1000; // current item's remaining hold collapses to this on pre-empt
const QUEUE_LIMIT = 12;          // backpressure cap on pending items

type LogKind = 'signal-lost' | 'link-established' | 'delta' | 'critical';

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

interface FeedItem {
  id: number;
  ts: string;
  tag: string;
  kind: LogKind;
  critical: boolean; // true for signal-lost AND for resource criticals
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

export function GlobeTelemetryFeed({ nodes, enabled }: GlobeTelemetryFeedProps) {
  const { t } = useTranslation();

  // ─── Diff state (refs — they shouldn't trigger re-renders) ───────────────
  const prevSnapshotRef = useRef<
    Map<string, { status: string; cpu: number; ramPct: number }>
  >(new Map());
  const idRef = useRef(0);
  // Suppresses the very first diff pass: we record the snapshot but don't emit
  // any items, so opening the view doesn't dump a wall of LINK ESTABLISHED.
  const primedRef = useRef(false);

  // ─── Ticker state ────────────────────────────────────────────────────────
  const queueRef = useRef<FeedItem[]>([]);
  const [current, setCurrent] = useState<FeedItem | null>(null);
  const [leaving, setLeaving] = useState<FeedItem | null>(null); // crossfade peer
  const [, forceQueueTick] = useState(0); // re-render when queue size changes (idle marker)

  const holdTimerRef = useRef<number | null>(null);
  const transitTimerRef = useRef<number | null>(null);

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  // ─── Promotion: leaving = currentOld, current = next-from-queue ──────────
  const promoteNext = useCallback(() => {
    clearTimer(holdTimerRef);
    clearTimer(transitTimerRef);

    const next = queueRef.current.shift() ?? null;
    forceQueueTick(t => t + 1);

    setCurrent(prev => {
      setLeaving(prev); // old slides out (may be null on first promotion)
      // After TRANSIT_MS, drop the leaving peer and start the hold timer for `next`.
      transitTimerRef.current = window.setTimeout(() => {
        setLeaving(null);
        if (next) {
          holdTimerRef.current = window.setTimeout(promoteNext, HOLD_MS);
        }
      }, TRANSIT_MS);
      return next;
    });
  }, []);

  // ─── Enqueue with critical pre-emption ───────────────────────────────────
  const enqueue = useCallback(
    (items: FeedItem[]) => {
      if (items.length === 0) return;

      // Backpressure: drop oldest non-critical items first to make room.
      const q = queueRef.current;
      const incomingCritical = items.some(it => it.critical);

      for (const it of items) {
        if (it.critical) {
          // Find first non-critical and slot in front of it; otherwise append.
          const idx = q.findIndex(x => !x.critical);
          if (idx === -1) q.push(it);
          else q.splice(idx, 0, it);
        } else {
          q.push(it);
        }
      }

      // Trim queue: prefer dropping oldest non-critical entries.
      while (q.length > QUEUE_LIMIT) {
        const idx = q.findIndex(x => !x.critical);
        if (idx === -1) {
          q.shift();
        } else {
          q.splice(idx, 1);
        }
      }

      // If nothing is showing, start the show.
      if (current === null) {
        promoteNext();
        forceQueueTick(t => t + 1);
        return;
      }

      // If a critical just arrived and the current item is non-critical,
      // compress the current item's remaining hold so it leaves sooner.
      if (incomingCritical && !current.critical) {
        clearTimer(holdTimerRef);
        holdTimerRef.current = window.setTimeout(promoteNext, CRITICAL_HOLD_TAIL_MS);
      }

      forceQueueTick(t => t + 1);
    },
    [current, promoteNext],
  );

  // ─── Diff `nodes` → produce events ───────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const prev = prevSnapshotRef.current;
    const isFirstPass = !primedRef.current;
    const newItems: FeedItem[] = [];
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    for (const node of nodes) {
      // Keep the user-facing node name as-is; only clamp length so the slot
      // never overflows on extreme names. Casing intentionally preserved.
      const tag = node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name;
      const old = prev.get(node.uuid);

      if (node.status === 'offline') {
        if (!isFirstPass && (!old || old.status !== 'offline')) {
          newItems.push({
            id: ++idRef.current,
            ts,
            tag,
            kind: 'signal-lost',
            critical: true,
          });
        }
        prev.set(node.uuid, { status: 'offline', cpu: 0, ramPct: 0 });
        continue;
      }

      if (!node.stats) continue;
      const s = node.stats;
      const cpu = Math.round(s.cpu.usage);
      const ramPct = s.ram.total > 0 ? Math.round((s.ram.used / s.ram.total) * 100) : 0;
      const netUp = s.network.up;
      const netDown = s.network.down;

      if (!isFirstPass) {
        if (!old || old.status === 'offline') {
          newItems.push({
            id: ++idRef.current,
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
            newItems.push({
              id: ++idRef.current,
              ts,
              tag,
              kind: 'delta',
              critical: isCritical,
              payload: {
                cpu,
                cpuDelta,
                ramPct,
                ramDelta,
                netUp,
                netDown,
              } satisfies DeltaPayload,
            });
          } else if (isCritical && !(old.cpu > 90 || old.ramPct > 95)) {
            newItems.push({
              id: ++idRef.current,
              ts,
              tag,
              kind: 'critical',
              critical: true,
              payload: { cpu, ramPct } satisfies CriticalPayload,
            });
          }
        }
      }

      prev.set(node.uuid, { status: 'online', cpu, ramPct });
    }

    if (isFirstPass) {
      primedRef.current = true;
      return;
    }
    if (newItems.length > 0) enqueue(newItems);
  }, [nodes, enabled, enqueue]);

  // ─── Cleanup timers on unmount / disable ─────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimer(holdTimerRef);
      clearTimer(transitTimerRef);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearTimer(holdTimerRef);
      clearTimer(transitTimerRef);
      queueRef.current = [];
      setCurrent(null);
      setLeaving(null);
      primedRef.current = false;
      prevSnapshotRef.current.clear();
    }
  }, [enabled]);

  // ─── Render ──────────────────────────────────────────────────────────────
  // Disabled placeholder — same height so the globe stage doesn't jump.
  if (!enabled) {
    return (
      <div
        aria-hidden
        className="relative w-full px-3 sm:px-4 py-1.5 flex items-center gap-3 text-xxs font-mono pointer-events-none invisible"
      >
        <span className="globe-feed-label shrink-0 inline-flex items-center tracking-[0.2em] uppercase">
          <span className="globe-feed-label-tick" aria-hidden />
          <span className="globe-feed-label-text">FEED</span>
        </span>
      </div>
    );
  }

  const queueDepth = queueRef.current.length;
  const isIdle = current === null && leaving === null;
  // Heartbeat goes red when a critical is currently shown OR queued, so the
  // viewer's peripheral vision catches "something bad is in flight" even if
  // they aren't reading the row.
  const hasCriticalInFlight =
    (current?.critical ?? false) ||
    (leaving?.critical ?? false) ||
    queueRef.current.some(it => it.critical);

  return (
    <div className="globe-feed relative w-full px-3 sm:px-4 py-1.5 flex items-center gap-3 text-xxs font-mono overflow-hidden pointer-events-none">
      {/* Persistent scanline — proves "the channel is live" even during the
          3.5s hold when the row itself is static. */}
      <span className="globe-feed-scanline" aria-hidden />

      <span
        className={`globe-feed-label shrink-0 inline-flex items-center tracking-[0.2em] uppercase ${
          hasCriticalInFlight ? 'globe-feed-label-critical' : ''
        }`}
      >
        {/* Section-start tick: previously the unicode `▌` (U+258C) glyph,
            which sits high in the line box (no descender, glyph hugs
            cap-height) and made the whole left side read as visually
            higher than the right-side queue bars (which are bottom-aligned
            inside `h-3`). Replace with a CSS-drawn vertical bar whose
            height we control precisely so flex `items-center` aligns it
            against the queue bars' visual center, not the font's ascender. */}
        <span className="globe-feed-label-tick" aria-hidden />
        <span className="globe-feed-label-text">FEED</span>
      </span>

      {/* Single slot — uses a relatively positioned shell so leaving + entering
          peers can stack without affecting layout height. */}
      <div className="relative flex-1 min-w-0 h-5 flex items-center">
        {isIdle && (
          <span className="globe-feed-idle inline-flex items-center gap-2 text-muted-foreground/55">
            <span className="globe-feed-idle-dot" aria-hidden />
            <span className="uppercase tracking-[0.18em]">{t('hud.feed.idle')}</span>
          </span>
        )}

        {leaving && (
          <FeedRow
            key={`leave-${leaving.id}`}
            item={leaving}
            phase="leave"
            t={t}
          />
        )}
        {current && (
          <FeedRow
            key={`enter-${current.id}`}
            item={current}
            phase="enter"
            t={t}
          />
        )}
      </div>

      {/* Queue depth indicator — vertical equalizer-style bars instead of
          dots, so it doesn't echo the sidebar's pulsing online-status dots.
          Each bar's height + opacity encodes depth (0/1/2/3+). The bars
          gently "breathe" out of phase to read as live signal level.

          Container height (h-3 = 12px) intentionally matches the FEED tick
          on the far left, NOT the middle row's h-5. The outer flex
          `items-center` then drops both clusters onto the same horizontal
          centerline, regardless of how tall the middle row's text line-box
          renders. Bars use `items-end` and 100% height when lit, so a lit
          bar's geometric center equals the container's center — no visual
          drift between "container centered in row" and "bar centered in
          container". This is the configuration that read as aligned to the
          eye in early designs. */}
      <span
        className={`globe-feed-queue shrink-0 hidden sm:inline-flex items-end gap-0.75 h-3 ${
          hasCriticalInFlight ? 'globe-feed-queue-critical' : ''
        }`}
        aria-hidden
      >
        {[0, 1, 2].map(i => {
          const lit = queueDepth > i;
          return (
            <span
              key={i}
              className={`globe-feed-queue-bar ${lit ? 'is-lit' : ''}`}
              style={{ animationDelay: `${i * 0.22}s` }}
            />
          );
        })}
        {queueDepth > 3 && (
          <span className="ml-1 font-metric text-[0.6rem] tabular-nums opacity-70 self-center leading-none">
            +{queueDepth - 3}
          </span>
        )}
      </span>
    </div>
  );
}

/* ─────────── Single row (entering or leaving) ─────────── */

interface FeedRowProps {
  item: FeedItem;
  phase: 'enter' | 'leave';
  t: ReturnType<typeof useTranslation>['t'];
}

function FeedRow({ item, phase, t }: FeedRowProps) {
  return (
    <span
      className={`globe-feed-row absolute inset-0 inline-flex items-center gap-1.5 whitespace-nowrap ${
        phase === 'enter' ? 'globe-feed-row-enter' : 'globe-feed-row-leave'
      } ${item.critical ? 'text-destructive/85' : 'text-foreground/65'}`}
    >
      {/* One-shot sweep highlight on entering rows — reads as "this is fresh".
          Does nothing on leaving rows or in clean / reduced-motion. */}
      {phase === 'enter' && <span className="globe-feed-row-sweep" aria-hidden />}
      <span className={item.critical ? 'text-destructive/55' : 'text-primary/40'}>
        [{item.ts}]
      </span>
      <span
        className={`tracking-tight ${
          item.critical ? 'text-destructive font-semibold' : 'text-primary/85 font-semibold'
        }`}
      >
        {item.tag}
      </span>
      <span className="text-muted-foreground/45">::</span>
      <LogBody item={item} t={t} />
    </span>
  );
}

/* ─────────── Body renderer (per-kind) ─────────── */

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <ArrowUp
        className="inline h-2.5 w-2.5 -mt-px"
        style={{ color: 'var(--chart-5, var(--destructive))' }}
      />
    );
  if (delta < 0)
    return (
      <ArrowDown
        className="inline h-2.5 w-2.5 -mt-px"
        style={{ color: 'var(--chart-2, var(--success))' }}
      />
    );
  return <Minus className="inline h-2.5 w-2.5 -mt-px opacity-60" />;
}

function LogBody({ item, t }: { item: FeedItem; t: ReturnType<typeof useTranslation>['t'] }) {
  switch (item.kind) {
    case 'signal-lost':
      return (
        <span className="inline-flex items-center gap-1">
          <WifiOff className="h-2.5 w-2.5 motion-safe:animate-pulse" />
          <span className="uppercase tracking-[0.12em]">{t('hud.feed.signalLost')}</span>
        </span>
      );
    case 'link-established': {
      const p = item.payload as LinkPayload;
      return (
        <span className="inline-flex items-center gap-1">
          <Link2 className="h-2.5 w-2.5" style={{ color: 'var(--success)' }} />
          <span className="uppercase tracking-[0.12em]">{t('hud.feed.linkEstablished')}</span>
          <span className="text-muted-foreground/45">·</span>
          <span className="font-metric tabular-nums">CPU {String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span className="font-metric tabular-nums">RAM {String(p.ramPct).padStart(3)}%</span>
        </span>
      );
    }
    case 'delta': {
      const p = item.payload as DeltaPayload;
      return (
        <span className="inline-flex items-center gap-1 font-metric tabular-nums">
          <span>CPU</span>
          <DeltaArrow delta={p.cpuDelta} />
          <span>{String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span>RAM</span>
          <DeltaArrow delta={p.ramDelta} />
          <span>{String(p.ramPct).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <ArrowUp
            className="inline h-2.5 w-2.5 -mt-px"
            style={{ color: 'var(--chart-2)' }}
          />
          <span>{fmtSpeed(p.netUp)}</span>
          <ArrowDown
            className="inline h-2.5 w-2.5 -mt-px"
            style={{ color: 'var(--chart-1)' }}
          />
          <span>{fmtSpeed(p.netDown)}</span>
        </span>
      );
    }
    case 'critical': {
      const p = item.payload as CriticalPayload;
      return (
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5 motion-safe:animate-pulse" />
          <span className="uppercase tracking-[0.12em]">{t('hud.feed.critical')}</span>
          <span className="text-muted-foreground/45">·</span>
          <span className="font-metric tabular-nums">CPU {String(p.cpu).padStart(3)}%</span>
          <span className="text-muted-foreground/45">·</span>
          <span className="font-metric tabular-nums">RAM {String(p.ramPct).padStart(3)}%</span>
        </span>
      );
    }
  }
}
