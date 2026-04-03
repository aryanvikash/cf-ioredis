export function applyKeyPrefix(key: string, keyPrefix: string): string {
  return keyPrefix ? `${keyPrefix}${key}` : key
}

export function applyKeyPrefixToMany(keys: string[], keyPrefix: string): string[] {
  return keys.map((key) => applyKeyPrefix(key, keyPrefix))
}
