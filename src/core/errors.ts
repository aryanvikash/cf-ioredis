export class RedisKvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedisKvError'
  }
}

export class ConfigError extends RedisKvError {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class TransportError extends RedisKvError {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'TransportError'
    this.statusCode = statusCode
  }
}

export class UnsupportedCommandError extends RedisKvError {
  readonly command: string

  constructor(command: string, message?: string) {
    super(message ?? `Command \`${command}\` is not supported by this Cloudflare KV-backed client`)
    this.name = 'UnsupportedCommandError'
    this.command = command
  }
}
