import type { KvTransport } from '../core/transport'
import type { RedisKey, RedisValue, SetOptions } from '../types/commands'
import { decodeValue, encodeValue } from '../utils/encoding'

export async function getCommand(transport: KvTransport, key: RedisKey): Promise<string | null> {
  const record = await transport.get(key)
  return record.value
}

export async function setCommand(
  transport: KvTransport,
  key: RedisKey,
  value: RedisValue,
  options?: SetOptions
): Promise<'OK' | null> {
  const normalizedValue = decodeValue(encodeValue(value))
  const result = await transport.set(key, normalizedValue ?? '', options)

  return result.applied ? 'OK' : null
}

export async function mgetCommand(transport: KvTransport, keys: RedisKey[]): Promise<Array<string | null>> {
  const records = await transport.mget(keys)
  return records.map((record) => record.value)
}

export async function msetCommand(
  transport: KvTransport,
  entries: Array<{ key: RedisKey; value: RedisValue; options?: SetOptions }>
): Promise<'OK'> {
  return transport.mset(
    entries.map((entry) => ({
      key: entry.key,
      value: decodeValue(encodeValue(entry.value)) ?? '',
      options: entry.options
    }))
  )
}
