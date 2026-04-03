import { describe, expect, it, vi } from 'vitest'
import { Redis, UnsupportedCommandError } from '../../src'

describe('transaction', () => {
  it('requires emulated command opt-in', () => {
    const redis = new Redis({
      url: 'cfkv://token@worker.example.com',
      fetch: vi.fn() as unknown as typeof fetch
    })

    expect(() => redis.multi()).toThrowError(UnsupportedCommandError)
  })

  it('creates transaction queue when emulation is enabled', () => {
    const redis = new Redis({
      url: 'cfkv://token@worker.example.com',
      allowEmulatedCommands: true,
      fetch: vi.fn() as unknown as typeof fetch
    })

    const transaction = redis.multi()

    expect(transaction).toBeDefined()
  })
})
