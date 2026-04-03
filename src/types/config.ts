export interface RedisOptions {
  url?: string
  token?: string
  timeoutMs?: number
  keyPrefix?: string
  allowEmulatedCommands?: boolean
  headers?: Record<string, string>
  fetch?: typeof fetch
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
  headers: Record<string, string>
  fetch: typeof fetch
  source: ConfigSource
}
