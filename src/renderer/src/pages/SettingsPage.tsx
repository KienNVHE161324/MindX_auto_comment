import { useEffect, useState } from 'react'
import { AppConfig, DEFAULT_CONFIG } from '../../../shared/types'

type KeyStatus = { checked: boolean; valid: boolean; error?: string }

export default function SettingsPage(): JSX.Element {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ checked: false, valid: false })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]): void => {
    setConfig(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) set('localFolderPath', folder)
  }

  const checkKey = async (): Promise<void> => {
    const res = await window.api.validateGeminiKey(config.geminiApiKey ?? '')
    setKeyStatus({ checked: true, valid: res.valid, error: res.error })
  }

  const save = async (): Promise<void> => {
    await window.api.updateConfig(config)
    setSaved(true)
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: 'system-ui' }}>
      <h1>Cấu hình</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Kho dữ liệu</h2>
        <label>
          <input
            type="radio"
            name="backend"
            checked={config.storageBackend === 'local'}
            onChange={() => set('storageBackend', 'local')}
          />
          Thư mục trên máy (local)
        </label>
        <br />
        <label style={{ color: '#999' }}>
          <input
            type="radio"
            name="backend"
            disabled
            checked={config.storageBackend === 'supabase'}
          />
          Supabase (chưa khả dụng — phase sau)
        </label>
        <div style={{ marginTop: 8 }}>
          <button onClick={chooseFolder}>Chọn thư mục…</button>{' '}
          <span>{config.localFolderPath ?? '(chưa chọn)'}</span>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Gemini API</h2>
        <label htmlFor="gemini-key">API key Gemini</label>
        <br />
        <input
          id="gemini-key"
          type="password"
          value={config.geminiApiKey ?? ''}
          onChange={e => { set('geminiApiKey', e.target.value); setKeyStatus({ checked: false, valid: false }) }}
          style={{ width: 360 }}
        />{' '}
        <button onClick={checkKey}>Kiểm tra key</button>
        {keyStatus.checked && (
          <div style={{ color: keyStatus.valid ? 'green' : 'crimson' }}>
            {keyStatus.valid ? '✓ Key hợp lệ' : `✗ ${keyStatus.error ?? 'Key không hợp lệ'}`}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Mẫu tin nhắn Zalo</h2>
        <label htmlFor="zalo-template">Mẫu tin nhắn Zalo</label>
        <br />
        <textarea
          id="zalo-template"
          value={config.zaloMessageTemplate}
          onChange={e => set('zaloMessageTemplate', e.target.value)}
          rows={10}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </section>

      <button onClick={save}>Lưu</button>
      {saved && <span style={{ marginLeft: 12, color: 'green' }}>Đã lưu ✓</span>}
    </div>
  )
}
