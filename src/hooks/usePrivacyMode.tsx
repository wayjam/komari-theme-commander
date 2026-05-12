import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { NodeWithStatus } from '@/services/api';

const STORAGE_KEY = 'privacy-mode';

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
  privacyMode: boolean;
  setPrivacyMode: (enabled: boolean) => void;
  togglePrivacyMode: () => void;
  maskNodes: (nodes: NodeWithStatus[]) => NodeWithStatus[];
  maskName: (uuid: string, name: string) => string;
}

function getInitialPrivacyMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const PrivacyModeContext = createContext<PrivacyModeContextType>({
  privacyMode: false,
  setPrivacyMode: () => {},
  togglePrivacyMode: () => {},
  maskNodes: (nodes) => nodes,
  maskName: (_uuid, name) => name,
});

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [privacyMode, setPrivacyModeState] = useState(getInitialPrivacyMode);

  const setPrivacyMode = useCallback((enabled: boolean) => {
    setPrivacyModeState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode(!privacyMode);
  }, [privacyMode, setPrivacyMode]);

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
    setPrivacyMode,
    togglePrivacyMode,
    maskNodes,
    maskName,
  }), [privacyMode, setPrivacyMode, togglePrivacyMode, maskNodes, maskName]);

  return (
    <PrivacyModeContext.Provider value={value}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  return useContext(PrivacyModeContext);
}
