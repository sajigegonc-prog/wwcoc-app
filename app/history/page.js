'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

function HistoryInner() {
  const params = useSearchParams()
  const sessionId = params.get('session')
  const [session, setSession] = useState(null)
  const [actions, setActions] = useState([])
  const [rolls, setRolls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    (async () => {
      await ensureAnonUser()
      const { data: s } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
      setSession(s)
      const { data: a } = await supabase
        .from('turn_actions')
        .select('*')
        .eq('session_id', sessionId)
        .order('turn_number')
        .order('created_at')
      setActions(a || [])
      const { data: r } = await supabase
        .from('dice_rolls')
        .select('*')
        .eq('session_id', sessionId)
        .order('turn_number')
        .order('created_at')
      setRolls(r || [])
      setLoading(false)
    })()
  }, [sessionId])

  const turnNumbers = Array.from(new Set([
    ...actions.map(a => a.turn_number),
    ...rolls.map(r => r.turn_number),
  ])).sort((a, b) => a - b)

  return (
    <div className="wrap">
      <Link href={`/chat?session=${sessionId}`} className="back-link">← チャットへ戻る</Link>
      <div className="eyebrow">WWCoC / 全ターン履歴</div>
      <h1 className="small">{session?.name || 'セッション'} — 全ターン履歴</h1>
      <p className="sub">Turn 1から現在までの、確定行動と判定の記録です（閲覧専用）。</p>

      {loading && <div className="empty-state">読み込み中…</div>}

      {!loading && turnNumbers.length === 0 && (
        <div className="empty-state">まだ記録がありません。</div>
      )}

      {turnNumbers.map(turn => {
        const turnActions = actions.filter(a => a.turn_number === turn)
        const turnRolls = rolls.filter(r => r.turn_number === turn)
        return (
          <div key={turn} className="card">
            <div className="log-title">Turn {turn}</div>
            {turnActions.length === 0 && turnRolls.length === 0 && (
              <div className="dim" style={{ padding: '8px 0' }}>この回の記録はありません。</div>
            )}
            {turnActions.map(a => (
              <div key={a.id} className="entry" style={{ opacity: a.is_standby ? 0.65 : 1 }}>
                <span className="who">{a.character_name}</span>
                <span className="what" style={{ fontStyle: a.is_standby ? 'italic' : 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {a.text}
                </span>
                <span className="check">{a.is_standby ? '待機' : '確定済み'}</span>
              </div>
            ))}
            {turnRolls.length > 0 && (
              <>
                <div className="mono small-text" style={{ marginTop: 10, marginBottom: 4 }}>判定</div>
                {turnRolls.map(r => (
                  <div key={r.id} className="entry" style={{ opacity: r.voided ? 0.5 : 1, flexWrap: 'wrap', rowGap: 4 }}>
                    <span className="who">{r.character_name}</span>
                    <span className="what">
                      {r.skill_name ? `${r.skill_name}${r.skill_value || ''}` : '1D100'} → 出目 {r.roll}
                    </span>
                    <span className="check">{r.result || '出目のみ'}{r.voided ? '（取り消し）' : ''}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function History() {
  return (
    <Suspense fallback={<div className="wrap">読み込み中…</div>}>
      <HistoryInner />
    </Suspense>
  )
}
