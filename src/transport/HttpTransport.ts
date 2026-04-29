import { TransportError } from '../errors'
import type { ResolvedConfig, RpcEnvelope, RpcResponse } from '../types'
import type { Transport } from './Transport'

export class HttpTransport implements Transport {
  private nextId = 0

  constructor(private readonly config: ResolvedConfig) {}

  async request<T>(action: string, payload?: unknown): Promise<T> {
    const envelope: RpcEnvelope = { id: this.id(), action, payload }
    const response = await this.fetchWithTimeout(envelope)

    if (!response.ok) {
      throw new TransportError(`Worker request failed with status ${response.status}`, response.status)
    }

    const result = (await response.json()) as RpcResponse

    if (!result.ok) {
      throw new TransportError(result.error?.message ?? 'Worker request failed')
    }

    return result.data as T
  }

  async close(): Promise<void> {}

  private id(): string {
    return `${Date.now()}-${this.nextId++}`
  }

  private async fetchWithTimeout(envelope: RpcEnvelope): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      return await this.config.fetch(this.endpoint(), {
        method: 'POST',
        signal: controller.signal,
        headers: this.headers(),
        body: JSON.stringify(envelope)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransportError('Worker request timed out')
      }
      throw new TransportError(error instanceof Error ? error.message : 'Unknown transport error')
    } finally {
      clearTimeout(timeout)
    }
  }

  private endpoint(): string {
    const url = new URL(`${this.config.baseUrl}/rpc`)
    if (this.config.namespace) url.searchParams.set('ns', this.config.namespace)
    return url.toString()
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
      ...this.config.headers
    }
  }
}
