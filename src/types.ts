// ─── Public types ───────────────────────────────────────────────

export type RedisKey = string
export type RedisValue = string | number | Uint8Array | Buffer
export type TransportMode = 'http' | 'ws'

export type StatusReply = 'OK'
export type BulkStringReply = string | null
export type IntegerReply = number
export type ExecTuple<T = unknown> = [Error | null, T]
export type ExecReply = ExecTuple[]

export interface SetOptions {
  ex?: number
  px?: number
  nx?: boolean
  xx?: boolean
}

export interface RedisOptions {
  url?: string
  token?: string
  timeoutMs?: number
  keyPrefix?: string
  namespace?: string
  allowEmulatedCommands?: boolean
  transport?: TransportMode
  wsUrl?: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  webSocketFactory?: WebSocketFactory
}

export interface ResolvedConfig {
  baseUrl: string
  token?: string
  timeoutMs: number
  keyPrefix: string
  namespace?: string
  allowEmulatedCommands: boolean
  transport: TransportMode
  wsUrl: string
  headers: Record<string, string>
  fetch: typeof fetch
  webSocketFactory?: WebSocketFactory
}

export interface WebSocketLike {
  readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type WebSocketFactory = (url: string) => WebSocketLike

export interface CommandMetadata {
  name: string
  status: 'supported' | 'emulated' | 'unsupported'
  nonAtomic?: boolean
  notes?: string
}

export interface RedisEventMap {
  message: [channel: string, message: string]
  subscribe: [channel: string, count: number]
  unsubscribe: [channel: string, count: number]
}

export type RedisEventName = keyof RedisEventMap
export type RedisEventListener<T extends RedisEventName = RedisEventName> = (
  ...args: RedisEventMap[T]
) => void

// ─── Internal wire types ────────────────────────────────────────

export interface EncodedValue {
  type: 'string' | 'binary'
  encoding: 'utf8' | 'base64'
  value: string
}

export interface KeyEntry {
  value: EncodedValue | null
  ttlMs: number | null
}

export interface RpcEnvelope {
  id: string
  action: string
  payload?: unknown
}

export interface RpcResponse {
  id: string
  ok: boolean
  data?: unknown
  error?: { message: string; code?: string }
}

// ─── Pub/sub frames ─────────────────────────────────────────────

export type PubSubClientFrame =
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels?: string[] }
  | { type: 'ping' }
  | { type: 'publish'; channel: string; message: string }

export type PubSubServerFrame =
  | { type: 'subscribe'; channel: string; count: number }
  | { type: 'unsubscribe'; channel: string; count: number }
  | { type: 'message'; channel: string; message: string }
  | { type: 'pong' }
  | { type: 'publish'; channel: string; receivers: number }
  | { type: 'error'; message: string; code?: string }
