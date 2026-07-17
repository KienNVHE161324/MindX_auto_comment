import { useState } from 'react'
import SettingsPage from './pages/SettingsPage'
import ClassesPage from './pages/ClassesPage'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<'classes' | 'settings'>('classes')
  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setTab('classes')} disabled={tab === 'classes'}>Lớp học</button>
        <button onClick={() => setTab('settings')} disabled={tab === 'settings'}>Cấu hình</button>
      </nav>
      {tab === 'classes' ? <ClassesPage /> : <SettingsPage />}
    </div>
  )
}
