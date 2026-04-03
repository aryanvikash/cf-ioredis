export { Redis } from './client/Redis'
export { Pipeline } from './client/Pipeline'
export { Transaction } from './client/Transaction'

export type { RedisOptions, ResolvedConfig, TransportMode, WebSocketFactory, WebSocketLike } from './types/config'
export type { RedisValue, SetOptions, ExecTuple, CommandMetadata, RedisEventMap, RedisEventName, RedisEventListener } from './types/commands'
export type { StatusReply, BulkStringReply, IntegerReply, ExecReply } from './types/responses'

export { RedisKvError, ConfigError, TransportError, UnsupportedCommandError } from './core/errors'
export { commandRegistry } from './commands/registry'
