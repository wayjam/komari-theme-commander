// API Service — communicates with Komari backend via RPC2

import { rpc2Client } from '@/lib/rpc2';
import { offlineCache } from '@/lib/offlineCache';
import type {
  RPC2NodeData,
  RPC2NodeStatus,
  RPC2StatusRecord,
  RPC2PingRecord,
  RPC2BasicInfo,
  RPC2PingTask,
  RPC2PingStat,
} from '@/lib/rpc2';

export interface NodeData {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  os: string;
  gpu_name: string;
  region: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle: number;
  currency: string;
  expired_at: string;
  group: string;
  tags: string;
  created_at: string;
  updated_at: string;
  // Additional fields returned by backend
  kernel_version?: string;
  hidden?: boolean;
  auto_renewal?: boolean;
  traffic_limit?: number;
  traffic_limit_type?: string;
  public_remark?: string;
  ipv4?: string;
  ipv6?: string;
  remark?: string;
}

export interface UserInfo {
  logged_in: boolean;
  username: string;
  uuid: string;
  '2fa_enabled': boolean;
  sso_id: string;
  sso_type: string;
}

export interface PingStat {
  name: string;
  latest: number;
  avg: number;
  tail: number;
  loss: number;
  min: number;
  max: number;
}

export interface NodeStats {
  cpu: { usage: number };
  ram: { total: number; used: number };
  swap: { total: number; used: number };
  disk: { total: number; used: number };
  network: { up: number; down: number; totalUp: number; totalDown: number };
  load: { load1: number; load5: number; load15: number };
  uptime: number;
  process: number;
  connections: { tcp: number; udp: number };
  message: string;
  updated_at: string;
  ping?: Record<string, PingStat>;
}

export interface LoadHistoryOptions {
  /** Narrow payload to one metric family (common:getRecords load_type) */
  loadType?: string;
}

export interface NodeWithStatus extends NodeData {
  status: 'online' | 'offline';
  stats?: NodeStats;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  message: string;
  data: T;
}

// ============================================================
// Request deduplication: concurrent requests with the same key
// share one Promise
// ============================================================

const pendingCalls = new Map<string, Promise<unknown>>();

function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pendingCalls.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => pendingCalls.delete(key));
  pendingCalls.set(key, promise);
  return promise;
}

const PUBLIC_NS_CACHE_KEY = 'komari.supportsPublicNamespace';

function isRpcMethodNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('RPC Error -32601') || error.message.includes('method not found');
}

function loadMaxCountForHours(hours: number): number {
  if (hours <= 1) return 2000;
  if (hours <= 6) return 3000;
  return 4000;
}

function flattenLoadRecords(rawRecords: unknown): RPC2StatusRecord[] {
  if (Array.isArray(rawRecords)) return rawRecords as RPC2StatusRecord[];
  if (rawRecords && typeof rawRecords === 'object') {
    return (Object.values(rawRecords) as RPC2StatusRecord[][]).flat();
  }
  return [];
}

/** Narrow load_type projection → full StatusRecord shape for chart adapters */
function adaptFlatLoadRecord(rec: Partial<RPC2StatusRecord> & { time: string; client?: string }): RPC2StatusRecord {
  return {
    client: rec.client || '',
    time: rec.time,
    cpu: rec.cpu ?? 0,
    gpu: rec.gpu ?? 0,
    ram: rec.ram ?? 0,
    ram_total: rec.ram_total ?? 0,
    swap: rec.swap ?? 0,
    swap_total: rec.swap_total ?? 0,
    load: rec.load ?? 0,
    load5: rec.load5 ?? 0,
    load15: rec.load15 ?? 0,
    temp: rec.temp ?? 0,
    disk: rec.disk ?? 0,
    disk_total: rec.disk_total ?? 0,
    net_in: rec.net_in ?? 0,
    net_out: rec.net_out ?? 0,
    net_total_up: rec.net_total_up ?? 0,
    net_total_down: rec.net_total_down ?? 0,
    process: rec.process ?? 0,
    connections: rec.connections ?? 0,
    connections_udp: rec.connections_udp ?? 0,
    uptime: rec.uptime,
    message: rec.message,
  };
}

