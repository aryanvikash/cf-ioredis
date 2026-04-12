import { describe, expect, it } from 'vitest'
import { parseConnectionUrl } from '../../src/config/parseConnectionUrl'

describe('parseConnectionUrl', () => {
  it('parses supported scheme and query options', () => {
    const parsed = parseConnectionUrl('cfkv://token@worker.example.com?timeoutMs=900&keyPrefix=demo:')

    expect(parsed.baseUrl).toBe('https://worker.example.com')
    expect(parsed.token).toBe('token')
    expect(parsed.timeoutMs).toBe(900)
    expect(parsed.keyPrefix).toBe('demo:')
  })
})
