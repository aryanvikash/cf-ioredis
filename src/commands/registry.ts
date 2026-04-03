import type { CommandMetadata } from '../types/commands'

export const commandRegistry: Record<string, CommandMetadata> = {
  get: { name: 'get', status: 'supported' },
  set: { name: 'set', status: 'supported' },
  del: { name: 'del', status: 'supported' },
  exists: { name: 'exists', status: 'supported' },
  mget: { name: 'mget', status: 'supported' },
  mset: { name: 'mset', status: 'supported' },
  expire: { name: 'expire', status: 'supported' },
  pexpire: { name: 'pexpire', status: 'supported' },
  ttl: { name: 'ttl', status: 'supported' },
  pttl: { name: 'pttl', status: 'supported' },
  persist: { name: 'persist', status: 'supported' },
  type: { name: 'type', status: 'supported' },
  pipeline: { name: 'pipeline', status: 'supported' },
  multi: { name: 'multi', status: 'emulated', nonAtomic: true, notes: 'Executes as ordered batch without Redis atomicity' },
  append: { name: 'append', status: 'unsupported', nonAtomic: true },
  getdel: { name: 'getdel', status: 'unsupported', nonAtomic: true },
  rename: { name: 'rename', status: 'unsupported', nonAtomic: true },
  publish: { name: 'publish', status: 'unsupported' },
  subscribe: { name: 'subscribe', status: 'unsupported' },
  hget: { name: 'hget', status: 'unsupported' },
  lpush: { name: 'lpush', status: 'unsupported' },
  sadd: { name: 'sadd', status: 'unsupported' },
  zadd: { name: 'zadd', status: 'unsupported' },
  eval: { name: 'eval', status: 'unsupported' },
  watch: { name: 'watch', status: 'unsupported' }
}
