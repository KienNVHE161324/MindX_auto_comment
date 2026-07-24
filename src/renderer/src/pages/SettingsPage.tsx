import { useEffect, useState } from 'react'
import { AppConfig, DEFAULT_CONFIG } from '../../../shared/types'

type KeyStatus = { checked: boolean; valid: boolean; error?: string }

export default function SettingsPage(): JSX.Element {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ checked: false, valid: false })
  const [saved, setSaved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lmsSaved, setLmsSaved] = useState(false)

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]): void => {
    setConfig(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) {
      set('localFolderPath', folder)
      // Lưu ngay thư mục để tab Lớp học dùng được mà không cần bấm "Lưu".
      await window.api.updateConfig({ localFolderPath: folder })
    }
  }

  const checkKey = async (): Promise<void> => {
    const res = await window.api.validateGeminiKey(config.geminiApiKey ?? '')
    setKeyStatus({ checked: true, valid: res.valid, error: res.error })
  }

  const save = async (): Promise<void> => {
    await window.api.updateConfig(config)
    setSaved(true)
  }

  // Lưu ngay tài khoản LMS khi rời ô nhập. Nhận patch trực tiếp từ sự kiện để tránh
  // stale-closure (giá trị vừa gõ chưa kịp commit vào state) làm mất email/mật khẩu.
  const persistLms = async (patch: Partial<AppConfig>): Promise<void> => {
    await window.api.updateConfig(patch)
    setLmsSaved(true)
  }

  return (
    <div className="page">
      <h1 style={{ marginBottom: 20 }}>Cấu hình</h1>

      <section className="section">
        <h2>Kho dữ liệu</h2>
        <label className="check" style={{ marginBottom: 6 }}>
          <input
            type="radio"
            name="backend"
            checked={config.storageBackend === 'local'}
            onChange={() => set('storageBackend', 'local')}
          />
          Thư mục trên máy (local)
        </label>
        <br />
        <label className="check text-muted" style={{ marginBottom: 12 }}>
          <input
            type="radio"
            name="backend"
            disabled
            checked={config.storageBackend === 'supabase'}
          />
          Supabase (chưa khả dụng — phase sau)
        </label>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={chooseFolder}>Chọn thư mục…</button>
          <span className="mono text-muted">{config.localFolderPath ?? '(chưa chọn)'}</span>
        </div>
      </section>

      <section className="section">
        <h2>Gemini API</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="gemini-key">API key Gemini</label>
          <div className="btn-row">
            <input
              id="gemini-key"
              className="input"
              style={{ maxWidth: 420 }}
              type="password"
              value={config.geminiApiKey ?? ''}
              onChange={e => { set('geminiApiKey', e.target.value); setKeyStatus({ checked: false, valid: false }) }}
            />
            <button className="btn btn-sm" onClick={checkKey}>Kiểm tra key</button>
          </div>
          {keyStatus.checked && (
            <div className={keyStatus.valid ? 'text-success' : 'text-danger'} style={{ marginTop: 8 }}>
              {keyStatus.valid ? '✓ Key hợp lệ' : `✗ ${keyStatus.error ?? 'Key không hợp lệ'}`}
            </div>
          )}
        </div>
        <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
          <label htmlFor="gemini-model">Model Gemini</label>
          <input
            id="gemini-model"
            className="input"
            style={{ maxWidth: 320 }}
            list="gemini-model-options"
            value={config.geminiModel}
            onChange={e => set('geminiModel', e.target.value)}
            placeholder="gemini-flash-latest"
          />
          <datalist id="gemini-model-options">
            <option value="gemini-flash-latest" />
            <option value="gemini-2.5-flash" />
            <option value="gemini-2.0-flash" />
            <option value="gemini-flash-lite-latest" />
          </datalist>
          <p className="field-hint">
            Đổi model khi 1 model hết quota miễn phí (mỗi model có hạn mức riêng). Nhớ bấm "Lưu".
          </p>
        </div>
      </section>

      <section className="section">
        <h2>Mẫu tin nhắn Zalo</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="zalo-template">Mẫu tin nhắn Zalo</label>
          <textarea
            id="zalo-template"
            className="textarea mono"
            value={config.zaloMessageTemplate}
            onChange={e => set('zaloMessageTemplate', e.target.value)}
            rows={10}
          />
        </div>
      </section>

      <section className="section">
        <h2>Văn phong nhận xét</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="style-hint">Văn phong nhận xét (Gemini dùng khi sửa nhận xét)</label>
          <textarea
            id="style-hint"
            className="textarea"
            value={config.commentStyleHint}
            onChange={e => set('commentStyleHint', e.target.value)}
            rows={2}
          />
        </div>
        <label className="check" style={{ marginTop: 12, fontSize: 13, fontWeight: 450, color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={config.includeLessonInRewrite ?? false}
            onChange={e => set('includeLessonInRewrite', e.target.checked)}
          />
          Khi sửa nhận xét bằng AI, lồng nội dung bài học vào ngữ cảnh (nhận xét sát bài hơn)
        </label>
        <p className="field-hint" style={{ marginTop: 4, fontSize: 12 }}>Nhớ bấm "Lưu" sau khi đổi.</p>
      </section>

      <section className="section">
        <h2>Tài khoản LMS</h2>
        <p className="field-hint" style={{ margin: '0 0 12px' }}>
          App sẽ tự đăng nhập LMS khi cần — không phải nhập thủ công mỗi lần. Giá trị được lưu ngay khi bạn rời khỏi ô.
        </p>
        <div className="field">
          <label htmlFor="lms-email">Email LMS</label>
          <input
            id="lms-email"
            className="input"
            style={{ maxWidth: 320 }}
            type="email"
            value={config.lmsEmail ?? ''}
            onChange={e => { set('lmsEmail', e.target.value || null); setLmsSaved(false) }}
            onBlur={e => void persistLms({ lmsEmail: e.target.value || null })}
            placeholder="email@mindx.edu.vn"
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="lms-password">Mật khẩu LMS</label>
          <div className="btn-row">
            <input
              id="lms-password"
              className="input"
              style={{ maxWidth: 320 }}
              type={showPassword ? 'text' : 'password'}
              value={config.lmsPassword ?? ''}
              onChange={e => { set('lmsPassword', e.target.value || null); setLmsSaved(false) }}
              onBlur={e => void persistLms({ lmsPassword: e.target.value || null })}
            />
            <button
              type="button"
              className="btn btn-sm"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          {lmsSaved && <span className="text-success" style={{ fontSize: 13 }}>Đã lưu tài khoản LMS ✓</span>}
        </div>
      </section>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={save}>Lưu</button>
        {saved && <span className="text-success">Đã lưu ✓</span>}
      </div>
    </div>
  )
}
