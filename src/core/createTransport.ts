import type { ResolvedConfig } from '../types/config'
import type { KvTransport } from './transport'
import { HttpWorkerTransport } from './http-worker-transport'
import { WebSocketWorkerTransport } from './ws-worker-transport'

export function createTransport(config: ResolvedConfig): KvTransport {
  if (config.transport === 'ws') {
    return new WebSocketWorkerTransport(config)
  }

  return new HttpWorkerTransport(config)
}
