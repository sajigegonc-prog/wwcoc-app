'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

function InfoInner() {
  const params = useSearchParams()
  const sessionId = params.get('session')

  const [userId, setUserId] = useState(null)
  const [role, setRole] = useState(null)
  const [character, setCharacter] = useState(null)
  const [ready, setReady] = useState(false)

  const [infoTabs, setInfoTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [infoEntries, setInfoEntries] = useState([])
  const [newEntryContent, setNewEntryContent] = useState('')

  const isHost = role === 'host'
  const activeTab = infoTabs.find(t => t.id === activeTabId) || null

  function displayName(c) {
    return c?.parsed?.firstName || c?.name || '無名の探索者'
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
      setReady(true)
    })()
  }, [sessionId])

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
      .select('*, info_shares(user_id, character_name)')
      .eq('tab_id', tabId)
      .order('created_at')
    setInfoEntries(data || [])
  }

  useEffect(() => {
    loadInfoEntries(activeTabId)
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
    loadInfoEntries(activeTabId)
  }

  async function deleteInfoEntry(id) {
    if (!window.confirm('この項目を削除しますか？')) return
    const { error } = await supabase.from('info_entries').delete().eq('id', id)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    loadInfoEntries(activeTabId)
  }

  async function toggleShare(entry) {
    const shares = entry.info_shares || []
    const mine = shares.find(s => s.user_id === userId)
    if (mine) {
      const { error } = await supabase.from('info_shares').delete().eq('entry_id', entry.id).eq('user_id', userId)
      if (error) { alert('更新に失敗しました: ' + error.message); return }
    } else {
      const { error } = await supabase.from('info_shares').insert({
        entry_id: entry.id,
        session_id: sessionId,
        user_id: userId,
        character_name: displayName(character),
      })
      if (error) { alert('更新に失敗しました: ' + error.message); return }
    }
    loadInfoEntries(activeTabId)
  }

  return (
    <div className="wrap">
      <Link href={`/chat?session=${sessionId}`} className="back-link">← チャットへ戻る</Link>
      <div className="eyebrow">WWCoC / 情報共有ボード</div>
      <h1 className="small">情報共有ボード</h1>
      <p className="sub">発覚した弱点や場所の描写など、探索者が把握している情報をタブごとに整理します。</p>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <span className="mono small-text">タブ</span>
          {isHost && (
            <button className="plain" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addTab}>＋ タブ追加</button>
          )}
        </div>

        {infoTabs.length === 0 && <div className="dim">まだタブがありません。{isHost ? '「＋ タブ追加」から作成してください。' : ''}</div>}

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
                {isHost && (
                  <div className="row-between" style={{ marginBottom: 10 }}>
                    <button className="plain" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => renameTab(activeTab)}>タブ名を変更</button>
                    <button className="plain" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteTab(activeTab)}>タブを削除</button>
                  </div>
                )}

                {isHost && (
                  <div className="card" style={{ padding: 12, marginBottom: 14, background: 'var(--paper)' }}>
                    <textarea
                      value={newEntryContent}
                      onChange={e => setNewEntryContent(e.target.value)}
                      placeholder="内容（例：温室のトゲに触れると眠り毒。手袋があれば安全）"
                      style={{ minHeight: 60, width: '100%', marginBottom: 8 }}
                    />
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button className="plain primary" onClick={addEntry}>この項目を追加</button>
                    </div>
                  </div>
                )}

                {infoEntries.length === 0 && <div className="empty-state">このタブにはまだ項目がありません。</div>}
                {infoEntries.map(entry => {
                  const shares = entry.info_shares || []
                  const iKnow = shares.some(s => s.user_id === userId)
                  return (
                    <div key={entry.id} className="entry" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <div
                        className="what"
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {entry.content}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span className="mono small-text">
                          知っている探索者：{shares.length > 0 ? shares.map(s => s.character_name).join('、') : 'まだ誰も'}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="plain"
                            style={{ fontSize: 11, padding: '4px 10px', borderColor: iKnow ? 'var(--arcane)' : 'var(--ink-soft)', color: iKnow ? 'var(--arcane)' : 'var(--ink)' }}
                            onClick={() => toggleShare(entry)}
                          >
                            {iKnow ? '✓ 知っている' : '共有する'}
                          </button>
                          {isHost && (
                            <button className="plain" style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteInfoEntry(entry.id)}>削除</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Info() {
  return (
    <Suspense fallback={<div className="wrap">読み込み中…</div>}>
      <InfoInner />
    </Suspense>
  )
}
