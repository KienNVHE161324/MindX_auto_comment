import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppConfig, DEFAULT_CONFIG } from '../../shared/types'

export class ConfigStore {
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, 'config.json')
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG }
      throw err
    }
  }

  async save(config: AppConfig): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf-8')
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.load()
    const next = { ...current, ...patch }
    await this.save(next)
    return next
  }
}
