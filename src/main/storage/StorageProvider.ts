export interface StorageProvider {
  concurrencyKey(collection: string, id: string): string
  read<T>(collection: string, id: string): Promise<T | null>
  write<T>(collection: string, id: string, data: T): Promise<void>
  list<T>(collection: string): Promise<T[]>
  delete(collection: string, id: string): Promise<void>
}