function adaptPingStats(ping?: Record<string, RPC2PingStat>): Record<string, PingStat> | undefined {
  if (!ping || Object.keys(ping).length === 0) return undefined;
  const out: Record<string, PingStat> = {};
  for (const [key, stat] of Object.entries(ping)) {
    out[key] = {
      name: stat.name,
      latest: stat.latest,
      avg: stat.avg,
      tail: stat.tail,
      loss: stat.loss,
      min: stat.min,
      max: stat.max,
    };
  }
  return out;
}

/** Best non-loss latest latency across embedded ping tasks, or null when unavailable */
export function getBestPingLatency(ping?: Record<string, PingStat>): number | null {
  if (!ping) return null;
  let best: number | null = null;
  for (const stat of Object.values(ping)) {
    if (stat.latest >= 0 && (best === null || stat.latest < best)) {
      best = stat.latest;
    }
  }
  return best;
}

// ============================================================
// Data format adapters
// ============================================================

/** RPC2 Client object → existing NodeData format */
function adaptNodeData(uuid: string, client: RPC2NodeData): NodeData {
  return {
    uuid: client.uuid || uuid,
    name: client.name,
    cpu_name: client.cpu_name,
    virtualization: client.virtualization,
    arch: client.arch,
    cpu_cores: client.cpu_cores,
    os: client.os,
    gpu_name: client.gpu_name,
    region: client.region,
    mem_total: client.mem_total,
    swap_total: client.swap_total,
    disk_total: client.disk_total,
    weight: client.weight,
    price: client.price,
    billing_cycle: client.billing_cycle,
    currency: client.currency,
    expired_at: client.expired_at,
    group: client.group,
    tags: client.tags,
    created_at: client.created_at,
    updated_at: client.updated_at,
    kernel_version: client.kernel_version,
    hidden: client.hidden,
    auto_renewal: client.auto_renewal,
    traffic_limit: client.traffic_limit,
    traffic_limit_type: client.traffic_limit_type,
    public_remark: client.public_remark,
    ipv4: client.ipv4,
    ipv6: client.ipv6,
    remark: client.remark,
  };
}

/** RPC2 flat StatusRecord → existing nested NodeStats format */
function adaptStatusRecord(record: RPC2StatusRecord): NodeStats {
  return {
    cpu: { usage: record.cpu || 0 },
    ram: { total: record.ram_total || 0, used: record.ram || 0 },
    swap: { total: record.swap_total || 0, used: record.swap || 0 },
    disk: { total: record.disk_total || 0, used: record.disk || 0 },
    network: {
      up: record.net_in || 0,
      down: record.net_out || 0,
      totalUp: record.net_total_up || 0,
      totalDown: record.net_total_down || 0,
    },
    load: { load1: record.load || 0, load5: record.load5 || 0, load15: record.load15 || 0 },
    uptime: record.uptime || 0,
    process: record.process || 0,
    connections: { tcp: record.connections || 0, udp: record.connections_udp || 0 },
    message: record.message || '',
    updated_at: record.time || new Date().toISOString(),
  };
}

/** RPC2 flat NodeStatus → existing nested NodeStats format */
function adaptNodeStatus(status: RPC2NodeStatus): NodeStats {
  return {
    cpu: { usage: status.cpu || 0 },
    ram: { total: status.ram_total || 0, used: status.ram || 0 },
    swap: { total: status.swap_total || 0, used: status.swap || 0 },
    disk: { total: status.disk_total || 0, used: status.disk || 0 },
    network: {
      up: status.net_in || 0,
      down: status.net_out || 0,
      totalUp: status.net_total_up || 0,
      totalDown: status.net_total_down || 0,
    },
    load: { load1: status.load || 0, load5: status.load5 || 0, load15: status.load15 || 0 },
    uptime: status.uptime || 0,
    process: status.process || 0,
    connections: { tcp: status.connections || 0, udp: status.connections_udp || 0 },
    message: status.message || '',
    updated_at: status.time || new Date().toISOString(),
    ping: adaptPingStats(status.ping),
  };
}

// ============================================================
// ApiService — calls via RPC2
// ============================================================

