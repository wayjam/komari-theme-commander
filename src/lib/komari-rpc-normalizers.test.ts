import { describe, expect, it } from 'vitest';
import {
  normalizeLoadRecords,
  normalizeNodeEntries,
  normalizePingRecords,
  normalizeRpcTimestamp,
  splitReportedConnections,
} from './komari-rpc-normalizers';

describe('Komari RPC normalizers', () => {
  const uuid = 'node-a';

  it('normalizes grouped load records, filters other nodes, and keeps the newest duplicate', () => {
    const records = normalizeLoadRecords({
      'node-a': [
        { time: '2026-07-01T00:01:00Z', cpu: 10 },
        { time: '2026-07-01T00:00:00Z', cpu: 20 },
        { time: '2026-07-01T00:01:00Z', cpu: 30 },
      ],
      'node-b': [{ time: '2026-07-01T00:00:00Z', cpu: 99 }],
    }, uuid);

    expect(records).toHaveLength(2);
    expect(records.map(record => record.client)).toEqual([uuid, uuid]);
    expect(records.map(record => record.cpu)).toEqual([20, 30]);
  });

  it('normalizes array responses and preserves negative ping values', () => {
    const records = normalizePingRecords([
      { client: uuid, task_id: 1, time: '2026-07-01T00:02:00Z', value: -1 },
      { client: 'node-b', task_id: 1, time: '2026-07-01T00:01:00Z', value: 12 },
      { client: uuid, task_id: 1, time: '2026-07-01T00:01:00Z', value: 10 },
    ], uuid);

    expect(records.map(record => record.value)).toEqual([10, -1]);
  });

  it('keeps different ping tasks sampled at the same timestamp', () => {
    const records = normalizePingRecords([
      { client: uuid, task_id: 1, time: '2026-07-01T00:01:00Z', value: 10 },
      { client: uuid, task_id: 2, time: '2026-07-01T00:01:00Z', value: 20 },
      { client: uuid, task_id: 1, time: '2026-07-01T00:01:00Z', value: 30 },
    ], uuid);

    expect(records).toHaveLength(2);
    expect(records.map(record => [record.task_id, record.value])).toEqual([
      [1, 30],
      [2, 20],
    ]);
  });

  it('normalizes timestamp offsets before deduplicating records', () => {
    const records = normalizeLoadRecords([
      { client: uuid, time: '2026-07-01T08:00:00+08:00', cpu: 10 },
      { client: uuid, time: '2026-07-01T00:00:00Z', cpu: 20 },
    ], uuid);

    expect(records).toHaveLength(1);
    expect(records[0].time).toBe('2026-07-01T00:00:00.000Z');
    expect(records[0].cpu).toBe(20);
  });

  it('uses the same canonical timestamp for live and historical data', () => {
    expect(normalizeRpcTimestamp('2026-07-01T00:00:00Z'))
      .toBe('2026-07-01T00:00:00.000Z');
  });

  it('returns no records for empty or malformed data', () => {
    expect(normalizeLoadRecords(null, uuid)).toEqual([]);
    expect(normalizePingRecords({ unexpected: 'value' }, uuid)).toEqual([]);
  });

  it('accepts UUID maps, arrays, and single-node getNodes responses', () => {
    expect(normalizeNodeEntries({ [uuid]: { uuid, name: 'A' } })).toHaveLength(1);
    expect(normalizeNodeEntries([{ uuid, name: 'A' }])).toHaveLength(1);
    expect(normalizeNodeEntries({ uuid, name: 'A' })).toEqual([[uuid, { uuid, name: 'A' }]]);
  });

  it('splits the latest-status connection total into TCP and UDP', () => {
    expect(splitReportedConnections(17, 5)).toEqual({ tcp: 12, udp: 5 });
    expect(splitReportedConnections(3, 8)).toEqual({ tcp: 0, udp: 3 });
  });
});
