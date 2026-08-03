'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

function randCode() {
  return 'WWCOC-' + Math.floor(10000 + Math.random() * 90000)
}
function randPass() {
  return 'MAGIC-' + Math.floor(100 + Math.random() * 900)
}

export default function Host() {
  const router = useRouter()
  const [scenarioName, setScenarioName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [created, setCreated] = useState(null)
  const [busy, setBusy] = useState(false)

  async function createSession() {
    setBusy(true)
    try {
      const user = await ensureAnonUser()
      const code = randCode()
      const pass = randPass()
      const { data, error } = await supabase.from('sessions').insert({
        session_code: code,
        password: pass,
        scenario_name: scenarioName,
        max_players: parseInt(maxPlayers, 10) || null,
        host_id: user.id,
        status: 'active',
        turn_number: 1,
      }).select().single()
      if (error) throw error

      const characterId = localStorage.getItem('wwcoc_character_id')
      let initStats = {}
      if (characterId) {
        const { data: charData } = await supabase.from('characters').select('parsed').eq('id', characterId).single()
        const stats = charData?.parsed?.stats || {}
        initStats = {
          hp_current: parseInt(stats.HP, 10) || null,
          san_current: parseInt(stats.SAN, 10) || null,
          mp_current: parseInt(stats.MP, 10) || null,
        }
      }
      await supabase.from('session_participants').upsert({
        session_id: data.id,
        character_id: characterId,
        user_id: user.id,
        role: 'host',
        ...initStats,
      }, { onConflict: 'session_id,user_id' })
      localStorage.setItem('wwcoc_session_id', data.id)
      localStorage.setItem('wwcoc_role', 'host')
      setCreated(data)
    } catch (err) {
      alert('作成に失敗しました: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap narrow">
      <Link href="/select?flow=host" className="back-link">← 探索者選択へ戻る</Link>
      <div className="eyebrow">WWCoC / ホスト</div>
      <h1 className="small">セッションを新規作成</h1>
      <div className="card">
        <div className="ffield">
          <label>シナリオ名</label>
          <input value={scenarioName} onChange={e => setScenarioName(e.target.value)} placeholder="例：霧の温室にて" />
        </div>
        <div className="ffield">
          <label>最大参加人数</label>
          <input value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)} placeholder="例：4" inputMode="numeric" />
        </div>

        {!created && (
          <div className="actions">
            <button className="plain primary" onClick={createSession} disabled={busy}>
              {busy ? '作成中…' : 'セッションを作成する'}
            </button>
          </div>
        )}

        {created && (
          <>
            <div className="id-display">
              <div className="label">セッションID</div>
              <div className="row">{created.session_code}</div>
              <div className="label">パスワード</div>
              <div className="row">{created.password}</div>
            </div>
            <div className="actions">
              <button className="plain primary" onClick={() => router.push('/chat?session=' + created.id)}>
                チャットへ進む →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