class ApiService {
  // Fetch all nodes
  async getNodes(): Promise<NodeData[]> {
    return dedup('getNodes', async () => {
      try {
        const result = await rpc2Client.call<undefined, Record<string, RPC2NodeData>>(
          'common:getNodes'
        );
        if (!result) {
          // Empty/missing payload — fall back to the last good snapshot so
          // the UI keeps showing nodes when the backend is briefly down.
          const cached = offlineCache.getNodes();
          return cached?.data ?? [];
        }
        const nodes = Object.entries(result).map(([uuid, client]) => adaptNodeData(uuid, client));
        if (nodes.length > 0) offlineCache.setNodes(nodes);
        return nodes;
      } catch (error) {
        console.error('RPC2 getNodes failed:', error);
        const cached = offlineCache.getNodes();
        return cached?.data ?? [];
      }
    });
  }

  // Fetch recent stats for a specific node
  async getNodeRecentStats(uuid: string): Promise<NodeStats[]> {
    return dedup(`getNodeRecentStats:${uuid}`, async () => {
      try {
        const result = await rpc2Client.call<{ uuid: string }, { count: number; records: RPC2StatusRecord[] }>(
          'common:getNodeRecentStatus',
          { uuid }
        );
        if (!result?.records) return [];
        const records = Array.isArray(result.records)
          ? result.records
          : typeof result.records === 'object'
            ? Object.values(result.records) as RPC2StatusRecord[]
            : [];
        return records.map(adaptStatusRecord);
      } catch (error) {
        console.error('RPC2 getNodeRecentStats failed:', error);
        return [];
      }
    });
  }

  // Fetch load history records
  async getLoadHistory(
    uuid: string,
    hours: number = 24,
    options?: LoadHistoryOptions,
  ): Promise<{ count: number; records: RPC2StatusRecord[] } | null> {
    const loadType = options?.loadType;
    const dedupKey = `getLoadHistory:${uuid}:${hours}:${loadType ?? 'all'}`;
    return dedup(dedupKey, async () => {
      try {
        const params: {
          type: string;
          uuid: string;
          hours: number;
          maxCount: number;
          load_type?: string;
        } = {
          type: 'load',
          uuid,
          hours,
          maxCount: loadMaxCountForHours(hours),
        };
        if (loadType) params.load_type = loadType;

        const result = await rpc2Client.call<
          typeof params,
          { count: number; records: RPC2StatusRecord[] | Record<string, RPC2StatusRecord[]>; from: string; to: string }
        >(
          'common:getRecords',
          params
        );
        if (!result) return null;

        const rawRecords = flattenLoadRecords(result.records);
        const records = loadType
          ? rawRecords.map(r => adaptFlatLoadRecord(r))
          : rawRecords;

        return {
          count: result.count,
          records,
        };
      } catch (error) {
        console.error('RPC2 getLoadHistory failed:', error);
        return null;
      }
    });
  }

  // Fetch ping history records
  async getPingHistory(uuid: string, hours: number = 24): Promise<{ count: number; records: RPC2PingRecord[]; tasks: { id: number; name: string; interval: number; loss: number; type?: string; avg?: number; latest?: number; max?: number; min?: number; p50?: number; p99?: number; p99_p50_ratio?: number; total?: number }[] } | null> {
    return dedup(`getPingHistory:${uuid}:${hours}`, async () => {
      try {
        const result = await rpc2Client.call<
          { type: string; uuid: string; hours: number },
          { count: number; records: RPC2PingRecord[]; basic_info: RPC2BasicInfo[]; tasks?: RPC2PingTask[]; from: string; to: string }
        >(
          'common:getRecords',
          { type: 'ping', uuid, hours }
        );
        if (!result) return null;

        // RPC2 may return an object map instead of array; ensure records is always an array
        const rawRecords = result.records;
        const recordsArray: RPC2PingRecord[] = Array.isArray(rawRecords)
          ? rawRecords
          : rawRecords && typeof rawRecords === 'object'
            ? Object.values(rawRecords) as RPC2PingRecord[]
            : [];

        // Use tasks from backend response if available; otherwise fallback to building from records
        let tasks: { id: number; name: string; interval: number; loss: number; type?: string; avg?: number; latest?: number; max?: number; min?: number; p50?: number; p99?: number; p99_p50_ratio?: number; total?: number }[];
        const rawTasks = result.tasks;
        if (Array.isArray(rawTasks) && rawTasks.length > 0) {
          tasks = rawTasks.map(t => ({
            id: t.id,
            name: t.name,
            interval: t.interval,
            loss: t.loss ?? 0,
            type: t.type,
            avg: t.avg,
            latest: t.latest,
            max: t.max,
            min: t.min,
            p50: t.p50,
            p99: t.p99,
            p99_p50_ratio: t.p99_p50_ratio,
            total: t.total,
          }));
        } else {
          // Fallback: extract unique task_id set from records
          const taskIds = new Set<number>();
          for (const rec of recordsArray) {
            if (rec.task_id !== undefined) {
              taskIds.add(rec.task_id);
            }
          }
          tasks = Array.from(taskIds).map(id => ({
            id,
            name: `Ping #${id}`,
            interval: 30,
            loss: 0,
          }));
        }

        return {
          count: result.count,
          records: recordsArray,
          tasks,
        };
      } catch (error) {
        console.error('RPC2 getPingHistory failed:', error);
        return null;
      }
    });
  }

