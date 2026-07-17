import { describe, expect, it } from 'vitest';
import { parseHistoryRetentionFromPublicSettings, parseThemeConfigFromPublicSettings } from './useAppConfig';

const samplePublicInfo = {
  sitename: 'Commander Monitor',
  theme_settings: {
    custom_footer: 'Footer text',
    default_theme: 'clean',
    default_view: 'globe',
    enable_globe: true,
    enable_privacy_mode: false,
    enable_uptime: true,
    enable_asset_stats: true,
    globe_hub_node: '  hub-node  ',
    globe_marker_style: 'lite',
    globe_mode: 'static',
    globe_respect_reduced_motion: false,
  },
};

describe('parseThemeConfigFromPublicSettings', () => {
  it('returns defaults when publicSettings is null', () => {
    const tc = parseThemeConfigFromPublicSettings(null);
    expect(tc.globe_mode).toBe('dynamic');
    expect(tc.globe_marker_style).toBe('rich');
    expect(tc.default_view).toBe('globe');
  });

  it('reads nested theme_settings object', () => {
    const tc = parseThemeConfigFromPublicSettings(samplePublicInfo);
    expect(tc.globe_mode).toBe('static');
    expect(tc.globe_marker_style).toBe('lite');
    expect(tc.globe_hub_node).toBe('hub-node');
    expect(tc.default_theme).toBe('clean');
    expect(tc.default_view).toBe('globe');
    expect(tc.enable_globe).toBe(true);
    expect(tc.enable_uptime).toBe(true);
    expect(tc.enable_asset_stats).toBe(true);
    expect(tc.enable_privacy_mode).toBe(false);
    expect(tc.globe_respect_reduced_motion).toBe(false);
    expect(tc.custom_footer).toBe('Footer text');
  });

  it('parses theme_settings JSON string', () => {
    const tc = parseThemeConfigFromPublicSettings({
      theme_settings: JSON.stringify({
        globe_mode: 'dynamic',
        globe_marker_style: 'calm',
      }),
    });
    expect(tc.globe_mode).toBe('dynamic');
    expect(tc.globe_marker_style).toBe('calm');
  });

  it('falls back to flat keys when theme_settings is missing', () => {
    const tc = parseThemeConfigFromPublicSettings({
      globe_mode: 'static',
      enable_globe: 'false',
      enable_uptime: 'true',
    });
    expect(tc.globe_mode).toBe('static');
    expect(tc.enable_globe).toBe(false);
    expect(tc.enable_uptime).toBe(true);
  });

  it('prefers nested theme_settings over flat keys', () => {
    const tc = parseThemeConfigFromPublicSettings({
      globe_mode: 'dynamic',
      theme_settings: { globe_mode: 'static' },
    });
    expect(tc.globe_mode).toBe('static');
  });

  it('falls back default_view when globe is disabled', () => {
    const tc = parseThemeConfigFromPublicSettings({
      theme_settings: {
        default_view: 'globe',
        enable_globe: false,
      },
    });
    expect(tc.default_view).toBe('grid');
  });

  it('ignores invalid enum values', () => {
    const tc = parseThemeConfigFromPublicSettings({
      theme_settings: {
        globe_mode: 'spinning',
        globe_marker_style: 'fancy',
        default_view: 'map',
        default_theme: 'neon',
      },
    });
    expect(tc.globe_mode).toBe('dynamic');
    expect(tc.globe_marker_style).toBe('rich');
    expect(tc.default_view).toBe('globe');
    expect(tc.default_theme).toBe('clean');
  });
});

describe('parseHistoryRetentionFromPublicSettings', () => {
  it('prefers the Komari 1.2.6 metric retention setting for both histories', () => {
    expect(parseHistoryRetentionFromPublicSettings({
      metric_retention_days: 90,
      record_preserve_time: 24,
      ping_record_preserve_time: 48,
    })).toEqual({ recordPreserveTime: 2160, pingRecordPreserveTime: 2160 });
  });

  it('falls back to the separate 1.2.5 retention settings', () => {
    expect(parseHistoryRetentionFromPublicSettings({
      record_preserve_time: '720',
      ping_record_preserve_time: 48,
    })).toEqual({ recordPreserveTime: 720, pingRecordPreserveTime: 48 });
  });

  it('uses safe defaults when no usable server setting is returned', () => {
    expect(parseHistoryRetentionFromPublicSettings(null))
      .toEqual({ recordPreserveTime: 720, pingRecordPreserveTime: 48 });
  });
});
