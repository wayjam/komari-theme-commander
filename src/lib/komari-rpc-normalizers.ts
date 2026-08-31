import type { RPC2NodeData, RPC2PingRecord, RPC2StatusRecord } from '@/lib/rpc2';

type RecordWithTime = { time?: unknown; client?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Komari 1.4.3 serializes time.Time as an RFC3339 string. Normalising all
 * accepted timestamp strings to UTC also keeps legacy offset timestamps from
 * creating duplicate buckets during deduplication.
 */
export function normalizeRpcTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return undefined;
  return timestamp.toISOString();
}

/** Normalize a collection that may be an array or a UUID-keyed RPC map. */
function flattenRecords<T extends RecordWithTime>(
  raw: unknown,
  requestedUuid: string,
  getRecordKey: (record: T) => string = record => String(record.time),
): T[] {
  const entries: T[] = [];

  const append = (value: unknown, fallbackClient?: string) => {
    if (!isRecord(value)) return;
    const record = { ...value } as T;
    if (!record.client && fallbackClient) record.client = fallbackClient;
    if (!record.client) record.client = requestedUuid;
    const timestamp = normalizeRpcTimestamp(record.time);
    if (!timestamp) return;
    record.time = timestamp;
    entries.push(record);
  };

  if (Array.isArray(raw)) {
    raw.forEach(value => append(value));
  } else if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        value.forEach(item => append(item, key));
      } else {
        append(value, key);
      }
    }
  }

  const deduplicated = new Map<string, T>();
  for (const record of entries) {
    if (record.client !== requestedUuid) continue;
    // Later entries win: this makes a fresh metric-store response take
    // precedence when a server returns duplicate buckets.
    deduplicated.set(getRecordKey(record), record);
  }

  return [...deduplicated.values()].sort(
    (a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime(),
  );
}

export function normalizeLoadRecords(raw: unknown, uuid: string): RPC2StatusRecord[] {
  return flattenRecords<RPC2StatusRecord>(raw, uuid);
}

export function normalizePingRecords(raw: unknown, uuid: string): RPC2PingRecord[] {
  // A node can have several ping tasks sampled at the exact same timestamp.
  // Keep those series separate; using only `time` would drop all but one task.
  return flattenRecords<RPC2PingRecord>(
    raw,
    uuid,
    record => `${String(record.time)}|${String(record.task_id)}`,
  );
}

/**
 * common:getNodesLatestStatus and common:getNodeRecentStatus expose
 * `connections` as TCP+UDP and `connections_udp` as UDP. Keep the UI model
 * explicit so callers do not accidentally label the total as TCP.
 */
export function splitReportedConnections(
  connections: unknown,
  connectionsUdp: unknown,
): { tcp: number; udp: number } {
  const total = typeof connections === 'number' ? connections : Number(connections);
  const udp = typeof connectionsUdp === 'number' ? connectionsUdp : Number(connectionsUdp);
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeUdp = Number.isFinite(udp) && udp > 0 ? Math.min(udp, safeTotal) : 0;
  return { tcp: Math.max(safeTotal - safeUdp, 0), udp: safeUdp };
}

/** common:getNodes is normally UUID-keyed, but older and single-node forms exist. */
export function normalizeNodeEntries(raw: unknown): Array<[string, RPC2NodeData]> {
  if (Array.isArray(raw)) {
    return raw.flatMap(node => {
      if (!isRecord(node) || typeof node.uuid !== 'string' || node.uuid.length === 0) return [];
      return [[node.uuid, node as unknown as RPC2NodeData] as [string, RPC2NodeData]];
    });
  }
  if (!isRecord(raw)) return [];
  if (typeof raw.uuid === 'string' && raw.uuid.length > 0) {
    return [[raw.uuid, raw as unknown as RPC2NodeData]];
  }
  return Object.entries(raw).flatMap(([uuid, node]) =>
    isRecord(node) ? [[uuid, node as unknown as RPC2NodeData] as [string, RPC2NodeData]] : [],
  );
}
