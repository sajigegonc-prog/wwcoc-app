'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'
import { rollD100, judgeResult } from '../../lib/dice'

export default function Solo() {
  const router = useRouter()
  const [character, setCharacter] = useState(null)
  const [skillChoice, setSkillChoice] = useState('')
  const [log, setLog] = useState([])

  useEffect(() => {
    (async () => {
      await ensureAnonUser()
      const charId = localStorage.getItem('wwcoc_character_id')
      const flow = localStorage.getItem('wwcoc_flow')
      if (!charId || flow !== 'solo') { router.push('/select?flow=solo'); return }
      const { data } = await supabase.from('characters').select('*').eq('id', charId).single()
      setCharacter(data)
    })()
  }, [])

  function resultLabel(result) {
    if (result === 'クリティカル') {
      return <span style={{ color: 'var(--gold)', fontWeight: 700, textShadow: '0 0 6px rgba(184,147,63,0.5)' }}>✨クリティカル✨</span>
    }
    if (result === 'ファンブル') {
      return <span style={{ color: 'var(--wax)', fontWeight: 700, textShadow: '0 0 4px rgba(110,31,42,0.35)' }}>💀ファンブル💀</span>
    }
    return result
  }

  function rollSkill() {
    if (!skillChoice) { alert('技能を選んでください'); return }
    const [name, value] = skillChoice.split('|')
    const roll = rollD100()
    const result = judgeResult(roll, value)
    setLog(prev => [{ id: Date.now(), skillName: name, skillValue: value, roll, result }, ...prev])
  }

  function rollPlain() {
    const roll = rollD100()
    setLog(prev => [{ id: Date.now(), skillName: null, skillValue: null, roll, result: null }, ...prev])
  }

  const skillGroups = character?.parsed?.skills
  const hasSkills = skillGroups && (skillGroups.explore?.length || skillGroups.social?.length || skillGroups.action?.length)

  return (
    <div className="wrap narrow">
      <Link href="/" className="back-link">← トップへ戻る</Link>
      <div className="eyebrow">WWCoC / ソロダイス</div>
      <h1 className="small">ソロ探索ダイス</h1>
      <p className="sub">セッションを作らず、選んだ探索者でダイスだけ振れます。この記録はこの画面を閉じると消えます（誰とも共有されません）。</p>

      <div className="card">
        <div className="selected-strip" style={{ marginBottom: 12 }}>
          使用中の探索者：<strong>{character?.name || '読み込み中…'}</strong>
        </div>
        <Link href="/select?flow=solo" className="plain" style={{ marginBottom: 16, display: 'inline-flex' }}>探索者を変更</Link>

        {hasSkills ? (
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
            <button className="plain primary" onClick={rollSkill}>🎲 この技能で判定</button>
          </div>
        ) : (
          <p className="dim">この探索者には技能データがありません（テンプレート貼り付けで登録した場合のみ技能判定が使えます）。</p>
        )}

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="plain" onClick={rollPlain}>🎲 1D100を振る</button>
        </div>
      </div>

      <div className="card">
        <div className="log-title">判定ログ（この画面だけの記録）</div>
        {log.length === 0 && <div className="empty-state">まだ判定していません。</div>}
        {log.map(r => (
          <div key={r.id} className="entry" style={{ flexWrap: 'wrap', rowGap: 4 }}>
            <span className="what" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {r.skillName ? `${r.skillName}${r.skillValue}` : '1D100'} → 出目 {r.roll}
            </span>
            <span className="check">{r.result ? resultLabel(r.result) : '出目のみ'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
