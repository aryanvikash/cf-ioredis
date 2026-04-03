import { TransportError } from './errors'
import type { KvTransport } from './transport'
import type { ResolvedConfig } from '../types/config'
import type { RedisKey, SetOptions } from '../types/commands'
import type {
  WorkerBatchGetResponse,
  WorkerDeleteResponse,
  WorkerExistsResponse,
  WorkerGetResponse,
  WorkerMSetRequest,
  WorkerPersistResponse,
  WorkerSetRequest,
  WorkerSetResponse,
  WorkerTypeResponse
} from '../types/internal'
import type { KvRecord } from '../types/responses'
import { decodeValue, encodeValue } from '../utils/encoding'

export class WorkerKvClient implements KvTransport {
  constructor(private readonly config: ResolvedConfig) {}

  async get(key: RedisKey): Promise<KvRecord> {
    const response = await this.request<WorkerGetResponse>('GET', `/get?key=${encodeURIComponent(key)}`)

    return {
      value: decodeValue(response.entry.value),
      ttlMs: response.entry.ttlMs
    }
  }

  async mget(keys: RedisKey[]): Promise<KvRecord[]> {
    const response = await this.request<WorkerBatchGetResponse>('POST', '/mget', { keys })

    return response.entries.map((entry) => ({
      value: decodeValue(entry.value),
      ttlMs: entry.ttlMs
    }))
  }

  async set(key: RedisKey, value: string, options?: SetOptions): Promise<{ applied: boolean; previous: string | null }> {
    const body: WorkerSetRequest = {
      key,
      value: encodeValue(value),
      options
    }

    const response = await this.request<WorkerSetResponse>('POST', '/set', body)

    return {
      applied: response.applied,
      previous: decodeValue(response.previous ?? null)
    }
  }

  async mset(entries: Array<{ key: RedisKey; value: string; options?: SetOptions }>): Promise<'OK'> {
    const body: WorkerMSetRequest = {
      entries: entries.map((entry) => ({
        key: entry.key,
        value: encodeValue(entry.value),
        options: entry.options
      }))
    }

    await this.request('POST', '/mset', body)

    return 'OK'
  }

  async del(keys: RedisKey[]): Promise<number> {
    const response = await this.request<WorkerDeleteResponse>('DELETE', '/delete', { keys })
    return response.deleted
  }

  async exists(keys: RedisKey[]): Promise<number> {
    const response = await this.request<WorkerExistsResponse>('POST', '/exists', { keys })
    return response.count
  }

  async expire(key: RedisKey, ttlMs: number): Promise<boolean> {
    const response = await this.request<{ applied: boolean }>('POST', '/expire', { key, ttlMs })
    return response.applied
  }

  async ttl(key: RedisKey): Promise<number> {
    const response = await this.request<{ ttlMs: number | null; exists: boolean }>('GET', `/ttl?key=${encodeURIComponent(key)}`)

    if (!response.exists) {
      return -2
    }

    if (response.ttlMs === null) {
      return -1
    }

    return response.ttlMs
  }

  async persist(key: RedisKey): Promise<boolean> {
    const response = await this.request<WorkerPersistResponse>('POST', '/persist', { key })
    return response.persisted
  }

  async type(key: RedisKey): Promise<'string' | 'none'> {
    const response = await this.request<WorkerTypeResponse>('GET', `/type?key=${encodeURIComponent(key)}`)
    return response.type
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await this.config.fetch(`${this.config.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
          ...this.config.headers
        },
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        throw new TransportError(`Worker KV request failed with status ${response.status}`, response.status)
      }

      if (response.status === 204) {
        return undefined as T
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof TransportError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransportError('Worker KV request timed out')
      }

      throw new TransportError(error instanceof Error ? error.message : 'Unknown transport error')
    } finally {
      clearTimeout(timeout)
    }
  }
}
