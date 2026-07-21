'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'

function SelectInner() {
  const router = useRouter()
  const params = useSearchParams()
  const flow = params.get('flow') === 'join' ? 'join' : 'host'
  const [characters, setCharacters] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    (async () => {
      const user = await ensureAnonUser()
      const { data } = await supabase
        .from('characters')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at')
      setCharacters(data || [])
    })()
  }, [])

  function confirm() {
    if (!selected) return
    localStorage.setItem('wwcoc_character_id', selected.id)
    localStorage.setItem('wwcoc_character_name', selected.name)
    localStorage.setItem('wwcoc_flow', flow)
    router.push(flow === 'host' ? '/host' : '/join')
  }

  return (
    <div className="wrap">
      <Link href="/" className="back-link">← トップへ戻る</Link>
      <div className="eyebrow">WWCoC / 探索者選択（{flow === 'host' ? 'ホスト' : '参加'}）</div>
      <h1 className="small">使用する探索者を選ぶ</h1>
      <p className="sub">登録済みの探索者から、このセッションで使うキャラクターを選択してください。</p>

      <div className="grid">
        {characters.length === 0 && (
          <div className="empty-state">
            まだ探索者が登録されていません。<br />
            <Link href="/register" className="plain" style={{ marginTop: 10, display: 'inline-flex' }}>先に登録する</Link>
          </div>
        )}
        {characters.map(c => (
          <div
            key={c.id}
            className={'pcard' + (selected?.id === c.id ? ' selected' : '')}
            onClick={() => setSelected(c)}
          >
            <div
              className="portrait"
              style={c.avatar?.src ? {
                backgroundImage: `url(${c.avatar.src})`,
                backgroundSize: `${(c.avatar.zoom || 1) * 100}%`,
                backgroundPosition: `${c.avatar.posX ?? 50}% ${c.avatar.posY ?? 50}%`,
              } : undefined}
            >
              {!c.avatar?.src && (c.name || '?').trim().charAt(0)}
            </div>
            <div className="name">{c.name}</div>
            {c.parsed?.house && <span className="house-chip">{c.parsed.house}</span>}
          </div>
        ))}
      </div>

      <div className="actions">
        <Link href="/register" className="plain">シートを登録しに行く</Link>
        <button className="plain primary" disabled={!selected} onClick={confirm}>この探索者で進む</button>
      </div>
    </div>
  )
}

export default function Select() {
  return (
    <Suspense fallback={<div className="wrap">読み込み中…</div>}>
      <SelectInner />
    </Suspense>
  )
}
