import type { ResolvedConfig } from '../types'
import { HttpTransport } from './HttpTransport'
import { WsTransport } from './WsTransport'
import type { Transport } from './Transport'

export type { Transport } from './Transport'
export { HttpTransport, WsTransport }

export function createTransport(config: ResolvedConfig): Transport {
  return config.transport === 'ws' ? new WsTransport(config) : new HttpTransport(config)
}
