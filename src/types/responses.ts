export type StatusReply = 'OK'

export type BulkStringReply = string | null

export type IntegerReply = number

export type ExecReply = Array<[Error | null, unknown]>

export interface KvRecord {
  value: string | null
  ttlMs: number | null
}
