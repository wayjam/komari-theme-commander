import { describe, expect, it } from 'vitest';
import { normalizeMetricDefinitionsResponse } from './api';

describe('normalizeMetricDefinitionsResponse', () => {
  it('normalizes the bare array returned by Komari 1.2.6 and 1.4.3', () => {
    expect(normalizeMetricDefinitionsResponse([
      {
        name: 'cpu.usage',
        type: 'gauge',
        unit: '%',
        retention_days: '7',
        metadata: { source: 'report', ignored: 1 },
        created_at: '2026-01-01T00:00:00Z',
      },
      { name: 'invalid', retention_days: -1 },
      null,
    ])).toEqual([{
      name: 'cpu.usage',
      description: undefined,
      type: 'gauge',
      unit: '%',
      retention_days: 7,
      metadata: { source: 'report' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: undefined,
    }]);
  });

  it('accepts definitions/data envelopes and removes duplicate names', () => {
    expect(normalizeMetricDefinitionsResponse({
      definitions: [
        { name: 'ping.latency_ms', retention_days: 1 },
        { name: 'ping.latency_ms', retention_days: 3 },
      ],
    })).toEqual([{
      name: 'ping.latency_ms',
      description: undefined,
      type: undefined,
      unit: undefined,
      retention_days: 1,
      metadata: undefined,
      created_at: undefined,
      updated_at: undefined,
    }]);

    expect(normalizeMetricDefinitionsResponse({
      data: [{ name: 'memory.used', retention_days: 14 }],
    })[0].name).toBe('memory.used');
  });

  it('returns an empty list for an old server without the method', () => {
    expect(normalizeMetricDefinitionsResponse(null)).toEqual([]);
    expect(normalizeMetricDefinitionsResponse({ error: { code: -32601 } })).toEqual([]);
  });
});
