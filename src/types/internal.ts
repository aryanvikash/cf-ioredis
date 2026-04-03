import type { RedisKey, RedisValue, SetOptions } from './commands'

export interface EncodedValueEnvelope {
  type: 'string' | 'binary'
  encoding: 'utf8' | 'base64'
  value: string
}

export interface WorkerGetResponse {
  key: RedisKey
  entry: {
    value: EncodedValueEnvelope | null
    ttlMs: number | null
  }
}

export interface WorkerSetRequest {
  key: RedisKey
  value: EncodedValueEnvelope
  options?: SetOptions
}

export interface WorkerSetResponse {
  ok: boolean
  applied: boolean
  previous?: EncodedValueEnvelope | null
}

export interface WorkerBatchGetResponse {
  entries: Array<WorkerGetResponse['entry']>
}

export interface WorkerDeleteResponse {
  deleted: number
}

export interface WorkerExistsResponse {
  count: number
}

export interface WorkerPersistResponse {
  persisted: boolean
}

export interface WorkerTypeResponse {
  type: 'string' | 'none'
}

export interface WorkerMSetRequest {
  entries: Array<{
    key: RedisKey
    value: EncodedValueEnvelope
    options?: SetOptions
  }>
}

export interface WorkerPublishRequest {
  channel: string
  message: string
}

export interface WorkerPublishResponse {
  receivers: number
}

export interface WsRequestEnvelope {
  id: string
  action: string
  payload?: unknown
}

export interface WsResponseEnvelope {
  id: string
  ok: boolean
  data?: unknown
  error?: {
    message: string
    code?: string
  }
}

export interface PubSubSubscribeFrame {
  type: 'subscribe'
  channels: string[]
}

export interface PubSubUnsubscribeFrame {
  type: 'unsubscribe'
  channels?: string[]
}

export interface PubSubPingFrame {
  type: 'ping'
}

export interface PubSubPublishFrame {
  type: 'publish'
  channel: string
  message: string
}

export type PubSubClientFrame = PubSubSubscribeFrame | PubSubUnsubscribeFrame | PubSubPingFrame | PubSubPublishFrame

export interface PubSubSubscribeAckFrame {
  type: 'subscribe'
  channel: string
  count: number
}

export interface PubSubUnsubscribeAckFrame {
  type: 'unsubscribe'
  channel: string
  count: number
}

export interface PubSubMessageFrame {
  type: 'message'
  channel: string
  message: string
}

export interface PubSubPongFrame {
  type: 'pong'
}

export interface PubSubPublishAckFrame {
  type: 'publish'
  channel: string
  receivers: number
}

export interface PubSubErrorFrame {
  type: 'error'
  message: string
  code?: string
}

export type PubSubServerFrame =
  | PubSubSubscribeAckFrame
  | PubSubUnsubscribeAckFrame
  | PubSubMessageFrame
  | PubSubPongFrame
  | PubSubPublishAckFrame
  | PubSubErrorFrame
