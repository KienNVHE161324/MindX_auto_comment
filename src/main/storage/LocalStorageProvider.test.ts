import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider } from './LocalStorageProvider'
import { createStorageProvider } from './index'
import { DEFAULT_CONFIG } from '../../shared/types'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'store-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('LocalStorageProvider', () => {
  it('read trả null khi chưa có item', async () => {
    const p = new LocalStorageProvider(dir)
    expect(await p.read('classes', 'c1')).toBeNull()
  })

  it('write rồi read trả lại đúng object', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1', name: 'Lop A' })
    expect(await p.read('classes', 'c1')).toEqual({ id: 'c1', name: 'Lop A' })
  })

  it('list trả tất cả item trong collection', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1' })
    await p.write('classes', 'c2', { id: 'c2' })
    const items = await p.list<{ id: string }>('classes')
    expect(items.map(i => i.id).sort()).toEqual(['c1', 'c2'])
  })

  it('list trả [] khi collection chưa tồn tại', async () => {
    const p = new LocalStorageProvider(dir)
    expect(await p.list('nope')).toEqual([])
  })

  it('delete xóa item, không lỗi nếu item không tồn tại', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1' })
    await p.delete('classes', 'c1')
    expect(await p.read('classes', 'c1')).toBeNull()
    await expect(p.delete('classes', 'ghost')).resolves.toBeUndefined()
  })
})

describe('createStorageProvider', () => {
  it('trả LocalStorageProvider khi backend = local', () => {
    const p = createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'local', localFolderPath: dir })
    expect(p).toBeInstanceOf(LocalStorageProvider)
  })

  it('ném lỗi khi backend = local nhưng thiếu thư mục', () => {
    expect(() => createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'local', localFolderPath: null }))
      .toThrow(/thư mục/i)
  })

  it('ném lỗi rõ ràng khi backend = supabase (chưa hỗ trợ M1)', () => {
    expect(() => createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'supabase' }))
      .toThrow(/supabase/i)
  })
})
