import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider, makeUniqueTempPath } from './LocalStorageProvider'
import { createStorageProvider } from './index'
import { DEFAULT_CONFIG } from '../../shared/types'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'store-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('LocalStorageProvider', () => {
  it('tạo đường dẫn file tạm riêng cho mỗi write', () => {
    const first = makeUniqueTempPath('C:\\data\\contents\\s1.json')
    const second = makeUniqueTempPath('C:\\data\\contents\\s1.json')

    expect(first).not.toBe(second)
    expect(first).toMatch(/s1\.json\..+\.tmp$/)
    expect(second).toMatch(/s1\.json\..+\.tmp$/)
  })

  it('read trả null khi chưa có item', async () => {
    const p = new LocalStorageProvider(dir)
    expect(await p.read('classes', 'c1')).toBeNull()
  })

  it('write rồi read trả lại đúng object', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1', name: 'Lop A' })
    expect(await p.read('classes', 'c1')).toEqual({ id: 'c1', name: 'Lop A' })
  })

  it('hai write đồng thời dùng file tạm riêng và đều hoàn tất', async () => {
    const p = new LocalStorageProvider(dir)

    await expect(Promise.all([
      p.write('classes', 'c1', { id: 'c1', name: 'Lớp A' }),
      p.write('classes', 'c1', { id: 'c1', name: 'Lớp B' }),
    ])).resolves.toEqual([undefined, undefined])

    expect((await p.read<{ name: string }>('classes', 'c1'))?.name)
      .toMatch(/^Lớp [AB]$/)
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
