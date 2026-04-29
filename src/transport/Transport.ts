export interface Transport {
  request<T>(action: string, payload?: unknown): Promise<T>
  close(): Promise<void>
}
