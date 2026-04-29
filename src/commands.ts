import { UnsupportedCommandError } from './errors'
import type { CommandMetadata } from './types'

export const commandRegistry: Record<string, CommandMetadata> = {
  // Strings
  get: { name: 'get', status: 'supported' },
  set: { name: 'set', status: 'supported' },
  mget: { name: 'mget', status: 'supported' },
  mset: { name: 'mset', status: 'supported' },
  getset: { name: 'getset', status: 'supported' },
  incr: { name: 'incr', status: 'supported' },
  decr: { name: 'decr', status: 'supported' },
  incrby: { name: 'incrby', status: 'supported' },
  decrby: { name: 'decrby', status: 'supported' },

  // Keys
  del: { name: 'del', status: 'supported' },
  exists: { name: 'exists', status: 'supported' },
  expire: { name: 'expire', status: 'supported' },
  pexpire: { name: 'pexpire', status: 'supported' },
  ttl: { name: 'ttl', status: 'supported' },
  pttl: { name: 'pttl', status: 'supported' },
  persist: { name: 'persist', status: 'supported' },
  type: { name: 'type', status: 'supported' },

  // Pub/sub
  publish: { name: 'publish', status: 'supported' },
  subscribe: { name: 'subscribe', status: 'supported' },
  unsubscribe: { name: 'unsubscribe', status: 'supported' },

  // Batched
  pipeline: { name: 'pipeline', status: 'supported' },
  multi: {
    name: 'multi',
    status: 'emulated',
    nonAtomic: true,
    notes: 'Executes as ordered batch; the DO already serializes individual commands'
  },

  // Not yet implemented
  append: { name: 'append', status: 'unsupported', nonAtomic: true },
  getdel: { name: 'getdel', status: 'unsupported', nonAtomic: true },
  rename: { name: 'rename', status: 'unsupported', nonAtomic: true },
  hget: { name: 'hget', status: 'unsupported' },
  lpush: { name: 'lpush', status: 'unsupported' },
  sadd: { name: 'sadd', status: 'unsupported' },
  zadd: { name: 'zadd', status: 'unsupported' },
  eval: { name: 'eval', status: 'unsupported' },
  watch: { name: 'watch', status: 'unsupported' }
}

export function assertCommandSupported(name: string, allowEmulated: boolean): void {
  const meta = commandRegistry[name]
  if (!meta || meta.status === 'unsupported') {
    throw new UnsupportedCommandError(name)
  }
  if (meta.status === 'emulated' && !allowEmulated) {
    throw new UnsupportedCommandError(
      name,
      `Command \`${name}\` is emulated and requires \`allowEmulatedCommands: true\``
    )
  }
}
