import type { EncodedValueEnvelope } from '../types/internal'
import type { RedisValue } from '../types/commands'

export function encodeValue(value: RedisValue): EncodedValueEnvelope {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return {
      type: 'binary',
      encoding: 'base64',
      value: value.toString('base64')
    }
  }

  if (value instanceof Uint8Array) {
    return {
      type: 'binary',
      encoding: 'base64',
      value: Buffer.from(value).toString('base64')
    }
  }

  if (typeof value === 'number') {
    return {
      type: 'string',
      encoding: 'utf8',
      value: String(value)
    }
  }

  return {
    type: 'string',
    encoding: 'utf8',
    value
  }
}

export function decodeValue(entry: EncodedValueEnvelope | null): string | null {
  if (!entry) {
    return null
  }

  if (entry.encoding === 'base64') {
    return Buffer.from(entry.value, 'base64').toString('utf8')
  }

  return entry.value
}
