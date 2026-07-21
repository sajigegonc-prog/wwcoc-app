'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
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
  const [userId, setUserId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [turnRolls, setTurnRolls] = useState([])
  const [participants, setParticipants] = useState([])
  const [ready, setReady] = useState(false)
  const [flashEvent, setFlashEvent] = useState(null)
  const isTypingRef = useRef(false)
  const channelRef = useRef(null)

  function displayName(c) {
    return c?.parsed?.firstName || c?.name || '無名の探索者'
  }

  function triggerFlash(roll) {
    const mode = isTypingRef.current ? 'banner' : 'full'
    setFlashEvent({ ...roll, mode })
    setTimeout(() => {
      setFlashEvent(current => (current && current.id === roll.id ? null : current))
    }, mode === 'banner' ? 4200 : 3200)
  }

  useEffect(() => {
    if (!sessionId) return
    (async () => {
      const user = await ensureAnonUser()
      setUserId(user.id)
      setRole(localStorage.getItem('wwcoc_role'))
      const charId = localStorage.getItem('wwcoc_character_id')
      if (charId) {
        const { data } = await supabase.from('characters').select('*').eq('id', charId).single()
        setCharacter(data)
      }
      const s = await loadSession()
      await loadEntries()
      await loadRolls(s?.turn_number || 1)
      setReady(true)
    })()
  }, [sessionId])

  async function loadRolls(turnNumber) {
    const { data } = await supabase
      .from('dice_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .eq('turn_number', turnNumber)
      .order('created_at')
    setTurnRolls(data || [])
  }

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
    if (!sessionId || !userId || !ready) return
    const channel = supabase
      .channel('session_' + sessionId, { config: { presence: { key: userId } } })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'turn_actions', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setEntries(prev => prev.some(e => e.id === payload.new.id) ? prev : [...prev, payload.new])
          loadEntries()
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'turn_actions', filter: `session_id=eq.${sessionId}` },
        (payload) => setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e)))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'turn_actions', filter: `session_id=eq.${sessionId}` },
        (payload) => setEntries(prev => prev.filter(e => e.id !== payload.old.id)))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setTurnRolls(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new])
          if (payload.new.result === 'クリティカル' || payload.new.result === 'ファンブル') {
            triggerFlash(payload.new)
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dice_rolls', filter: `session_id=eq.${sessionId}` },
        (payload) => setTurnRolls(prev => prev.map(r => r.id === payload.new.id ? payload.new : r)))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        () => { loadSession().then(s => { loadEntries(); loadRolls(s?.turn_number || 1) }) })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setParticipants(Object.values(state).map(arr => arr[0]).filter(Boolean))
      })
      .subscribe(async (status, err) => {
        console.log('[realtime] channel status:', status, err || '')
        if (status === 'SUBSCRIBED') {
          await channel.track({ character_name: displayName(character), role: role || 'player' })
        }
      })
    channelRef.current = channel
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [sessionId, userId, ready])

  // keep presence info up to date once character/role finish loading (or change)
  useEffect(() => {
    if (!channelRef.current) return
    channelRef.current.track({ character_name: displayName(character), role: role || 'player' })
  }, [character, role])

  // Realtime delivery has proven unreliable across accounts/browsers in testing.
  // Poll every few seconds as a guaranteed fallback so both sides stay in sync
  // even if the websocket push never arrives.
  useEffect(() => {
    if (!sessionId || !ready) return
    const interval = setInterval(() => {
      loadSession().then(s => {
        loadEntries()
        loadRolls(s?.turn_number || 1)
      })
    }, 2500)
    return () => clearInterval(interval)
  }, [sessionId, ready])

  async function confirmAction(standby) {
    const who = displayName(character)
    const body = standby ? '（今回は待機します）' : text.trim()
    if (!standby && !body) return
    const { data, error } = await supabase.from('turn_actions').insert({
      session_id: sessionId,
      turn_number: session?.turn_number || 1,
      character_name: who,
      full_name: character?.name || who,
      text: body,
      is_standby: standby,
      user_id: userId,
    }).select().single()
    if (error) { alert('送信に失敗しました: ' + error.message); return }
    setEntries(prev => prev.some(e => e.id === data.id) ? prev : [...prev, data])
    setText('')
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditText(entry.text)
  }

  async function saveEdit(entryId) {
    const newText = editText.trim()
    if (!newText) { alert('内容を入力してください'); return }
    const { error } = await supabase.from('turn_actions').update({ text: newText }).eq('id', entryId)
    if (error) { alert('修正に失敗しました: ' + error.message); return }
    setEditingId(null)
    setEditText('')
    loadEntries()
  }

  async function deleteEntry(entryId) {
    if (!window.confirm('この行動を取り消しますか？（このターンの判定があれば、それも取り消されて振り直せるようになります）')) return
    const { error } = await supabase.from('turn_actions').delete().eq('id', entryId)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    loadEntries()

    const turn = session?.turn_number || 1
    const activeRoll = turnRolls.find(r => r.user_id === userId && r.turn_number === turn && !r.voided)
    if (activeRoll) {
      const { error: voidError } = await supabase.from('dice_rolls').update({ voided: true }).eq('id', activeRoll.id)
      if (!voidError) {
        setTurnRolls(prev => prev.map(r => r.id === activeRoll.id ? { ...r, voided: true } : r))
      }
    }
  }

  const myRollThisTurn = turnRolls.find(r => r.user_id === userId && !r.voided)

  async function performRoll(skillName, skillValue) {
    if (myRollThisTurn) {
      alert(`このターンは既に判定済みです（${myRollThisTurn.skill_name ? myRollThisTurn.skill_name + '：' : ''}${myRollThisTurn.roll}${myRollThisTurn.result ? ' → ' + myRollThisTurn.result : '（出目のみ）'}）`)
      return
    }
    const roll = Math.floor(Math.random() * 100) + 1
    const hasValue = skillValue !== null && skillValue !== '' && !isNaN(parseInt(skillValue, 10))
    const result = hasValue ? judgeResult(roll, skillValue) : null
    const { data, error } = await supabase.from('dice_rolls').insert({
      session_id: sessionId,
      turn_number: session?.turn_number || 1,
      user_id: userId,
      character_name: displayName(character),
      skill_name: skillName || null,
      skill_value: hasValue ? skillValue : null,
      roll,
      result,
    }).select().single()
    if (error) {
      if (error.code === '23505') {
        alert('このターンは既に判定済みです')
        loadRolls(session?.turn_number || 1)
      } else {
        alert('判定に失敗しました: ' + error.message)
      }
      return
    }
    setTurnRolls(prev => [...prev, data])
    const tag = skillName
      ? (hasValue ? `［${skillName}${skillValue}で判定：${roll} → ${result}］` : `［${skillName}：出目 ${roll}（判定基準未入力）］`)
      : `［1D100：${roll}］`
    setText(t => (t ? t + ' ' + tag : tag))
  }

  function judgeResult(roll, skillValue) {
    const v = parseInt(skillValue, 10)
    if (roll === 100 || (v < 50 && roll >= 96)) return 'ファンブル'
    if (roll <= Math.floor(v / 5)) return 'クリティカル'
    if (roll <= Math.floor(v / 2)) return 'スペシャル'
    if (roll <= v) return '成功'
    return '失敗'
  }

  function rollSkillCheck() {
    if (!skillChoice) { alert('技能を選んでください'); return }
    const [name, value] = skillChoice.split('|')
    performRoll(name, value)
  }

  function rollPlainDice() {
    performRoll(null, null)
  }

  async function nextTurn() {
    const { data, error } = await supabase
      .from('sessions')
      .update({ turn_number: (session?.turn_number || 1) + 1 })
      .eq('id', sessionId)
      .select()
    if (error) { alert('更新に失敗しました: ' + error.message); return }
    if (!data || data.length === 0) {
      alert('ターンを更新できませんでした（ホスト権限が正しく認識されていない可能性があります）。ページを再読み込みしてから、もう一度お試しください。')
      return
    }
    setSession(data[0])
    setEntries([])
    setTurnRolls([])
  }

  async function endSession() {
    if (!window.confirm('探索を終了しますか？')) return
    await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId)
    router.push('/')
  }

  async function copyToAI() {
    if (entries.length === 0) { alert('確定した行動がありません'); return }
    const body = entries.map(e => `${e.full_name || e.character_name}：\n${e.text}`).join('\n\n')
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
          {character?.avatar?.src && (
            <span
              className="mini-portrait"
              style={{
                backgroundImage: `url(${character.avatar.src})`,
                backgroundSize: `${(character.avatar.zoom || 1) * 100}%`,
                backgroundPosition: `${character.avatar.posX ?? 50}% ${character.avatar.posY ?? 50}%`,
                marginRight: 4,
              }}
            />
          )}
          使用中の探索者：<strong>{character?.name || '未選択'}</strong>
        </div>
        <span className="turn-badge">{isHost ? 'HOST' : 'PLAYER'}</span>
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="mono small-text" style={{ marginBottom: 10 }}>現在の参加者（{participants.length}人）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {participants.length === 0 && <span className="dim">読み込み中…</span>}
          {participants.map((p, i) => (
            <span
              key={i}
              className="house-chip"
              style={{
                background: p.role === 'host' ? 'var(--wax)' : 'var(--arcane)',
                color: 'var(--parchment)',
                fontSize: 12,
                padding: '4px 12px',
              }}
            >
              {p.character_name}{p.role === 'host' ? '（HOST）' : ''}
            </span>
          ))}
        </div>
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
          onFocus={() => { isTypingRef.current = true }}
          onBlur={() => { isTypingRef.current = false }}
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
            <button className="plain primary" onClick={rollSkillCheck} disabled={!!myRollThisTurn}>🎲 この技能で判定</button>
          </div>
        ) : null}

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="plain" onClick={rollPlainDice} disabled={!!myRollThisTurn}>🎲 1D100を振る（SAN値チェックなど）</button>
          {myRollThisTurn && (
            <span className="mono small-text" style={{ alignSelf: 'center' }}>
              あなたの今ターンの判定：{myRollThisTurn.skill_name ? `${myRollThisTurn.skill_name}${myRollThisTurn.skill_value || ''} → ` : ''}
              {myRollThisTurn.roll}{myRollThisTurn.result ? `（${myRollThisTurn.result}）` : '（出目のみ）'}
            </span>
          )}
        </div>

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
          <div key={e.id} className="entry" style={{ opacity: e.is_standby ? 0.65 : 1, flexDirection: 'column', alignItems: 'stretch' }}>
            {editingId === e.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="transcript-input"
                  style={{ minHeight: 60, fontSize: 15 }}
                  value={editText}
                  onChange={ev => setEditText(ev.target.value)}
                  onFocus={() => { isTypingRef.current = true }}
                  onBlur={() => { isTypingRef.current = false }}
                />
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="plain" onClick={() => setEditingId(null)}>キャンセル</button>
                  <button className="plain primary" onClick={() => saveEdit(e.id)}>保存</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span className="who">{e.character_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="check">{e.is_standby ? '待機 ー' : '確定済み ✓'}</span>
                    {e.user_id === userId && !e.is_standby && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="plain" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => startEdit(e)}>修正</button>
                        <button className="plain" style={{ padding: '4px 10px', fontSize: 11, borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteEntry(e.id)}>取消</button>
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="what"
                  style={{ fontStyle: e.is_standby ? 'italic' : 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {e.text}
                </div>
              </div>
            )}
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

      <div className="card">
        <div className="log-title">Turn {session?.turn_number || 1} — 判定ログ（記録後は誰も書き換え不可）</div>
        {turnRolls.length === 0 && <div className="empty-state">まだ誰も判定していません。</div>}
        {turnRolls.map(r => (
          <div key={r.id} className="entry" style={{ opacity: r.voided ? 0.5 : 1, flexWrap: 'wrap', rowGap: 4 }}>
            <span className="who">{r.character_name}</span>
            <span className="what" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {r.skill_name ? `${r.skill_name}${r.skill_value || ''}` : '1D100'} → 出目 {r.roll}
            </span>
            <span className="check">{r.result || '出目のみ'}{r.voided ? '（取り消し）' : ''}</span>
          </div>
        ))}
      </div>

      {flashEvent && flashEvent.mode === 'full' && (
        <div
          className={'roll-flash ' + (flashEvent.result === 'ファンブル' ? 'roll-flash-fumble' : 'roll-flash-critical')}
          onClick={() => setFlashEvent(null)}
        >
          <div className="roll-flash-inner">
            <div className="roll-flash-label">
              {flashEvent.result === 'ファンブル' ? '💀 ファンブル 💀' : '✨ クリティカル ✨'}
            </div>
            <div className="roll-flash-detail">
              {flashEvent.character_name}
              {flashEvent.skill_name ? `（${flashEvent.skill_name}${flashEvent.skill_value || ''}）` : ''}
              　出目 {flashEvent.roll}
            </div>
          </div>
        </div>
      )}

      {flashEvent && flashEvent.mode === 'banner' && (
        <div
          className={'roll-banner ' + (flashEvent.result === 'ファンブル' ? 'roll-banner-fumble' : 'roll-banner-critical')}
          onClick={() => setFlashEvent(null)}
        >
          {flashEvent.result === 'ファンブル' ? '💀' : '✨'}
          {' '}
          <strong>{flashEvent.character_name}</strong>
          {flashEvent.result === 'ファンブル' ? ' がファンブル！' : ' がクリティカル！'}
          {flashEvent.skill_name ? `（${flashEvent.skill_name}${flashEvent.skill_value || ''}）` : ''}
          　出目 {flashEvent.roll}
        </div>
      )}
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
