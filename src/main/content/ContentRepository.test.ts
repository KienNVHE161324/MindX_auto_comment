import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider } from '../storage/LocalStorageProvider'
import { ContentRepository } from './ContentRepository'
import { SessionContent } from '../../shared/types'

function makeContent(sessionId: string): SessionContent {
  return { id: sessionId, classId: 'c1', sessionId, lessonContent: 'Bài 1', homework: '', comments: [] }
}

let dir: string
let repo: ContentRepository
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'content-'))
  repo = new ContentRepository(new LocalStorageProvider(dir))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('ContentRepository', () => {
  it('get trả null khi chưa có', async () => {
    expect(await repo.get('s1')).toBeNull()
  })
  it('save rồi get trả lại đúng nội dung', async () => {
    const c = makeContent('s1')
    await repo.save(c)
    expect(await repo.get('s1')).toEqual(c)
  })
  it('save ghi đè theo sessionId', async () => {
    await repo.save(makeContent('s1'))
    await repo.save({ ...makeContent('s1'), homework: 'Làm bài 5' })
    expect((await repo.get('s1'))?.homework).toBe('Làm bài 5')
  })

  it('save draft stale vẫn giữ metadata mới và hợp nhất danh sách nghỉ', async () => {
    await repo.save({
      ...makeContent('s1'),
      absentStudentIds: ['s2'],
      lmsPostedStudentIds: ['s1'],
      postedToLms: true,
      zaloSentAt: '2026-07-23T10:00:00.000Z',
    })

    await repo.save({
      ...makeContent('s1'),
      lessonContent: 'Giáo viên vừa sửa',
      absentStudentIds: ['s1'],
    })

    expect(await repo.get('s1')).toEqual(expect.objectContaining({
      lessonContent: 'Giáo viên vừa sửa',
      absentStudentIds: ['s2', 's1'],
      lmsPostedStudentIds: ['s1'],
      postedToLms: true,
      zaloSentAt: '2026-07-23T10:00:00.000Z',
    }))
  })

  it('serialize update metadata với save draft để không mất thay đổi của bên nào', async () => {
    const base = makeContent('s1')
    await repo.save(base)

    await Promise.all([
      repo.updateMetadata('s1', {
        absentStudentIds: ['s2'],
        lmsPostedStudentIds: ['s1'],
        postedToLms: true,
      }),
      repo.save({ ...base, homework: 'Bài giáo viên vừa nhập' }),
    ])

    expect(await repo.get('s1')).toEqual(expect.objectContaining({
      homework: 'Bài giáo viên vừa nhập',
      absentStudentIds: ['s2'],
      lmsPostedStudentIds: ['s1'],
      postedToLms: true,
    }))
  })
})
