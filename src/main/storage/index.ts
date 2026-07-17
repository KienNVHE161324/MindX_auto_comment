import { AppConfig } from '../../shared/types'
import { StorageProvider } from './StorageProvider'
import { LocalStorageProvider } from './LocalStorageProvider'

export { LocalStorageProvider }
export type { StorageProvider }

export function createStorageProvider(config: AppConfig): StorageProvider {
  if (config.storageBackend === 'local') {
    if (!config.localFolderPath) {
      throw new Error('Chưa chọn thư mục lưu dữ liệu (localFolderPath).')
    }
    return new LocalStorageProvider(config.localFolderPath)
  }
  throw new Error('Backend Supabase chưa được hỗ trợ ở bản này (sẽ có ở phase sau).')
}
