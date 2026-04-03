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
