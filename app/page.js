'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import { ensureAnonUser } from '../lib/auth'

export default function Home() {
  const router = useRouter()
  const [mySessions, setMySessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)

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

  function resumeSession(session) {
    if (session.myRole === 'host') {
      localStorage.setItem('wwcoc_session_id', session.id)
      localStorage.setItem('wwcoc_role', 'host')
      router.push('/chat?session=' + session.id)
    } else {
      router.push('/join?code=' + encodeURIComponent(session.session_code))
    }
  }

  return (
    <div className="wrap narrow">
      <div className="top-hero">
        <h1>WWCoC セッション管理アプリ</h1>
        <p className="sub">ハリー・ポッター×クトゥルフ神話TRPGを、AI KPと一緒に遊ぶための卓管理アプリ。</p>
      </div>

      {!loadingSessions && mySessions.length > 0 && (
        <div className="card">
          <div className="mono small-text" style={{ marginBottom: 10 }}>セッション一覧（再開する）</div>
          {mySessions.map(s => (
            <div key={s.id} className="entry" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="what">
                {s.scenario_name || '（シナリオ名未設定）'}
                <span className="mono small-text" style={{ marginLeft: 8 }}>
                  {s.myRole === 'host' ? 'HOST' : 'PLAYER'}
                </span>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button className="plain primary" onClick={() => resumeSession(s)}>再開する →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="top-menu">
        <Link href="/select?flow=host" className="top-btn primary">
          <div><div>ホストとして始める</div><span className="desc">セッションを新規に立ち上げる</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/select?flow=join" className="top-btn">
          <div><div>チャットに参加する</div><span className="desc">セッションIDとパスワードで参加</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/register" className="top-btn">
          <div><div>探索者登録</div><span className="desc">探索者シートを事前に登録・管理する</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/select?flow=solo" className="top-btn">
          <div><div>ソロダイス</div><span className="desc">セッションを作らず、探索者を選んでダイスだけ振る</span></div>
          <span className="arrow">→</span>
        </Link>
      </div>

      <p style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/login" className="back-link" style={{ display: 'inline-flex', justifyContent: 'center', margin: 0 }}>
          IDでログイン（データを復元／別の端末で続ける）
        </Link>
      </p>
    </div>
  )
}
