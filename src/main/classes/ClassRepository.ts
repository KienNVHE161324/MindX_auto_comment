import { StorageProvider } from '../storage/StorageProvider'
import {
  AutoSendConfig,
  LegacyAutoSendConfig,
  SchoolClass,
} from '../../shared/types'
import { normalizeAutoSend } from '../../shared/autoSend'

const COLLECTION = 'classes'

type PersistedSchoolClass = Omit<SchoolClass, 'autoSend'> & {
  autoSend?: AutoSendConfig | LegacyAutoSendConfig
}

function normalizeClass(cls: PersistedSchoolClass): SchoolClass {
  return { ...cls, autoSend: normalizeAutoSend(cls.autoSend) }
}

export class ClassRepository {
  constructor(private readonly storage: StorageProvider) {}

  async list(): Promise<SchoolClass[]> {
    return (await this.storage.list<PersistedSchoolClass>(COLLECTION)).map(normalizeClass)
  }

  async get(id: string): Promise<SchoolClass | null> {
    const cls = await this.storage.read<PersistedSchoolClass>(COLLECTION, id)
    return cls ? normalizeClass(cls) : null
  }

  save(cls: SchoolClass): Promise<void> {
    return this.storage.write(COLLECTION, cls.id, normalizeClass(cls))
  }

  delete(id: string): Promise<void> {
    return this.storage.delete(COLLECTION, id)
  }
}
