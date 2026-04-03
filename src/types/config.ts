export interface WebSocketLike {
  readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type TransportMode = 'http' | 'ws'

export type WebSocketFactory = (url: string) => WebSocketLike

export interface RedisOptions {
  url?: string
  token?: string
  timeoutMs?: number
  keyPrefix?: string
  allowEmulatedCommands?: boolean
  transport?: TransportMode
  wsUrl?: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  webSocketFactory?: WebSocketFactory
}

export interface ParsedConnectionUrl {
  baseUrl: string
  token?: string
  timeoutMs?: number
  keyPrefix?: string
  headers?: Record<string, string>
}

export type ConfigSource =
  | 'constructor-url'
  | 'constructor-options'
  | 'env'
  | 'default'

export interface ResolvedConfig {
  baseUrl: string
  token?: string
  timeoutMs: number
  keyPrefix: string
  allowEmulatedCommands: boolean
  transport: TransportMode
  wsUrl?: string
  headers: Record<string, string>
  fetch: typeof fetch
  webSocketFactory?: WebSocketFactory
  source: ConfigSource
}
