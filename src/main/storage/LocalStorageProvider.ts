import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { StorageProvider } from './StorageProvider'

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private dirOf(collection: string): string {
    return join(this.baseDir, collection)
  }
  private pathOf(collection: string, id: string): string {
    return join(this.dirOf(collection), `${id}.json`)
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.pathOf(collection, id), 'utf-8')
      return JSON.parse(raw) as T
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async write<T>(collection: string, id: string, data: T): Promise<void> {
    await fs.mkdir(this.dirOf(collection), { recursive: true })
    // Ghi atomic: ghi file tạm rồi đổi tên, tránh để lại file JSON hỏng nếu gián đoạn giữa chừng.
    const target = this.pathOf(collection, id)
    const tmp = `${target}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(tmp, target)
  }

  async list<T>(collection: string): Promise<T[]> {
    let files: string[]
    try {
      files = await fs.readdir(this.dirOf(collection))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    return Promise.all(
      jsonFiles.map(async f => {
        const raw = await fs.readFile(join(this.dirOf(collection), f), 'utf-8')
        return JSON.parse(raw) as T
      }),
    )
  }

  async delete(collection: string, id: string): Promise<void> {
    try {
      await fs.unlink(this.pathOf(collection, id))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}
