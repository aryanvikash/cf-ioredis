import type { EncodedValue, RedisValue } from './types'

export function encode(value: RedisValue): EncodedValue {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { type: 'binary', encoding: 'base64', value: value.toString('base64') }
  }

  if (value instanceof Uint8Array) {
    return { type: 'binary', encoding: 'base64', value: Buffer.from(value).toString('base64') }
  }

  if (typeof value === 'number') {
    return { type: 'string', encoding: 'utf8', value: String(value) }
  }

  return { type: 'string', encoding: 'utf8', value }
}

export function decode(entry: EncodedValue | null | undefined): string | null {
  if (!entry) return null
  if (entry.encoding === 'base64') return Buffer.from(entry.value, 'base64').toString('utf8')
  return entry.value
}

export function prefixKey(key: string, keyPrefix: string): string {
  return keyPrefix ? `${keyPrefix}${key}` : key
}

export function prefixKeys(keys: string[], keyPrefix: string): string[] {
  return keyPrefix ? keys.map((k) => `${keyPrefix}${k}`) : keys
}
