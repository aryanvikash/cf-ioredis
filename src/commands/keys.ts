import type { KvTransport } from '../core/transport'
import type { RedisKey } from '../types/commands'
import { secondsToMilliseconds } from '../utils/time'

export async function delCommand(transport: KvTransport, keys: RedisKey[]): Promise<number> {
  return transport.del(keys)
}

export async function existsCommand(transport: KvTransport, keys: RedisKey[]): Promise<number> {
  return transport.exists(keys)
}

export async function expireCommand(transport: KvTransport, key: RedisKey, seconds: number): Promise<number> {
  const applied = await transport.expire(key, secondsToMilliseconds(seconds))
  return applied ? 1 : 0
}

export async function pexpireCommand(transport: KvTransport, key: RedisKey, ms: number): Promise<number> {
  const applied = await transport.expire(key, ms)
  return applied ? 1 : 0
}

export async function ttlCommand(transport: KvTransport, key: RedisKey): Promise<number> {
  const ttlMs = await transport.ttl(key)

  if (ttlMs < 0) {
    return ttlMs
  }

  return Math.ceil(ttlMs / 1000)
}

export async function pttlCommand(transport: KvTransport, key: RedisKey): Promise<number> {
  return transport.ttl(key)
}

export async function persistCommand(transport: KvTransport, key: RedisKey): Promise<number> {
  const applied = await transport.persist(key)
  return applied ? 1 : 0
}

export async function typeCommand(transport: KvTransport, key: RedisKey): Promise<'string' | 'none'> {
  return transport.type(key)
}
