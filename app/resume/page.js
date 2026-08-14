'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

// 対象セッションのRealtime Presenceチャンネルに一時的に相乗りし、
// 「host」ロールで在室している人がいるかどうかを確認する。
// 自分自身はtrack()しない（在室者としてカウントされないようにするため）。
function checkHostPresence(sessionId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false
    const channel = supabase.channel('session_' + sessionId, {
      config: { presence: { key: 'entry-check-' + Math.random().toString(36).slice(2) } },
    })
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      supabase.removeChannel(channel)
      resolve(result)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const hasHost = Object.values(state).some(arr => arr[0]?.role === 'host')
        finish(hasHost)
      })
      .subscribe()
  })
}

export default function Resume() {
  const router = useRouter()
  const [mySessions, setMySessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [checkingId, setCheckingId] = useState(null)

  useEffect(() => {
    (async () => {
      const user = await ensureAnonUser()
      const { data } = await supabase
        .from('session_participants')
        .select('role, sessions(id, session_code, scenario_name, status)')
        .eq('user_id', user.id)
      const active = (data || [])
        .filter(row => row.sessions && row.sessions.status === 'active')
        .map(row => ({ ...row.sessions, myRole: row.role }))
      setMySessions(active)
      setLoadingSessions(false)
    })()
  }, [])

  async function resumeSession(session) {
    // session_participants にこのユーザーの行がすでに存在する（＝一覧に出ている）時点で
    // 参加資格そのものは確認済みのため、パスワードの再入力は不要。
    // ただし参加者（プレイヤー）については、ホストが不在の部屋には入れないようにする。
    // ホスト自身の再開はこのチェックの対象外。
    if (session.myRole !== 'host') {
      setCheckingId(session.id)
      const hostOnline = await checkHostPresence(session.id)
      setCheckingId(null)
      if (!hostOnline) {
        alert('現在ホストが不在のため、入室できません。ホストがオンラインになってから、もう一度お試しください。')
        return
      }
    }

    localStorage.setItem('wwcoc_session_id', session.id)
    localStorage.setItem('wwcoc_role', session.myRole === 'host' ? 'host' : 'player')
    router.push('/chat?session=' + session.id)
  }

  return (
    <div className="wrap narrow">
      <div className="top-hero">
        <h1>セッションを再開する</h1>
        <p className="sub">参加中のセッション一覧です。クリックして再開してください。</p>
      </div>

      {loadingSessions && (
        <p className="mono small-text" style={{ textAlign: 'center' }}>読み込み中...</p>
      )}

      {!loadingSessions && mySessions.length === 0 && (
        <div className="card">
          <p className="mono small-text" style={{ textAlign: 'center', margin: 0 }}>
            現在参加中のセッションはありません。
          </p>
        </div>
      )}

      {!loadingSessions && mySessions.length > 0 && (
        <div className="card">
          {mySessions.map(s => (
            <div key={s.id} className="entry" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="what">
                {s.scenario_name || '（シナリオ名未設定）'}
                <span className="mono small-text" style={{ marginLeft: 8 }}>
                  {s.myRole === 'host' ? 'HOST' : 'PLAYER'}
                </span>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  className="plain primary"
                  disabled={checkingId === s.id}
                  onClick={() => resumeSession(s)}
                >
                  {checkingId === s.id ? '確認中…' : '再開する →'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/" className="back-link" style={{ display: 'inline-flex', justifyContent: 'center', margin: 0 }}>
          ← トップに戻る
        </Link>
      </p>
    </div>
  )
}
