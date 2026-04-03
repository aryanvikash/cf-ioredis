import { UnsupportedCommandError } from '../core/errors'
import { commandRegistry } from './registry'

export function assertCommandSupported(name: string, allowEmulatedCommands: boolean): void {
  const metadata = commandRegistry[name]

  if (!metadata || metadata.status === 'unsupported') {
    throw new UnsupportedCommandError(name)
  }

  if (metadata.status === 'emulated' && !allowEmulatedCommands) {
    throw new UnsupportedCommandError(name, `Command \`${name}\` is emulated and requires \`allowEmulatedCommands: true\``)
  }
}
