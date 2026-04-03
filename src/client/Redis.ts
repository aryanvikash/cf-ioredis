import { mgetCommand, msetCommand, setCommand, getCommand } from '../commands/strings'
import {
  delCommand,
  existsCommand,
  expireCommand,
  pexpireCommand,
  persistCommand,
  pttlCommand,
  ttlCommand,
  typeCommand
} from '../commands/keys'
import { assertCommandSupported } from '../commands/unsupported'
import { resolveConfig } from '../config/resolveConfig'
import { createTransport } from '../core/createTransport'
import type { KvTransport } from '../core/transport'
import type { RedisOptions } from '../types/config'
import type { BulkStringReply, IntegerReply, StatusReply } from '../types/responses'
import type { RedisValue, SetOptions } from '../types/commands'
import { applyKeyPrefix, applyKeyPrefixToMany } from '../utils/key-prefix'
import { Pipeline } from './Pipeline'
import { Transaction } from './Transaction'

export class Redis {
  readonly options: ReturnType<typeof resolveConfig>
  private readonly transport: KvTransport

  constructor(input?: string | RedisOptions) {
    this.options = resolveConfig(input)
    this.transport = createTransport(this.options)
  }

  async get(key: string): Promise<BulkStringReply> {
    return getCommand(this.transport, this.prefixed(key))
  }

  async set(key: string, value: RedisValue, options?: SetOptions): Promise<'OK' | null> {
    return setCommand(this.transport, this.prefixed(key), value, options)
  }

  async del(...keys: string[]): Promise<IntegerReply> {
    return delCommand(this.transport, this.prefixedMany(keys))
  }

  async exists(...keys: string[]): Promise<IntegerReply> {
    return existsCommand(this.transport, this.prefixedMany(keys))
  }

  async mget(...keys: string[]): Promise<Array<string | null>> {
    return mgetCommand(this.transport, this.prefixedMany(keys))
  }

  async mset(entries: Record<string, RedisValue>): Promise<StatusReply> {
    return msetCommand(
      this.transport,
      Object.entries(entries).map(([key, value]) => ({
        key: this.prefixed(key),
        value
      }))
    )
  }

  async expire(key: string, seconds: number): Promise<IntegerReply> {
    return expireCommand(this.transport, this.prefixed(key), seconds)
  }

  async pexpire(key: string, milliseconds: number): Promise<IntegerReply> {
    return pexpireCommand(this.transport, this.prefixed(key), milliseconds)
  }

  async ttl(key: string): Promise<IntegerReply> {
    return ttlCommand(this.transport, this.prefixed(key))
  }

  async pttl(key: string): Promise<IntegerReply> {
    return pttlCommand(this.transport, this.prefixed(key))
  }

  async persist(key: string): Promise<IntegerReply> {
    return persistCommand(this.transport, this.prefixed(key))
  }

  async type(key: string): Promise<'string' | 'none'> {
    return typeCommand(this.transport, this.prefixed(key))
  }

  pipeline(): Pipeline {
    assertCommandSupported('pipeline', this.options.allowEmulatedCommands)
    return new Pipeline(this)
  }

  multi(): Transaction {
    assertCommandSupported('multi', this.options.allowEmulatedCommands)
    return new Transaction(this)
  }

  duplicate(input?: string | RedisOptions): Redis {
    const serializedUrl = new URL(this.options.baseUrl)
    const duplicateUrl = input
      ? input
      : {
          url: `cfkv://${this.options.token ? `${this.options.token}@` : ''}${serializedUrl.host}${serializedUrl.pathname}`,
          timeoutMs: this.options.timeoutMs,
          keyPrefix: this.options.keyPrefix,
          allowEmulatedCommands: this.options.allowEmulatedCommands,
          transport: this.options.transport,
          wsUrl: this.options.wsUrl,
          headers: this.options.headers,
          fetch: this.options.fetch,
          webSocketFactory: this.options.webSocketFactory
        }

    return new Redis(duplicateUrl)
  }

  disconnect(): void {
    void this.transport.close()
  }

  async quit(): Promise<StatusReply> {
    await this.transport.close()
    return 'OK'
  }

  private prefixed(key: string): string {
    return applyKeyPrefix(key, this.options.keyPrefix)
  }

  private prefixedMany(keys: string[]): string[] {
    return applyKeyPrefixToMany(keys, this.options.keyPrefix)
  }
}