  // Fetch public settings (public:* on 1.2.5+, fallback to common:getPublicInfo)
  async getPublicSettings(): Promise<Record<string, unknown> | null> {
    return dedup('getPublicSettings', async () => {
      const fetchCommon = () =>
        rpc2Client.call<undefined, Record<string, unknown>>('common:getPublicInfo');

      try {
        let result: Record<string, unknown> | undefined;
        const cachedSupport = sessionStorage.getItem(PUBLIC_NS_CACHE_KEY);

        if (cachedSupport !== 'false') {
          try {
            result = await rpc2Client.call<undefined, Record<string, unknown>>('public:getPublicSettings');
            sessionStorage.setItem(PUBLIC_NS_CACHE_KEY, 'true');
          } catch (error) {
            if (isRpcMethodNotFound(error)) {
              sessionStorage.setItem(PUBLIC_NS_CACHE_KEY, 'false');
              result = await fetchCommon();
            } else {
              throw error;
            }
          }
        } else {
          result = await fetchCommon();
        }

        if (result && Object.keys(result).length > 0) {
          offlineCache.setPublicInfo(result);
          return result;
        }
        return offlineCache.getPublicInfo()?.data ?? result ?? null;
      } catch (error) {
        console.error('RPC2 getPublicSettings failed:', error);
        return offlineCache.getPublicInfo()?.data ?? null;
      }
    });
  }

  // Fetch version info
  async getVersion(): Promise<{ version: string; hash: string }> {
    return dedup('getVersion', async () => {
      try {
        const result = await rpc2Client.call<undefined, { version: string; hash: string }>(
          'common:getVersion'
        );
        return result || { version: 'unknown', hash: 'unknown' };
      } catch (error) {
        console.error('RPC2 getVersion failed:', error);
        return { version: 'unknown', hash: 'unknown' };
      }
    });
  }

  // Fetch user info
  async getUserInfo(): Promise<UserInfo | null> {
    return dedup('getUserInfo', async () => {
      try {
        return await rpc2Client.call<undefined, UserInfo>('common:getMe');
      } catch (error) {
        console.error('RPC2 getUserInfo failed:', error);
        return null;
      }
    });
  }
}

// Create API service instance
export const apiService = new ApiService();

// ============================================================
// WebSocketService — polls common:getNodesLatestStatus via RPC2
// ============================================================

export interface WsMessage {
  online: string[];
  data: Record<string, NodeStats>;
}

export class WebSocketService {
  private listeners: Set<(data: WsMessage) => void> = new Set();
  private onlineNodes: Set<string> = new Set();
  private nodeData: Map<string, NodeStats> = new Map();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  /** Visible node UUIDs for subset polling; null = fetch all */
  private pollUuids: string[] | null = null;
  /** When subset polling misbehaves, stick to full polls for the session */
  private preferFullPoll = false;
  /** True once we've delivered at least one *fresh* snapshot from the
   *  backend. Used to decide whether an offline-cache replay is still
   *  useful (we don't want to overwrite live data with stale data). */
  private hasFreshSnapshot = false;
  /** ms epoch of the most recent successful fetch, or 0 when we've only
   *  ever served from the offline cache. Exposed for "stale data" UI. */
  private lastUpdatedAt = 0;

  /** Limit status polls to known visible nodes (merged into existing state). */
  setPollUuids(uuids: string[] | null) {
    this.pollUuids = uuids && uuids.length > 0 ? uuids : null;
    this.preferFullPoll = false;
  }

