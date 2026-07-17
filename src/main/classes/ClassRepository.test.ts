import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider } from '../storage/LocalStorageProvider'
import { ClassRepository } from './ClassRepository'
import { SchoolClass } from '../../shared/types'

function makeClass(id: string, code: string): SchoolClass {
  return { id, code, name: `Lớp ${code}`, students: [], sessions: [] }
}

let dir: string
let repo: ClassRepository
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cls-'))
  repo = new ClassRepository(new LocalStorageProvider(dir))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('ClassRepository', () => {
  it('list rỗng khi chưa có lớp', async () => {
    expect(await repo.list()).toEqual([])
  })
  it('save rồi get trả lại đúng lớp', async () => {
    const c = makeClass('c1', 'A1')
    await repo.save(c)
    expect(await repo.get('c1')).toEqual(c)
  })
  it('get trả null khi không có', async () => {
    expect(await repo.get('nope')).toBeNull()
  })
  it('list trả tất cả lớp đã lưu', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.save(makeClass('c2', 'A2'))
    const codes = (await repo.list()).map(c => c.code).sort()
    expect(codes).toEqual(['A1', 'A2'])
  })
  it('save ghi đè lớp cùng id', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.save({ ...makeClass('c1', 'A1'), name: 'Đổi tên' })
    expect((await repo.get('c1'))?.name).toBe('Đổi tên')
    expect(await repo.list()).toHaveLength(1)
  })
  it('delete xóa lớp', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.delete('c1')
    expect(await repo.get('c1')).toBeNull()
  })
})
