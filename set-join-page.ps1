@'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

export default function Join() {
  const router = useRouter()
  const [sessionCode, setSessionCode] = useState('WWCOC-')
  const [password, setPassword] = useState('MAGIC-')
  const [busy, setBusy] = useState(false)

  async function joinSession() {
    if (sessionCode.trim() === 'WWCOC-' || password.trim() === 'MAGIC-' || !sessionCode.trim() || !password.trim()) {
      alert('セッションIDとパスワードを入力してください')
      return
    }
    setBusy(true)
    try {
      const user = await ensureAnonUser()
      const { data: sessionId, error } = await supabase.rpc('join_session', {
        p_session_code: sessionCode.trim(),
        p_password: password.trim(),
      })
      if (error) throw error

      const characterId = localStorage.getItem('wwcoc_character_id')
      await supabase.from('session_participants').insert({
        session_id: sessionId,
        character_id: characterId,
        user_id: user.id,
        role: 'player',
      })
      localStorage.setItem('wwcoc_session_id', sessionId)
      localStorage.setItem('wwcoc_role', 'player')
      router.push('/chat?session=' + sessionId)
    } catch (err) {
      alert('参加に失敗しました: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap narrow">
      <Link href="/select?flow=join" className="back-link">← 探索者選択へ戻る</Link>
      <div className="eyebrow">WWCoC / 参加</div>
      <h1 className="small">セッションに参加</h1>
      <div className="card">
        <div className="ffield">
          <label>セッションID</label>
          <input value={sessionCode} onChange={e => setSessionCode(e.target.value)} placeholder="WWCOC-58291" />
        </div>
        <div className="ffield">
          <label>パスワード</label>
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="MAGIC-742" />
        </div>
        <div className="actions">
          <button className="plain primary" onClick={joinSession} disabled={busy}>
            {busy ? '参加中…' : '参加してチャットへ進む →'}
          </button>
        </div>
      </div>
    </div>
  )
}
'@ | Set-Content -Path "C:\Users\madoc\wwcoc-app\app\join\page.js" -Encoding UTF8
