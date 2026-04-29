import { describe, expect, it } from 'vitest'
import { decode, encode, prefixKey, prefixKeys } from '../../src/encoding'

describe('encode/decode', () => {
  it('round-trips utf8 strings', () => {
    expect(decode(encode('hello'))).toBe('hello')
  })

  it('round-trips numbers as strings', () => {
    expect(decode(encode(42))).toBe('42')
  })

  it('round-trips Uint8Array as base64', () => {
    const bytes = new Uint8Array([104, 105])
    const encoded = encode(bytes)
    expect(encoded.encoding).toBe('base64')
    expect(decode(encoded)).toBe('hi')
  })

  it('decodes null/undefined to null', () => {
    expect(decode(null)).toBeNull()
    expect(decode(undefined)).toBeNull()
  })
})

describe('prefixKey', () => {
  it('returns key unchanged when no prefix', () => {
    expect(prefixKey('user:1', '')).toBe('user:1')
  })

  it('prepends prefix', () => {
    expect(prefixKey('user:1', 'app:')).toBe('app:user:1')
  })

  it('prefixes many keys', () => {
    expect(prefixKeys(['a', 'b'], 'p:')).toEqual(['p:a', 'p:b'])
  })
})
