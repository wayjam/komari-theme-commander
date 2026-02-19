// API Service — communicates with Komari backend via RPC2

import { rpc2Client } from '@/lib/rpc2';
import type {
  RPC2NodeData,
  RPC2NodeStatus,
  RPC2StatusRecord,
  RPC2PingRecord,
  RPC2BasicInfo,
  RPC2PingTask,
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

const pendingCalls = new Map<string, Promise<any>>();

function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pendingCalls.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => pendingCalls.delete(key));
  pendingCalls.set(key, promise);
  return promise;
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
        if (!result) return [];
        return Object.entries(result).map(([uuid, client]) => adaptNodeData(uuid, client));
      } catch (error) {
        console.error('RPC2 getNodes failed:', error);
        return [];
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
  async getLoadHistory(uuid: string, hours: number = 24): Promise<any> {
    return dedup(`getLoadHistory:${uuid}:${hours}`, async () => {
      try {
        const result = await rpc2Client.call<
          { type: string; uuid: string; hours: number },
          { count: number; records: RPC2StatusRecord[]; from: string; to: string }
        >(
          'common:getRecords',
          { type: 'load', uuid, hours }
        );
        if (!result) return null;
        // RPC2 may return records as { [uuid]: StatusRecord[] } object map; flatten to array
        const rawRecords = result.records;
        let records: RPC2StatusRecord[];
        if (Array.isArray(rawRecords)) {
          records = rawRecords;
        } else if (rawRecords && typeof rawRecords === 'object') {
          // { uuid: StatusRecord[] } → extract all values and flatten
          records = (Object.values(rawRecords) as RPC2StatusRecord[][]).flat();
        } else {
          records = [];
        }
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
  async getPingHistory(uuid: string, hours: number = 24): Promise<any> {
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

  // Fetch public settings
  async getPublicSettings(): Promise<any> {
    return dedup('getPublicSettings', async () => {
      try {
        return await rpc2Client.call('common:getPublicInfo');
      } catch (error) {
        console.error('RPC2 getPublicSettings failed:', error);
        return null;
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

export class WebSocketService {
  private listeners: Set<(data: any) => void> = new Set();
  private onlineNodes: Set<string> = new Set();
  private nodeData: Map<string, any> = new Map();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  connect() {
    // Ensure RPC2 client is connected
    if (rpc2Client.state === 'disconnected') {
      rpc2Client.connect().catch(() => {});
    }
    console.log('WebSocket (RPC2) connected');
    // Initial data fetch
    this.fetchLatestStatus();
  }

  /** Fetch latest node status via RPC2 */
  private async fetchLatestStatus() {
    try {
      const result = await rpc2Client.call<undefined, Record<string, RPC2NodeStatus>>(
        'common:getNodesLatestStatus'
      );
      if (!result) return;

      // Extract online node list
      const onlineList: string[] = [];
      const dataMap: Record<string, NodeStats> = {};

      for (const [uuid, status] of Object.entries(result)) {
        if (status.online) {
          onlineList.push(uuid);
        }
        dataMap[uuid] = adaptNodeStatus(status);
      }

      this.onlineNodes = new Set(onlineList);
      this.nodeData = new Map(Object.entries(dataMap));

      // Notify all listeners (format compatible with original WebSocket)
      this.listeners.forEach(listener => listener({
        online: onlineList,
        data: dataMap,
      }));
    } catch (error) {
      console.error('RPC2 fetchLatestStatus failed:', error);
    }
  }

  send(data: string) {
    if (data === 'get') {
      this.fetchLatestStatus();
    }
  }

  subscribe(listener: (data: any) => void) {
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

  getNodeData(uuid: string): any {
    return this.nodeData.get(uuid);
  }

  /** Expose ws property for WebSocketStatus component compatibility */
  get ws(): WebSocket | null {
    return rpc2Client.ws;
  }
}

// Create WebSocket service instance
export const wsService = new WebSocketService();
