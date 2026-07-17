import { describe, expect, it } from 'vitest';
import { normalizeLoadRecords, normalizeNodeEntries, normalizePingRecords } from './komari-rpc-normalizers';

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

  it('returns no records for empty or malformed data', () => {
    expect(normalizeLoadRecords(null, uuid)).toEqual([]);
    expect(normalizePingRecords({ unexpected: 'value' }, uuid)).toEqual([]);
  });

  it('accepts UUID maps, arrays, and single-node getNodes responses', () => {
    expect(normalizeNodeEntries({ [uuid]: { uuid, name: 'A' } })).toHaveLength(1);
    expect(normalizeNodeEntries([{ uuid, name: 'A' }])).toHaveLength(1);
    expect(normalizeNodeEntries({ uuid, name: 'A' })).toEqual([[uuid, { uuid, name: 'A' }]]);
  });
});
