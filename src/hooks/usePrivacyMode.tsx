import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { NodeWithStatus } from '@/services/api';

// User's explicit choice (set by clicking the toggle button). Absence means
// "follow the theme default", which is pushed via setDefaultPrivacyMode.
const OVERRIDE_KEY = 'privacy-mode-override';

// Cache of the last theme-config default so returning visitors don't briefly
// see real node names before the config request resolves.
const DEFAULT_CACHE_KEY = 'privacy-mode-default-cache';

// Legacy storage key. Older builds wrote to this on every change (including
// auto-applied defaults), which made the theme setting effectively a no-op.
// Migrated once on first load.
const LEGACY_KEY = 'privacy-mode';

const FAKE_PREFIXES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'Xray', 'Yankee', 'Zulu',
];

const FAKE_SUFFIXES = [
  'Node', 'Server', 'Host', 'Unit', 'Station', 'Terminal', 'Relay', 'Probe',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateFakeName(uuid: string): string {
  const h = hashCode(uuid);
  const prefix = FAKE_PREFIXES[h % FAKE_PREFIXES.length];
  const suffix = FAKE_SUFFIXES[(h >> 4) % FAKE_SUFFIXES.length];
  const num = String((h % 900) + 100);
  return `${prefix}-${suffix}-${num}`;
}

interface PrivacyModeContextType {
  /** Effective privacy state: user override if present, otherwise theme default. */
  privacyMode: boolean;
  /** True when the user has expressed an explicit preference. */
  hasOverride: boolean;
  /** Set the user's explicit preference (persisted). */
  setPrivacyMode: (enabled: boolean) => void;
  /** Discard the user's preference so the theme default takes over again. */
  clearOverride: () => void;
  /** Flip the effective state and persist the result as the user's override. */
  togglePrivacyMode: () => void;
  /** Push the theme-config default. Does not write the override key. */
  setDefaultPrivacyMode: (enabled: boolean) => void;
  maskNodes: (nodes: NodeWithStatus[]) => NodeWithStatus[];
  maskName: (uuid: string, name: string) => string;
}

function readOverride(): boolean | null {
  try {
    let raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw === null) {
      // One-time migration: treat any legacy value as the user's override so
      // existing toggled states aren't lost. The legacy key was also written
      // by the buggy auto-sync, but treating it as override is the safest
      // interpretation — the user keeps whatever they were last seeing.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'true' || legacy === 'false') {
        raw = legacy;
        try { localStorage.setItem(OVERRIDE_KEY, legacy); } catch { /* ignore */ }
      }
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function readDefaultCache(): boolean {
  try {
    return localStorage.getItem(DEFAULT_CACHE_KEY) === 'true';
  } catch {
    return false;
  }
}

const PrivacyModeContext = createContext<PrivacyModeContextType>({
  privacyMode: false,
  hasOverride: false,
  setPrivacyMode: () => {},
  clearOverride: () => {},
  togglePrivacyMode: () => {},
  setDefaultPrivacyMode: () => {},
  maskNodes: (nodes) => nodes,
  maskName: (_uuid, name) => name,
});

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<boolean | null>(readOverride);
  const [defaultMode, setDefaultModeState] = useState<boolean>(readDefaultCache);

  const privacyMode = override ?? defaultMode;

  const setPrivacyMode = useCallback((enabled: boolean) => {
    setOverrideState(enabled);
    try {
      localStorage.setItem(OVERRIDE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
    try {
      localStorage.removeItem(OVERRIDE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode(!privacyMode);
  }, [privacyMode, setPrivacyMode]);

  const setDefaultPrivacyMode = useCallback((enabled: boolean) => {
    setDefaultModeState(enabled);
    try {
      localStorage.setItem(DEFAULT_CACHE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  const maskName = useCallback((uuid: string, name: string) => {
    if (!privacyMode) return name;
    return generateFakeName(uuid);
  }, [privacyMode]);

  const maskNodes = useCallback((nodes: NodeWithStatus[]) => {
    if (!privacyMode) return nodes;
    return nodes.map((node) => ({
      ...node,
      name: generateFakeName(node.uuid),
    }));
  }, [privacyMode]);

  const value = useMemo(() => ({
    privacyMode,
    hasOverride: override !== null,
    setPrivacyMode,
    clearOverride,
    togglePrivacyMode,
    setDefaultPrivacyMode,
    maskNodes,
    maskName,
  }), [
    privacyMode,
    override,
    setPrivacyMode,
    clearOverride,
    togglePrivacyMode,
    setDefaultPrivacyMode,
    maskNodes,
    maskName,
  ]);

  return (
    <PrivacyModeContext.Provider value={value}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  return useContext(PrivacyModeContext);
}
