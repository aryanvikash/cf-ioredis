import type { ExecReply, KvRecord } from '../types/responses'
import type { QueuedCommand } from '../types/commands'

export async function executeQueuedCommands(commands: QueuedCommand[]): Promise<ExecReply> {
  const results: ExecReply = []

  for (const command of commands) {
    try {
      const result = await command.execute()
      results.push([null, result])
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      results.push([normalized, null])
    }
  }

  return results
}

export function mapKvRecordsToValues(records: KvRecord[]): Array<string | null> {
  return records.map((record) => record.value)
}
