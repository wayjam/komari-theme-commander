export { RPC2Client } from "./client";
export { RPC2ConnectionState } from "./types";
export type {
  JSONRPC2Request,
  JSONRPC2Response,
  JSONRPC2SuccessResponse,
  JSONRPC2ErrorResponse,
  JSONRPC2Error,
  JSONRPC2BatchRequest,
  JSONRPC2BatchResponse,
  JSONRPC2ErrorCodeType,
  RPC2ConnectionStateType,
  RPC2ConnectionOptions,
  RPC2CallOptions,
  RPC2EventListeners,
  RPC2NodeData,
  RPC2NodeStatus,
  RPC2StatusRecord,
  RPC2PingRecord,
  RPC2BasicInfo,
} from "./types";

import { RPC2Client } from "./client";

/** Module-level singleton — shared RPC2 connection for the entire app */
export const rpc2Client = new RPC2Client("/api/rpc2");
