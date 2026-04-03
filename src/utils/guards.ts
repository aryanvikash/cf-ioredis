import { ConfigError } from '../core/errors'

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`\`${label}\` must be a positive integer`)
  }
}
