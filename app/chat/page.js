'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'
import { DICE_OPTIONS } from '../../lib/dice'

function ChatInner() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session')

  const [role, setRole] = useState(null)
  const [character, setCharacter] = useState(null)
  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [dialogueLine, setDialogueLine] = useState('')
  const [customDiceChoice, setCustomDiceChoice] = useState(DICE_OPTIONS[2]?.label || '1D6')
  const [showCustomDice, setShowCustomDice] = useState(false)
  const [skillChoice, setSkillChoice] = useState('')
  const [userId, setUserId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [turnRolls, setTurnRolls] = useState([])
  const [participants, setParticipants] = useState([])
  const [ready, setReady] = useState(false)
  const channelRef = useRef(null)

  function displayName(c) {
    return c?.parsed?.firstName || c?.name || '無名の探索者'
  }

  function resultLabel(result) {
    if (result === 'クリティカル') {
      return <span style={{ color: 'var(--gold)', fontWeight: 700, textShadow: '0 0 6px rgba(184,147,63,0.5)' }}>✨クリティカル✨</span>
    }
    if (result === 'ファンブル') {
      return <span style={{ color: 'var(--wax)', fontWeight: 700, textShadow: '0 0 4px rgba(110,31,42,0.35)' }}>💀ファンブル💀</span>
    }
    return result || '出目のみ'
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

  // Fetch everyone's avatar via a normal REST query (NOT the realtime channel) —
  // this keeps the presence/broadcast payload small while still letting us show icons.
  const [participantsData, setParticipantsData] = useState([])
  const [showStatus, setShowStatus] = useState(false)

  async function loadParticipantsData() {
    const { data } = await supabase
      .from('session_participants')
      .select('id, user_id, role, hp_current, san_current, mp_current, characters(name, avatar, parsed)')
      .eq('session_id', sessionId)
    const rows = (data || []).map(row => ({
      participantId: row.id,
      user_id: row.user_id,
      role: row.role,
      hp: row.hp_current,
      san: row.san_current,
      mp: row.mp_current,
      hpMax: parseInt(row.characters?.parsed?.stats?.HP, 10) || null,
      sanMax: parseInt(row.characters?.parsed?.stats?.SAN, 10) || null,
      mpMax: parseInt(row.characters?.parsed?.stats?.MP, 10) || null,
      dex: parseInt(row.characters?.parsed?.stats?.DEX, 10) || 0,
      name: row.characters?.parsed?.firstName || row.characters?.name || '無名の探索者',
      avatar: row.characters?.avatar || null,
    }))
    setParticipantsData(rows)
  }

  useEffect(() => {
    if (!sessionId || !ready) return
    loadParticipantsData()
  }, [sessionId, ready, participants.length])

  async function adjustStat(field, delta) {
    const mine = participantsData.find(p => p.user_id === userId)
    if (!mine) return
    const maxVal = field === 'hp' ? mine.hpMax : field === 'san' ? mine.sanMax : mine.mpMax
    const current = mine[field] ?? 0
    const next = Math.max(0, Math.min(maxVal ?? 9999, current + delta))
    setParticipantsData(prev => prev.map(p => p.user_id === userId ? { ...p, [field]: next } : p))
    const column = field + '_current'
    const { error } = await supabase.from('session_participants').update({ [column]: next }).eq('id', mine.participantId)
    if (error) alert('更新に失敗しました: ' + error.message)
  }

  // keep presence info up to date once character/role finish loading (or change)
  useEffect(() => {
    if (!channelRef.current) return
    channelRef.current.track({ character_name: displayName(character), role: role || 'player' })
  }, [character, role])

  // ---------- セリフチャット（ターンでリセットされない） ----------
  const [dialogue, setDialogue] = useState([])
  const [showDialogueChat, setShowDialogueChat] = useState(false)
  const [dialogueText, setDialogueText] = useState('')

  async function loadDialogue(turnNumber) {
    const { data } = await supabase
      .from('session_dialogue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('turn_number', turnNumber ?? session?.turn_number ?? 1)
      .order('created_at')
    setDialogue(data || [])
  }

  async function sendDialogue() {
    const body = dialogueText.trim()
    if (!body) return
    const who = displayName(character)
    const { data, error } = await supabase.from('session_dialogue').insert({
      session_id: sessionId,
      turn_number: session?.turn_number || 1,
      user_id: userId,
      character_name: who,
      text: body,
    }).select().single()
    if (error) { alert('送信に失敗しました: ' + error.message); return }
    setDialogue(prev => [...prev, data])
    setDialogueText('')
  }

  const [editingDialogueId, setEditingDialogueId] = useState(null)
  const [editDialogueText, setEditDialogueText] = useState('')

  function startEditDialogue(m) {
    setEditingDialogueId(m.id)
    setEditDialogueText(m.text)
  }

  async function saveDialogueEdit(id) {
    const newText = editDialogueText.trim()
    if (!newText) return
    const { error } = await supabase.from('session_dialogue').update({ text: newText }).eq('id', id)
    if (error) { alert('修正に失敗しました: ' + error.message); return }
    setDialogue(prev => prev.map(m => m.id === id ? { ...m, text: newText } : m))
    setEditingDialogueId(null)
    setEditDialogueText('')
  }

  async function deleteDialogue(id) {
    if (!window.confirm('このセリフを取り消しますか？')) return
    const { error } = await supabase.from('session_dialogue').delete().eq('id', id)
    if (error) { alert('取り消しに失敗しました: ' + error.message); return }
    setDialogue(prev => prev.filter(m => m.id !== id))
  }

  // ---------- 情報共有ボード（モーダル、ページ遷移しない＝在室状態を保つ） ----------
  const [showInfoModal, setShowInfoModal] = useState(false)

  // ---------- 全ターン履歴（モーダル） ----------
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyActions, setHistoryActions] = useState([])
  const [historyRolls, setHistoryRolls] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  async function openHistoryModal() {
    setShowHistoryModal(true)
    setHistoryLoading(true)
    const { data: a } = await supabase
      .from('turn_actions')
      .select('*')
      .eq('session_id', sessionId)
      .order('turn_number')
      .order('created_at')
    setHistoryActions(a || [])
    const { data: r } = await supabase
      .from('dice_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .order('turn_number')
      .order('created_at')
    setHistoryRolls(r || [])
    setHistoryLoading(false)
  }
  const [infoTabs, setInfoTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [infoEntries, setInfoEntries] = useState([])
  const [newEntryContent, setNewEntryContent] = useState('')
  const [showAddEntryForm, setShowAddEntryForm] = useState(false)

  const activeTab = infoTabs.find(t => t.id === activeTabId) || null

  async function loadInfoTabs() {
    const { data } = await supabase
      .from('info_tabs')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order')
      .order('created_at')
    setInfoTabs(data || [])
    if (data && data.length > 0 && !data.some(t => t.id === activeTabId)) {
      setActiveTabId(data[0].id)
    }
  }

  async function loadInfoEntries(tabId) {
    if (!tabId) { setInfoEntries([]); return }
    const { data } = await supabase
      .from('info_entries')
      .select('*')
      .eq('tab_id', tabId)
      .order('created_at')
    setInfoEntries(data || [])
  }

  useEffect(() => {
    loadInfoEntries(activeTabId)
    setShowAddEntryForm(false)
  }, [activeTabId])

  useEffect(() => {
    if (!sessionId || !ready) return
    loadInfoTabs()
    const interval = setInterval(() => {
      loadInfoTabs()
      loadInfoEntries(activeTabId)
    }, 2500)
    return () => clearInterval(interval)
  }, [sessionId, ready, activeTabId])

  async function addTab() {
    const name = prompt('タブ名を入力してください（例：弱点、場所描写）')
    if (!name || !name.trim()) return
    const { error } = await supabase.from('info_tabs').insert({
      session_id: sessionId,
      name: name.trim(),
      sort_order: infoTabs.length,
    })
    if (error) { alert('作成に失敗しました: ' + error.message); return }
    loadInfoTabs()
  }

  async function renameTab(tab) {
    const name = prompt('新しいタブ名', tab.name)
    if (!name || !name.trim()) return
    const { error } = await supabase.from('info_tabs').update({ name: name.trim() }).eq('id', tab.id)
    if (error) { alert('変更に失敗しました: ' + error.message); return }
    loadInfoTabs()
  }

  async function deleteTab(tab) {
    if (!window.confirm(`「${tab.name}」タブを削除しますか？中の項目も全て消えます。`)) return
    const { error } = await supabase.from('info_tabs').delete().eq('id', tab.id)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    setActiveTabId(null)
    loadInfoTabs()
  }

  async function addEntry() {
    if (!newEntryContent.trim()) { alert('内容を入力してください'); return }
    const { error } = await supabase.from('info_entries').insert({
      tab_id: activeTabId,
      session_id: sessionId,
      content: newEntryContent.trim(),
    })
    if (error) { alert('追加に失敗しました: ' + error.message); return }
    setNewEntryContent('')
    setShowAddEntryForm(false)
    loadInfoEntries(activeTabId)
  }

  async function deleteInfoEntry(id) {
    if (!window.confirm('この項目を削除しますか？')) return
    const { error } = await supabase.from('info_entries').delete().eq('id', id)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    loadInfoEntries(activeTabId)
  }

  // Realtime push has proven unreliable in practice. Poll as the primary sync
  // mechanism so both sides reliably stay in sync (realtime, when it works,
  // just makes it feel faster in between polls).
  useEffect(() => {
    if (!sessionId || !ready) return
    loadDialogue(session?.turn_number || 1)
    const interval = setInterval(() => {
      loadSession().then(s => {
        loadEntries()
        loadRolls(s?.turn_number || 1)
        loadParticipantsData()
        loadDialogue(s?.turn_number || 1)
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
      dialogue: dialogueLine.trim() || null,
      is_standby: standby,
      user_id: userId,
    }).select().single()
    if (error) { alert('送信に失敗しました: ' + error.message); return }
    setEntries(prev => prev.some(e => e.id === data.id) ? prev : [...prev, data])
    setText('')
    setDialogueLine('')
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

  async function voidMyActiveRoll() {
    const turn = session?.turn_number || 1
    const activeRoll = turnRolls.find(r => r.user_id === userId && r.turn_number === turn && !r.voided)
    if (activeRoll) {
      const { error: voidError } = await supabase.from('dice_rolls').update({ voided: true }).eq('id', activeRoll.id)
      if (!voidError) {
        setTurnRolls(prev => prev.map(r => r.id === activeRoll.id ? { ...r, voided: true } : r))
      }
    }
  }

  async function deleteEntry(entryId) {
    if (!window.confirm('この行動を取り消しますか？（このターンの判定があれば、それも取り消されて振り直せるようになります）')) return
    const { error } = await supabase.from('turn_actions').delete().eq('id', entryId)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    loadEntries()
    voidMyActiveRoll()
  }

  const myRollThisTurn = turnRolls.find(r => r.user_id === userId && !r.voided)

  async function performRoll(skillName, skillValue, diceLabel = '1D100', diceCount = 1, diceSides = 100) {
    if (myRollThisTurn) {
      alert(`このターンは既に判定済みです（${myRollThisTurn.skill_name ? myRollThisTurn.skill_name + '：' : ''}${myRollThisTurn.roll}${myRollThisTurn.result ? ' → ' + myRollThisTurn.result : '（出目のみ）'}）`)
      return
    }
    const rolls = []
    for (let i = 0; i < diceCount; i++) rolls.push(Math.floor(Math.random() * diceSides) + 1)
    const roll = rolls.reduce((a, b) => a + b, 0)
    const hasValue = diceLabel === '1D100' && skillValue !== null && skillValue !== '' && !isNaN(parseInt(skillValue, 10))
    const result = hasValue ? judgeResult(roll, skillValue) : null
    const { data, error } = await supabase.from('dice_rolls').insert({
      session_id: sessionId,
      turn_number: session?.turn_number || 1,
      user_id: userId,
      character_name: displayName(character),
      skill_name: skillName || null,
      skill_value: hasValue ? skillValue : null,
      dice_type: diceLabel,
      roll,
      roll_detail: diceCount > 1 ? rolls : null,
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
    const detailPart = diceCount > 1 ? `[${rolls.join(',')}]＝` : ''
    const tag = skillName
      ? (hasValue ? `［${skillName}${skillValue}で判定：${roll} → ${result}］` : `［${skillName}：出目 ${roll}（判定基準未入力）］`)
      : `［${diceLabel}：${detailPart}${roll}］`
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
    performRoll(name, value, '1D100', 1, 100)
  }

  function rollPlainDice() {
    performRoll(null, null, '1D100', 1, 100)
  }

  function rollCustomDice() {
    const opt = DICE_OPTIONS.find(o => o.label === customDiceChoice)
    if (!opt) { alert('ダイスを選んでください'); return }
    performRoll(null, null, opt.label, opt.count, opt.sides)
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
    setDialogue([])
  }

  async function endSession() {
    if (!window.confirm('探索を終了しますか？')) return
    await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId)
    router.push('/')
  }

  async function copyToAI() {
    if (entries.length === 0) { alert('確定した行動がありません'); return }
    const sorted = [...entries].sort((a, b) => {
      const dexA = participantsData.find(p => p.user_id === a.user_id)?.dex ?? 0
      const dexB = participantsData.find(p => p.user_id === b.user_id)?.dex ?? 0
      return dexB - dexA
    })
    const body = sorted.map(e => {
      const dialoguePart = e.dialogue ? `「${e.dialogue}」\n` : ''
      return `${e.full_name || e.character_name}：\n${dialoguePart}${e.text}`
    }).join('\n\n')
    const rpPart = dialogue.length > 0
      ? `【このターンのロールプレイ】\n\n${dialogue.map(m => `${m.character_name}：「${m.text}」`).join('\n')}\n\n`
      : ''
    const full = `${rpPart}【探索者行動】（DEX順）\n\n今回のターン行動：\n\n${body}\n\n以上。\nこの行動を処理してください。`
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
      <div className="row-between" style={{ marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 className="small" style={{ margin: 0 }}>行動宣言チャット</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="plain" onClick={() => setShowInfoModal(true)}>🗂 情報共有ボード</button>
          <button className="plain" onClick={openHistoryModal}>📖 全ターン履歴</button>
        </div>
      </div>

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

      <div className="card" style={{ padding: '16px 20px' }}>
        <div
          className="row-between"
          style={{ marginBottom: showStatus ? 10 : 0, cursor: 'pointer' }}
          onClick={() => setShowStatus(v => !v)}
        >
          <span className="mono small-text">ステータス</span>
          <span className="plain" style={{ fontSize: 11, padding: '4px 10px' }}>{showStatus ? '閉じる ▲' : '開く ▼'}</span>
        </div>
        {showStatus && (
          <>
            {participantsData.length === 0 && <span className="dim">読み込み中…</span>}
            {participantsData.map(p => (
              <div key={p.participantId} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--shadow)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, minWidth: 70 }}>{p.name}</span>
                {['hp', 'san', 'mp'].map(field => (
                  <span key={field} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    {field.toUpperCase()}
                    {p.user_id === userId ? (
                      <>
                        <button className="plain" style={{ padding: '2px 7px', fontSize: 11 }} onClick={() => adjustStat(field, -1)}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center' }}>{p[field] ?? '—'}</span>
                        <button className="plain" style={{ padding: '2px 7px', fontSize: 11 }} onClick={() => adjustStat(field, 1)}>＋</button>
                      </>
                    ) : (
                      <span style={{ minWidth: 20, textAlign: 'center' }}>{p[field] ?? '—'}</span>
                    )}
                    / {p[field + 'Max'] ?? '—'}
                  </span>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div
          className="row-between"
          style={{ marginBottom: showDialogueChat ? 10 : 0, cursor: 'pointer' }}
          onClick={() => setShowDialogueChat(v => !v)}
        >
          <span className="mono small-text">
            セリフチャット {dialogue.length > 0 && <span className="dim">（{dialogue.length}件）</span>}
          </span>
          <span className="plain" style={{ fontSize: 11, padding: '4px 10px' }}>{showDialogueChat ? '閉じる ▲' : '開く ▼'}</span>
        </div>
        {showDialogueChat && (
          <>
            <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>（このターンの行動に至るまでのロールプレイ。次のターンでリセット、AIコピーにも含まれます）</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
              {dialogue.length === 0 && <span className="dim">まだ発言がありません。</span>}
              {dialogue.map(m => {
                const mine = m.user_id === userId
                const av = participantsData.find(p => p.user_id === m.user_id)?.avatar
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        border: '1px solid var(--gold-soft)', background: 'var(--paper)',
                        backgroundImage: av?.src ? `url(${av.src})` : undefined,
                        backgroundSize: av?.src ? `${(av.zoom || 1) * 100}%` : undefined,
                        backgroundPosition: av?.src ? `${av.posX ?? 50}% ${av.posY ?? 50}%` : undefined,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Cinzel', serif", fontSize: 12, color: 'var(--shadow)',
                      }}
                    >
                      {!av?.src && (m.character_name || '?').charAt(0)}
                    </div>
                    <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                      {!mine && <span className="mono small-text" style={{ marginBottom: 2, fontSize: 10.5 }}>{m.character_name}</span>}
                      {editingDialogueId === m.id ? (
                        <div style={{ display: 'flex', gap: 6, width: '100%', minWidth: 160 }}>
                          <input
                            value={editDialogueText}
                            onChange={e => setEditDialogueText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveDialogueEdit(m.id) }}
                            style={{ flex: 1, fontSize: 13 }}
                            autoFocus
                          />
                          <button className="plain" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => saveDialogueEdit(m.id)}>✓</button>
                          <button className="plain" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setEditingDialogueId(null)}>×</button>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: mine ? 'var(--wax)' : 'var(--paper)',
                            color: mine ? 'var(--parchment)' : 'var(--ink)',
                            border: mine ? 'none' : '1px solid var(--shadow)',
                            borderRadius: 14,
                            padding: '8px 12px',
                            fontSize: 14,
                            wordBreak: 'break-word', overflowWrap: 'anywhere',
                          }}
                        >
                          {m.text}
                        </div>
                      )}
                      {mine && editingDialogueId !== m.id && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <button onClick={() => startEditDialogue(m)} style={{ fontSize: 10, opacity: 0.45, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 0 }}>編集</button>
                          <button onClick={() => deleteDialogue(m.id)} style={{ fontSize: 10, opacity: 0.45, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 0 }}>削除</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={dialogueText}
                onChange={e => setDialogueText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendDialogue() }}
                placeholder="セリフを入力…"
                style={{ flex: 1 }}
              />
              <button className="plain primary" onClick={sendDialogue}>送信</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 0 }}>
          <span className="mono small-text">今回の行動を入力</span>
          <span className="turn-badge">TURN {session?.turn_number || 1}</span>
        </div>
        <div className="ffield" style={{ marginTop: 10, marginBottom: 10 }}>
          <label>セリフ（任意）</label>
          <input
            value={dialogueLine}
            onChange={e => setDialogueLine(e.target.value)}
            placeholder="例：「気をつけて、何かいる……」"
          />
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
            <button className="plain primary" onClick={rollSkillCheck} disabled={!!myRollThisTurn}>🎲 この技能で判定</button>
          </div>
        ) : null}

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="plain" onClick={rollPlainDice} disabled={!!myRollThisTurn}>🎲 1D100を振る（SAN値チェックなど）</button>
        </div>

        <div style={{ border: '1px solid var(--shadow)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
          <div
            className="row-between"
            style={{ padding: '8px 12px', cursor: 'pointer', marginBottom: 0 }}
            onClick={() => setShowCustomDice(v => !v)}
          >
            <span className="mono small-text">ダメージロールなど（1D6など）</span>
            <span className="dim" style={{ fontSize: 11 }}>{showCustomDice ? '閉じる ▲' : '開く ▼'}</span>
          </div>
          {showCustomDice && (
            <div className="actions" style={{ justifyContent: 'flex-start', padding: '0 12px 12px', marginTop: 0 }}>
              <select value={customDiceChoice} onChange={e => setCustomDiceChoice(e.target.value)} style={{ width: 90 }}>
                {DICE_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
              </select>
              <button className="plain" onClick={rollCustomDice} disabled={!!myRollThisTurn}>🎲 このダイスを振る</button>
            </div>
          )}
        </div>

        {myRollThisTurn && (
          <div className="mono small-text" style={{ marginTop: 10 }}>
            あなたの今ターンの判定：{myRollThisTurn.skill_name ? `${myRollThisTurn.skill_name}${myRollThisTurn.skill_value || ''} → ` : ''}
            {myRollThisTurn.roll_detail ? `[${myRollThisTurn.roll_detail.join(',')}]＝` : ''}{myRollThisTurn.roll}（{resultLabel(myRollThisTurn.result)}）
          </div>
        )}

        <div className="actions">
          <button className="plain" onClick={() => { setText(''); setDialogueLine(''); voidMyActiveRoll() }}>取り消し</button>
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
                />
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="plain" onClick={() => setEditingId(null)}>キャンセル</button>
                  <button className="plain primary" onClick={() => saveEdit(e.id)}>保存</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span className="who" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {(() => {
                      const av = participantsData.find(p => p.user_id === e.user_id)?.avatar
                      return av?.src ? (
                        <span
                          style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: '1px solid var(--gold-soft)',
                            backgroundImage: `url(${av.src})`,
                            backgroundSize: `${(av.zoom || 1) * 100}%`,
                            backgroundPosition: `${av.posX ?? 50}% ${av.posY ?? 50}%`,
                          }}
                        />
                      ) : null
                    })()}
                    {e.character_name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="check">{e.is_standby ? '待機 ー' : '確定済み ✓'}</span>
                    {e.user_id === userId && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        {!e.is_standby && (
                          <button className="plain" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => startEdit(e)}>修正</button>
                        )}
                        <button className="plain" style={{ padding: '4px 10px', fontSize: 11, borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteEntry(e.id)}>取消</button>
                      </span>
                    )}
                  </div>
                </div>
                {e.dialogue && (
                  <div style={{ fontStyle: 'italic', color: 'var(--arcane)', fontSize: 13.5, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    「{e.dialogue}」
                  </div>
                )}
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
              {r.skill_name ? `${r.skill_name}${r.skill_value || ''}` : (r.dice_type || '1D100')} → 出目 {r.roll_detail ? `[${r.roll_detail.join(',')}]＝` : ''}{r.roll}
            </span>
            <span className="check">{resultLabel(r.result)}{r.voided ? '（取り消し）' : ''}</span>
          </div>
        ))}
      </div>

      {isHost && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="mono small-text" style={{ marginBottom: 10 }}>セッション管理</div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="plain" onClick={bulkCopySheets}>全員分をAI提出用にコピー</button>
            <button className="plain" style={{ borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={endSession}>
              探索を終了する
            </button>
          </div>
        </div>
      )}

      {showInfoModal && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) setShowInfoModal(false) }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>情報共有ボード</h2>
              <button className="close-btn" onClick={() => setShowInfoModal(false)}>&times;</button>
            </div>
            <div className="sheet-body">
              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="mono small-text">タブ</span>
                <button className="plain" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addTab}>＋ タブ追加</button>
              </div>

              {infoTabs.length === 0 && <div className="dim">まだタブがありません。「＋ タブ追加」から作成してください。</div>}

              {infoTabs.length > 0 && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {infoTabs.map(tab => (
                      <button
                        key={tab.id}
                        className="plain"
                        style={{
                          fontSize: 12, padding: '5px 12px',
                          background: activeTabId === tab.id ? 'var(--wax)' : 'transparent',
                          color: activeTabId === tab.id ? 'var(--parchment)' : 'var(--ink)',
                          borderColor: activeTabId === tab.id ? 'var(--wax)' : 'var(--ink-soft)',
                        }}
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {activeTab && (
                    <>
                      <div className="row-between" style={{ marginBottom: 10 }}>
                        <button className="plain" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => renameTab(activeTab)}>タブ名を変更</button>
                        <button className="plain" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteTab(activeTab)}>タブを削除</button>
                      </div>

                      {showAddEntryForm ? (
                        <div className="card" style={{ padding: 12, marginBottom: 14, background: 'var(--paper)' }}>
                          <textarea
                            value={newEntryContent}
                            onChange={e => setNewEntryContent(e.target.value)}
                            placeholder="内容（例：温室のトゲに触れると眠り毒。手袋があれば安全）"
                            style={{ minHeight: 60, width: '100%', marginBottom: 8 }}
                            autoFocus
                          />
                          <div className="actions" style={{ marginTop: 0 }}>
                            <button className="plain" onClick={() => { setShowAddEntryForm(false); setNewEntryContent('') }}>キャンセル</button>
                            <button className="plain primary" onClick={addEntry}>この項目を追加</button>
                          </div>
                        </div>
                      ) : (
                        <div className="actions" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
                          <button className="plain primary" onClick={() => setShowAddEntryForm(true)}>＋ 項目を追加</button>
                        </div>
                      )}

                      {infoEntries.length === 0 && <div className="empty-state">このタブにはまだ項目がありません。</div>}
                      {infoEntries.map(entry => (
                        <div key={entry.id} className="entry" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                          <div className="what" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            {entry.content}
                          </div>
                          <div className="actions" style={{ marginTop: 0 }}>
                            <button className="plain" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteInfoEntry(entry.id)}>削除</button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="sheet-actions">
              <button className="plain primary" onClick={() => setShowInfoModal(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) setShowHistoryModal(false) }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>全ターン履歴</h2>
              <button className="close-btn" onClick={() => setShowHistoryModal(false)}>&times;</button>
            </div>
            <div className="sheet-body">
              {historyLoading && <div className="empty-state">読み込み中…</div>}
              {!historyLoading && historyActions.length === 0 && historyRolls.length === 0 && (
                <div className="empty-state">まだ記録がありません。</div>
              )}
              {!historyLoading && Array.from(new Set([
                ...historyActions.map(a => a.turn_number),
                ...historyRolls.map(r => r.turn_number),
              ])).sort((a, b) => a - b).map(turn => {
                const turnActions = historyActions.filter(a => a.turn_number === turn)
                const turnRolls = historyRolls.filter(r => r.turn_number === turn)
                return (
                  <div key={turn} style={{ marginBottom: 22 }}>
                    <div className="log-title">Turn {turn}</div>
                    {turnActions.length === 0 && turnRolls.length === 0 && (
                      <div className="dim" style={{ padding: '8px 0' }}>この回の記録はありません。</div>
                    )}
                    {turnActions.map(a => (
                      <div key={a.id} className="entry" style={{ opacity: a.is_standby ? 0.65 : 1, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span className="who">{a.character_name}</span>
                          <span className="check">{a.is_standby ? '待機' : '確定済み'}</span>
                        </div>
                        {a.dialogue && (
                          <div style={{ fontStyle: 'italic', color: 'var(--arcane)', fontSize: 13.5, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            「{a.dialogue}」
                          </div>
                        )}
                        <div className="what" style={{ fontStyle: a.is_standby ? 'italic' : 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {a.text}
                        </div>
                      </div>
                    ))}
                    {turnRolls.length > 0 && (
                      <>
                        <div className="mono small-text" style={{ marginTop: 10, marginBottom: 4 }}>判定</div>
                        {turnRolls.map(r => (
                          <div key={r.id} className="entry" style={{ opacity: r.voided ? 0.5 : 1, flexWrap: 'wrap', rowGap: 4 }}>
                            <span className="who">{r.character_name}</span>
                            <span className="what" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                              {r.skill_name ? `${r.skill_name}${r.skill_value || ''}` : (r.dice_type || '1D100')} → 出目 {r.roll_detail ? `[${r.roll_detail.join(',')}]＝` : ''}{r.roll}
                            </span>
                            <span className="check">{resultLabel(r.result)}{r.voided ? '（取り消し）' : ''}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="sheet-actions">
              <button className="plain primary" onClick={() => setShowHistoryModal(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {session?.status === 'ended' && (
        <div className="overlay show">
          <div className="sheet" style={{ maxWidth: 400 }}>
            <div className="sheet-head">
              <h2>探索が終了しました</h2>
            </div>
            <div className="sheet-body">
              <p>ホストがこのセッションを終了しました。おつかれさまでした。</p>
            </div>
            <div className="sheet-actions">
              <button className="plain primary" onClick={() => router.push('/')}>トップへ戻る</button>
            </div>
          </div>
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
