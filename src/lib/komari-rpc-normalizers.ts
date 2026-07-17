import type { RPC2NodeData, RPC2PingRecord, RPC2StatusRecord } from '@/lib/rpc2';

type RecordWithTime = { time?: unknown; client?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize a collection that may be an array or a UUID-keyed RPC map. */
function flattenRecords<T extends RecordWithTime>(raw: unknown, requestedUuid: string): T[] {
  const entries: T[] = [];

  const append = (value: unknown, fallbackClient?: string) => {
    if (!isRecord(value)) return;
    const record = { ...value } as T;
    if (!record.client && fallbackClient) record.client = fallbackClient;
    if (!record.client) record.client = requestedUuid;
    if (typeof record.time === 'string') entries.push(record);
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
    deduplicated.set(String(record.time), record);
  }

  return [...deduplicated.values()].sort(
    (a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime(),
  );
}

export function normalizeLoadRecords(raw: unknown, uuid: string): RPC2StatusRecord[] {
  return flattenRecords<RPC2StatusRecord>(raw, uuid);
}

export function normalizePingRecords(raw: unknown, uuid: string): RPC2PingRecord[] {
  return flattenRecords<RPC2PingRecord>(raw, uuid);
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
