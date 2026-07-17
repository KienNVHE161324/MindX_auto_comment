import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppConfig, DEFAULT_CONFIG } from '../../shared/types'

export class ConfigStore {
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, 'config.json')
  }

  async load(): Promise<AppConfig> {
    let raw: string
    try {
      raw = await fs.readFile(this.filePath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG }
      throw err
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      // File config.json hỏng (JSON không hợp lệ) → trở về mặc định thay vì làm treo app.
      return { ...DEFAULT_CONFIG }
    }
  }

  async save(config: AppConfig): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    // Ghi atomic: ghi ra file tạm rồi đổi tên, tránh để lại config.json hỏng nếu crash giữa chừng.
    const tmpPath = `${this.filePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
    await fs.rename(tmpPath, this.filePath)
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.load()
    const next = { ...current, ...patch }
    await this.save(next)
    return next
  }
}
