/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * JSON-RPC 2.0 Standard Type Definitions
 * Based on specification: https://www.jsonrpc.org/specification
 */

/**
 * JSON-RPC 2.0 Request Object
 */
export interface JSONRPC2Request<T = any> {
  /** JSON-RPC version, must be "2.0" */
  jsonrpc: "2.0";
  /** Method name to invoke */
  method: string;
  /** Call parameters (optional) */
  params?: T;
  /** Request ID; omit for notification requests */
  id?: string | number | null;
}

/**
 * JSON-RPC 2.0 Response Object (success)
 */
export interface JSONRPC2SuccessResponse<T = any> {
  /** JSON-RPC version, must be "2.0" */
  jsonrpc: "2.0";
  /** Call result */
  result: T;
  /** Request ID */
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Error Object
 */
export interface JSONRPC2Error {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Error details (optional) */
  data?: any;
}

/**
 * JSON-RPC 2.0 Response Object (error)
 */
export interface JSONRPC2ErrorResponse {
  /** JSON-RPC version, must be "2.0" */
  jsonrpc: "2.0";
  /** Error info */
  error: JSONRPC2Error;
  /** Request ID */
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Response Union Type
 */
export type JSONRPC2Response<T = any> = JSONRPC2SuccessResponse<T> | JSONRPC2ErrorResponse;

/**
 * JSON-RPC 2.0 Batch Request
 */
export type JSONRPC2BatchRequest = JSONRPC2Request[];

/**
 * JSON-RPC 2.0 Batch Response
 */
export type JSONRPC2BatchResponse = JSONRPC2Response[];

/**
 * Predefined Error Codes
 */
export const JSONRPC2ErrorCode = {
  /** Parse error — server received invalid JSON */
  PARSE_ERROR: -32700,
  /** Invalid request — the JSON sent is not a valid request object */
  INVALID_REQUEST: -32600,
  /** Method not found — the method does not exist or is not available */
  METHOD_NOT_FOUND: -32601,
  /** Invalid params — invalid method parameters */
  INVALID_PARAMS: -32602,
  /** Internal error — JSON-RPC internal error */
  INTERNAL_ERROR: -32603,
} as const;

export type JSONRPC2ErrorCodeType = typeof JSONRPC2ErrorCode[keyof typeof JSONRPC2ErrorCode];

/**
 * RPC Connection State
 */
export const RPC2ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  ERROR: "error",
} as const;

export type RPC2ConnectionStateType = typeof RPC2ConnectionState[keyof typeof RPC2ConnectionState];

/**
 * RPC Connection Options
 */
export interface RPC2ConnectionOptions {
  /** Auto-connect on creation */
  autoConnect?: boolean;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect interval (ms) */
  reconnectInterval?: number;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
  /** Request timeout (ms) */
  requestTimeout?: number;
  /** Enable heartbeat */
  enableHeartbeat?: boolean;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Custom headers (HTTP POST only) */
  headers?: Record<string, string>;
}

/**
 * RPC Call Options
 */
export interface RPC2CallOptions {
  /** Request timeout (ms) */
  timeout?: number;
  /** Notification request (no response expected) */
  notification?: boolean;
}

/**
 * Event Listener Types
 */
export interface RPC2EventListeners {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onMessage?: (data: any) => void;
}

// ============================================================
// Komari Business Types — data structures returned by RPC2 API
// ============================================================

/**
 * Node object returned by common:getNodes (Client)
 */
export interface RPC2NodeData {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  os: string;
  kernel_version: string;
  gpu_name: string;
  ipv4: string;
  ipv6: string;
  region: string;
  remark: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle: number;
  auto_renewal: boolean;
  currency: string;
  expired_at: string;
  group: string;
  tags: string;
  hidden: boolean;
  traffic_limit: number;
  traffic_limit_type: string;
  created_at: string;
  updated_at: string;
  public_remark?: string;
}

/**
 * Node status returned by common:getNodesLatestStatus (flat structure)
 */
export interface RPC2NodeStatus {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  load5: number;
  load15: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
  online: boolean;
  uptime?: number;
  message?: string;
}

/**
 * History record returned by common:getRecords(type=load) / common:getNodeRecentStatus
 */
export interface RPC2StatusRecord {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  load5?: number;
  load15?: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
  uptime?: number;
  message?: string;
}

/**
 * Ping record returned by common:getRecords(type=ping)
 */
export interface RPC2PingRecord {
  task_id: number;
  time: string;
  value: number;
  client: string;
}

/**
 * Task info returned by common:getRecords(type=ping)
 */
export interface RPC2PingTask {
  id: number;
  name: string;
  interval: number;
  loss: number;
  type?: string;
  avg?: number;
  latest?: number;
  max?: number;
  min?: number;
  p50?: number;
  p99?: number;
  p99_p50_ratio?: number;
  total?: number;
}

/**
 * BasicInfo returned by common:getRecords(type=ping)
 */
export interface RPC2BasicInfo {
  client: string;
  loss: number;
  min: number;
  max: number;
}
