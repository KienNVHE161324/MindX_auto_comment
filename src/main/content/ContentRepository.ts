import { StorageProvider } from '../storage/StorageProvider'
import { SessionContent } from '../../shared/types'

const COLLECTION = 'contents'

export class ContentRepository {
  constructor(private readonly storage: StorageProvider) {}

  get(sessionId: string): Promise<SessionContent | null> {
    return this.storage.read<SessionContent>(COLLECTION, sessionId)
  }

  save(content: SessionContent): Promise<void> {
    return this.storage.write(COLLECTION, content.sessionId, content)
  }
}
