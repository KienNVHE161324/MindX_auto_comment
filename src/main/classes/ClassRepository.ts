import { StorageProvider } from '../storage/StorageProvider'
import { SchoolClass } from '../../shared/types'

const COLLECTION = 'classes'

export class ClassRepository {
  constructor(private readonly storage: StorageProvider) {}

  list(): Promise<SchoolClass[]> {
    return this.storage.list<SchoolClass>(COLLECTION)
  }

  get(id: string): Promise<SchoolClass | null> {
    return this.storage.read<SchoolClass>(COLLECTION, id)
  }

  save(cls: SchoolClass): Promise<void> {
    return this.storage.write(COLLECTION, cls.id, cls)
  }

  delete(id: string): Promise<void> {
    return this.storage.delete(COLLECTION, id)
  }
}
