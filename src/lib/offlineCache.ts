// Application-layer offline cache for the live monitoring data.
//
// Why an app-layer cache and not a Service Worker runtime cache?
//   • All RPC2 traffic is either WebSocket or a single POST to `/api/rpc2`.
//     SW caches don't see WebSockets at all and Workbox doesn't cache POSTs
//     by default (and even if forced, every call hits the same URL — no
//     usable cache key). See `vite.config.ts` for the SW denylist.
//   • Persisting the *latest snapshot* of nodes / statuses gives the user a
//     useful "last known state" view when offline or when the backend is
//     unreachable, which is what a server-monitoring PWA should do.
//
// The store uses a single localStorage key per dataset, with a small
// envelope `{v, t, data}` so we can:
//   – evolve schemas without breaking older clients (`v`),
//   – render "stale since X" UI hints (`t`),
//   – tolerate corrupted entries gracefully (parse → validate → discard).
import type { NodeData, NodeStats } from "../services/api"

const PREFIX = "commander:cache:"
const SCHEMA = 1

interface Envelope<T> {
  /** Schema version — bump if the persisted shape changes. */
  v: number
  /** Wall-clock time (ms epoch) when the snapshot was captured. */
  t: number
  /** Payload. */
  data: T
}

function readEnvelope<T>(key: string, validate: (data: unknown) => data is T): Envelope<T> | null {
  if (typeof window === "undefined") return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(PREFIX + key)
  } catch (err) {
    console.warn("[offlineCache] localStorage read blocked", err)
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Envelope<unknown>
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.t !== "number" ||
      parsed.v !== SCHEMA ||
      !validate(parsed.data)
    ) {
      // Outdated schema or corrupted — drop it so it doesn't keep raising
      // exceptions on every render.
      try {
        window.localStorage.removeItem(PREFIX + key)
      } catch {
        /* ignore */
      }
      return null
    }
    return { v: parsed.v, t: parsed.t, data: parsed.data }
  } catch (err) {
    console.warn("[offlineCache] failed to parse", key, err)
    try {
      window.localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeEnvelope<T>(key: string, data: T): number {
  if (typeof window === "undefined") return 0
  const t = Date.now()
  const envelope: Envelope<T> = { v: SCHEMA, t, data }
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(envelope))
  } catch (err) {
    // QuotaExceededError or private-mode storage block — non-fatal, the app
    // still functions, it just won't have an offline snapshot.
    console.warn("[offlineCache] localStorage write blocked", err)
  }
  return t
}

// ── Type guards ─────────────────────────────────────────────────────────
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

function isNodeDataArray(v: unknown): v is NodeData[] {
  if (!Array.isArray(v)) return false
  return v.every((n) => isObject(n) && typeof n.uuid === "string" && typeof n.name === "string")
}

function isStatsRecord(v: unknown): v is Record<string, NodeStats> {
  if (!isObject(v)) return false
  // Spot-check one entry — if it has the expected nested shape we trust it.
  const sample = Object.values(v)[0]
  if (sample === undefined) return true
  return (
    isObject(sample) &&
    isObject((sample as Record<string, unknown>).cpu) &&
    isObject((sample as Record<string, unknown>).ram)
  )
}

function isOnlineSet(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
}

// ── Public API ──────────────────────────────────────────────────────────

export interface CachedSnapshot<T> {
  data: T
  /** ms epoch when the snapshot was captured. */
  capturedAt: number
}

const NODES_KEY = "lastNodes"
const STATUSES_KEY = "lastStatuses"
const PUBLIC_KEY = "publicInfo"

export const offlineCache = {
  // ── Node list ────────────────────────────────────────────────────────
  getNodes(): CachedSnapshot<NodeData[]> | null {
    const env = readEnvelope<NodeData[]>(NODES_KEY, isNodeDataArray)
    return env ? { data: env.data, capturedAt: env.t } : null
  },
  setNodes(data: NodeData[]): number {
    if (data.length === 0) return 0 // never persist an empty result
    return writeEnvelope(NODES_KEY, data)
  },

  // ── Latest statuses (online list + per-node stats) ──────────────────
  getStatuses(): CachedSnapshot<{ online: string[]; data: Record<string, NodeStats> }> | null {
    const env = readEnvelope<{ online: string[]; data: Record<string, NodeStats> }>(
      STATUSES_KEY,
      (v): v is { online: string[]; data: Record<string, NodeStats> } =>
        isObject(v) && isOnlineSet((v as Record<string, unknown>).online) && isStatsRecord((v as Record<string, unknown>).data),
    )
    return env ? { data: env.data, capturedAt: env.t } : null
  },
  /**
   * Persist the latest WS snapshot. Throttled by `minIntervalMs` so the 2 s
   * polling tick doesn't synchronously serialise + write to disk on every
   * frame. Returns the timestamp written (0 when the call was throttled or
   * blocked).
   */
  setStatuses(
    online: string[],
    data: Record<string, NodeStats>,
    minIntervalMs = 10_000,
  ): number {
    if (online.length === 0 && Object.keys(data).length === 0) return 0
    if (Date.now() - lastStatusWrite < minIntervalMs) return 0
    const ts = writeEnvelope(STATUSES_KEY, { online, data })
    if (ts) lastStatusWrite = ts
    return ts
  },

  // ── Public settings ──────────────────────────────────────────────────
  getPublicInfo(): CachedSnapshot<Record<string, unknown>> | null {
    const env = readEnvelope<Record<string, unknown>>(PUBLIC_KEY, isObject)
    return env ? { data: env.data, capturedAt: env.t } : null
  },
  setPublicInfo(data: Record<string, unknown>): number {
    if (!data || Object.keys(data).length === 0) return 0
    return writeEnvelope(PUBLIC_KEY, data)
  },

  /** Wipe everything — useful for "log out" flows or troubleshooting. */
  clear(): void {
    if (typeof window === "undefined") return
    try {
      for (const k of [NODES_KEY, STATUSES_KEY, PUBLIC_KEY]) {
        window.localStorage.removeItem(PREFIX + k)
      }
    } catch {
      /* ignore */
    }
    lastStatusWrite = 0
  },
}

let lastStatusWrite = 0
