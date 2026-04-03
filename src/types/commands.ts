export type RedisKey = string

export type RedisValue = string | number | Uint8Array | Buffer

export interface SetOptions {
  ex?: number
  px?: number
  nx?: boolean
  xx?: boolean
}

export interface QueuedCommand {
  name: string
  args: unknown[]
  execute: () => Promise<unknown>
}

export type ExecTuple<T = unknown> = [Error | null, T]

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

export type RedisEventListener<T extends RedisEventName = RedisEventName> = (...args: RedisEventMap[T]) => void
