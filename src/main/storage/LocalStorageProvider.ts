import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StorageProvider } from './StorageProvider'
import { WorkflowMutex } from '../automation/WorkflowMutex'

const storageWriteLocks = new Map<string, WorkflowMutex>()

export function makeUniqueTempPath(target: string): string {
  return `${target}.${process.pid}.${randomUUID()}.tmp`
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private dirOf(collection: string): string {
    return join(this.baseDir, collection)
  }
  private pathOf(collection: string, id: string): string {
    return join(this.dirOf(collection), `${id}.json`)
  }

  concurrencyKey(collection: string, id: string): string {
    return this.pathOf(collection, id)
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
    const target = this.pathOf(collection, id)
    let lock = storageWriteLocks.get(target)
    if (!lock) {
      lock = new WorkflowMutex()
      storageWriteLocks.set(target, lock)
    }
    await lock.runExclusive(async () => {
      await fs.mkdir(this.dirOf(collection), { recursive: true })
      // Ghi atomic: mỗi write có file tạm riêng, rồi đổi tên dưới khóa theo target.
      const tmp = makeUniqueTempPath(target)
      try {
        await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
        await fs.rename(tmp, target)
      } finally {
        await fs.unlink(tmp).catch(err => {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        })
      }
    })
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
