import { StorageProvider } from '../storage/StorageProvider'
import { SessionContent } from '../../shared/types'
import { WorkflowMutex } from '../automation/WorkflowMutex'

const COLLECTION = 'contents'
const contentLocks = new Map<string, WorkflowMutex>()

export type SessionContentMetadataPatch = Pick<
  SessionContent,
  'absentStudentIds' | 'postedToLms' | 'zaloSentAt'
>

function mergeAbsentIds(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (existing === undefined && incoming === undefined) return undefined
  return [...new Set([...(existing ?? []), ...(incoming ?? [])])]
}

function latestTimestamp(
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  const existingTime = Date.parse(existing)
  const incomingTime = Date.parse(incoming)
  if (Number.isNaN(existingTime) || Number.isNaN(incomingTime)) return existing
  return incomingTime > existingTime ? incoming : existing
}

function mergeMetadata(
  content: SessionContent,
  existing: SessionContent | null,
  patch: Partial<SessionContentMetadataPatch> = {},
): SessionContent {
  const absentStudentIds = mergeAbsentIds(
    existing?.absentStudentIds,
    mergeAbsentIds(content.absentStudentIds, patch.absentStudentIds),
  )
  const postedToLms = Boolean(
    existing?.postedToLms || content.postedToLms || patch.postedToLms,
  )
  const zaloSentAt = latestTimestamp(
    existing?.zaloSentAt,
    latestTimestamp(content.zaloSentAt, patch.zaloSentAt),
  )

  const merged: SessionContent = { ...content }
  if (absentStudentIds !== undefined) merged.absentStudentIds = absentStudentIds
  else delete merged.absentStudentIds
  if (postedToLms) merged.postedToLms = true
  else delete merged.postedToLms
  if (zaloSentAt) merged.zaloSentAt = zaloSentAt
  else delete merged.zaloSentAt
  return merged
}

export class ContentRepository {
  constructor(private readonly storage: StorageProvider) {}

  get(sessionId: string): Promise<SessionContent | null> {
    return this.storage.read<SessionContent>(COLLECTION, sessionId)
  }

  save(content: SessionContent): Promise<void> {
    return this.withSessionLock(content.sessionId, async () => {
      const existing = await this.storage.read<SessionContent>(COLLECTION, content.sessionId)
      await this.storage.write(
        COLLECTION,
        content.sessionId,
        mergeMetadata(content, existing),
      )
    })
  }

  updateMetadata(
    sessionId: string,
    patch: Partial<SessionContentMetadataPatch>,
  ): Promise<SessionContent | null> {
    return this.withSessionLock(sessionId, async () => {
      const existing = await this.storage.read<SessionContent>(COLLECTION, sessionId)
      if (!existing) return null
      const updated = mergeMetadata(existing, existing, patch)
      await this.storage.write(COLLECTION, sessionId, updated)
      return updated
    })
  }

  private withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.storage.concurrencyKey(COLLECTION, sessionId)
    let lock = contentLocks.get(key)
    if (!lock) {
      lock = new WorkflowMutex()
      contentLocks.set(key, lock)
    }
    return lock.runExclusive(operation)
  }
}
