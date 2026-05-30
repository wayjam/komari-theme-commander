import { describe, it, expect } from 'vitest';
import { formatBytes } from './utils';

describe('formatBytes', () => {
  it('formats real Komari capacity values using a binary (1024) base', () => {
    // traffic_limit = 200 * 1024^3 → must read as a round 200 GiB, not 215 GB.
    expect(formatBytes(214748364800)).toBe('200 GiB');
    // disk_total
    expect(formatBytes(63290032128)).toBe('58.9 GiB');
    // mem_total
    expect(formatBytes(1794953216)).toBe('1.67 GiB');
    // swap_total
    expect(formatBytes(2084564992)).toBe('1.94 GiB');
  });

  it('picks the right IEC unit at each 1024 boundary', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KiB');
    expect(formatBytes(1024 ** 2)).toBe('1 MiB');
    expect(formatBytes(1024 ** 3)).toBe('1 GiB');
    expect(formatBytes(1024 ** 4)).toBe('1 TiB');
    expect(formatBytes(1024 ** 5)).toBe('1 PiB');
    expect(formatBytes(1024 ** 6)).toBe('1 EiB');
  });

  it('keeps ~3 significant figures', () => {
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(1024 ** 3 * 1.5)).toBe('1.5 GiB');
    expect(formatBytes(1024 ** 3 * 12.345)).toBe('12.3 GiB');
    expect(formatBytes(1024 ** 3 * 123.45)).toBe('123 GiB');
  });

  it('handles zero, negative, and non-finite inputs gracefully', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(-(1024 ** 3))).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});
