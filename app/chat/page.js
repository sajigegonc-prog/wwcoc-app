'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

function ChatInner() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session')

  const [role, setRole] = useState(null)
  const [character, setCharacter] = useState(null)
  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [skillChoice, setSkillChoice] = useState('')

  useEffect(() => {
    if (!sessionId) return
    (async () => {
      await ensureAnonUser()
      setRole(localStorage.getItem('wwcoc_role'))
      const charId = localStorage.getItem('wwcoc_character_id')
      if (charId) {
        const { data } = await supabase.from('characters').select('*').eq('id', charId).single()
        setCharacter(data)
      }
      await loadSession()
      await loadEntries()
    })()
  }, [sessionId])

  async function loadSession() {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    setSession(data)
    return data
  }

  async function loadEntries() {
    const { data: s } = await supabase.from('sessions').select('turn_number').eq('id', sessionId).single()
    const turn = s?.turn_number || 1
    const { data: actions } = await supabase
      .from('turn_actions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('turn_number', turn)
      .order('created_at')
    setEntries(actions || [])
  }

  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('session_' + sessionId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'turn_actions', filter: `session_id=eq.${sessionId}` },
        () => loadEntries())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        () => { loadSession().then(loadEntries) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function confirmAction(standby) {
    const who = character?.name || '無名の探索者'
    const body = standby ? '（今回は待機します）' : text.trim()
    if (!standby && !body) return
    const { error } = await supabase.from('turn_actions').insert({
      session_id: sessionId,
      turn_number: session?.turn_number || 1,
      character_name: who,
      text: body,
      is_standby: standby,
    })
    if (error) { alert('送信に失敗しました: ' + error.message); return }
    setText('')
  }

  function insertSkill() {
    if (!skillChoice) return
    const [name, value] = skillChoice.split('|')
    const tag = `［${name}${value}を使用］`
    setText(t => (t ? t + ' ' + tag : tag))
  }

  async function nextTurn() {
    const { error } = await supabase
      .from('sessions')
      .update({ turn_number: (session?.turn_number || 1) + 1 })
      .eq('id', sessionId)
    if (error) alert('更新に失敗しました: ' + error.message)
  }

  async function endSession() {
    if (!window.confirm('探索を終了しますか？')) return
    await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId)
    router.push('/')
  }

  async function copyToAI() {
    if (entries.length === 0) { alert('確定した行動がありません'); return }
    const body = entries.map(e => `${e.character_name}：\n${e.text}`).join('\n\n')
    const full = `【探索者行動】\n\n今回のターン行動：\n\n${body}\n\n以上。\nこの行動を処理してください。`
    try {
      await navigator.clipboard.writeText(full)
      alert('コピーしました')
    } catch {
      prompt('コピーできませんでした。以下を手動でコピーしてください:', full)
    }
  }

  async function bulkCopySheets() {
    const { data: rows, error } = await supabase
      .from('session_participants')
      .select('characters(name, raw_text)')
      .eq('session_id', sessionId)
    if (error) { alert('取得に失敗しました: ' + error.message); return }
    const full = '以下、参加探索者の一覧です。\n\n' +
      (rows || []).map(r => `===== ${r.characters?.name} =====\n${r.characters?.raw_text || ''}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(full)
      alert('全員分をコピーしました')
    } catch {
      prompt('コピーできませんでした。以下を手動でコピーしてください:', full)
    }
  }

  const isHost = role === 'host'
  const skillGroups = character?.parsed?.skills

  return (
    <div className="wrap">
      <div className="back-link" style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>
        ← トップへ戻る（セッション退出）
      </div>
      <div className="eyebrow">WWCoC / 行動宣言チャット</div>
      <h1 className="small">行動宣言チャット</h1>

      <div className="row-between">
        <div className="selected-strip" style={{ flex: 1 }}>
          使用中の探索者：<strong>{character?.name || '未選択'}</strong>
        </div>
        <span className="turn-badge">{isHost ? 'HOST' : 'PLAYER'}</span>
      </div>

      {isHost && (
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="plain" onClick={bulkCopySheets}>全員分をAI提出用にコピー</button>
          <button className="plain" style={{ borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={endSession}>
            探索を終了する
          </button>
        </div>
      )}

      <div className="card">
        <div className="row-between" style={{ marginBottom: 0 }}>
          <span className="mono small-text">今回の行動を入力</span>
          <span className="turn-badge">TURN {session?.turn_number || 1}</span>
        </div>
        <textarea
          className="transcript-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="ここに行動宣言を入力してください…"
        />

        {skillGroups && (skillGroups.explore?.length || skillGroups.social?.length || skillGroups.action?.length) ? (
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <select value={skillChoice} onChange={e => setSkillChoice(e.target.value)} style={{ flex: 1 }}>
              <option value="">技能を選択…</option>
              {skillGroups.explore?.length > 0 && (
                <optgroup label="探索系">
                  {skillGroups.explore.map((s, i) => <option key={i} value={`${s.name}|${s.value}`}>{s.name}　{s.value}</option>)}
                </optgroup>
              )}
              {skillGroups.social?.length > 0 && (
                <optgroup label="対人系">
                  {skillGroups.social.map((s, i) => <option key={i} value={`${s.name}|${s.value}`}>{s.name}　{s.value}</option>)}
                </optgroup>
              )}
              {skillGroups.action?.length > 0 && (
                <optgroup label="行動系">
                  {skillGroups.action.map((s, i) => <option key={i} value={`${s.name}|${s.value}`}>{s.name}　{s.value}</option>)}
                </optgroup>
              )}
            </select>
            <button className="plain" onClick={insertSkill}>技能を挿入</button>
          </div>
        ) : null}

        <div className="actions">
          <button className="plain" onClick={() => setText('')}>取り消し</button>
          <button className="plain" onClick={() => confirmAction(true)}>待機する</button>
          <button className="plain primary" disabled={!text.trim()} onClick={() => confirmAction(false)}>行動確定 ✓</button>
        </div>
      </div>

      <div className="card">
        <div className="log-title">Turn {session?.turn_number || 1} — 確定済み行動</div>
        {entries.length === 0 && <div className="empty-state">まだ確定した行動はありません。</div>}
        {entries.map(e => (
          <div key={e.id} className="entry" style={{ opacity: e.is_standby ? 0.65 : 1 }}>
            <span className="who">{e.character_name}</span>
            <span className="what" style={{ fontStyle: e.is_standby ? 'italic' : 'normal' }}>{e.text}</span>
            <span className="check">{e.is_standby ? '待機 ー' : '確定済み ✓'}</span>
          </div>
        ))}
        <div className="actions between">
          <span className="mono small-text">{entries.length} 件</span>
          <div style={{ display: 'flex', gap: 10 }}>
            {isHost && <button className="plain" onClick={nextTurn}>次のターンへ進む →</button>}
            {isHost && <button className="plain primary" onClick={copyToAI}>AIへコピー</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Chat() {
  return (
    <Suspense fallback={<div className="wrap">読み込み中…</div>}>
      <ChatInner />
    </Suspense>
  )
}