  connect() {
    // Ensure RPC2 client is connected
    if (rpc2Client.state === 'disconnected') {
      rpc2Client.connect().catch(() => {});
    }
    if (import.meta.env.DEV) {
      console.info('[Komari] WebSocket (RPC2) connected');
    }
    // Warm the UI with the most recent persisted snapshot — this avoids
    // an empty dashboard for the first ~RTT after a cold load and is
    // the primary "offline data" experience: when the backend is truly
    // unreachable the live fetch below will fail and we'll keep this
    // pre-rendered state on screen instead of showing nothing.
    this.replayFromCache();
    // Initial data fetch
    this.fetchLatestStatus();
  }

  /** Fetch latest node status via RPC2 */
  private async fetchLatestStatus(forceFull = false): Promise<void> {
    const useSubset = !forceFull && !this.preferFullPoll && !!this.pollUuids?.length;
    const params = useSubset ? { uuids: this.pollUuids! } : undefined;

    try {
      const result = await rpc2Client.call<
        { uuids: string[] } | undefined,
        Record<string, RPC2NodeStatus>
      >(
        'common:getNodesLatestStatus',
        params
      );
      if (!result) {
        return;
      }

      if (useSubset && this.pollUuids) {
        const returned = Object.keys(result).length;
        if (returned === 0) {
          this.preferFullPoll = true;
          return this.fetchLatestStatus(true);
        }
      }

      let onlineList: string[];
      const dataMap: Record<string, NodeStats> = useSubset
        ? Object.fromEntries(this.nodeData)
        : {};

      if (useSubset) {
        const onlineSet = new Set(this.onlineNodes);
        for (const [uuid, status] of Object.entries(result)) {
          if (status.online) onlineSet.add(uuid);
          else onlineSet.delete(uuid);
          dataMap[uuid] = adaptNodeStatus(status);
        }
        onlineList = Array.from(onlineSet);
      } else {
        onlineList = [];
        for (const [uuid, status] of Object.entries(result)) {
          if (status.online) onlineList.push(uuid);
          dataMap[uuid] = adaptNodeStatus(status);
        }
      }

      this.onlineNodes = new Set(onlineList);
      this.nodeData = new Map(Object.entries(dataMap));
      this.hasFreshSnapshot = true;
      this.lastUpdatedAt = Date.now();

      offlineCache.setStatuses(onlineList, dataMap);

      this.listeners.forEach(listener => listener({
        online: onlineList,
        data: dataMap,
      }));
    } catch (error) {
      if (useSubset && !forceFull) {
        this.preferFullPoll = true;
        return this.fetchLatestStatus(true);
      }
      console.error('RPC2 fetchLatestStatus failed:', error);
      if (!this.hasFreshSnapshot) this.replayFromCache();
    }
  }

  /**
   * Restore the most recent persisted snapshot into in-memory state and
   * notify listeners. Cheap & idempotent — the sets/maps are simply
   * rebuilt; if the cache is empty this is a no-op. We deliberately do
   * NOT mark `hasFreshSnapshot` here so that a successful fetch can still
   * overwrite us with live data.
   */
  private replayFromCache() {
    const cached = offlineCache.getStatuses();
    if (!cached || cached.data.online.length === 0 && Object.keys(cached.data.data).length === 0) {
      return;
    }
    const { online, data } = cached.data;
    this.onlineNodes = new Set(online);
    this.nodeData = new Map(Object.entries(data));
    this.lastUpdatedAt = cached.capturedAt;
    this.listeners.forEach(listener => listener({ online, data }));
  }

  send(data: string) {
    if (data === 'get') {
      this.fetchLatestStatus();
    }
  }

  subscribe(listener: (data: WsMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  getOnlineNodes(): string[] {
    return Array.from(this.onlineNodes);
  }

  getNodeData(uuid: string): NodeStats | undefined {
    return this.nodeData.get(uuid);
  }

  /** ms epoch of the most recent successful fetch (0 if only cache served). */
  getLastUpdatedAt(): number {
    return this.lastUpdatedAt;
  }

  /** True once at least one fresh snapshot has been delivered this session. */
  hasFreshData(): boolean {
    return this.hasFreshSnapshot;
  }

  /** Expose ws property for WebSocketStatus component compatibility */
  get ws(): WebSocket | null {
    return rpc2Client.ws;
  }
}

// Create WebSocket service instance
export const wsService = new WebSocketService();
