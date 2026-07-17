'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser } from '../../lib/auth'
import { parseSheetText, SAMPLE_TEXT } from '../../lib/parseSheet'

export default function Register() {
  const [userId, setUserId] = useState(null)
  const [characters, setCharacters] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    (async () => {
      const user = await ensureAnonUser()
      setUserId(user.id)
      loadCharacters(user.id)
    })()
  }, [])

  async function loadCharacters(uid) {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at')
    if (error) { console.error(error); return }
    setCharacters(data || [])
  }

  function handlePaste(value) {
    setPasteText(value)
    setPreview(parseSheetText(value))
  }

  async function saveCharacter() {
    const data = preview || parseSheetText(pasteText)
    if (!data.name) { alert('「名前：」の行が見つかりません') ; return }
    const { error } = await supabase.from('characters').insert({
      owner_id: userId,
      name: data.name,
      raw_text: pasteText,
      parsed: data,
    })
    if (error) { alert('保存に失敗しました: ' + error.message); return }
    setShowForm(false)
    setPasteText('')
    setPreview(null)
    loadCharacters(userId)
  }

  return (
    <div className="wrap">
      <Link href="/" className="back-link">← トップへ戻る</Link>
      <div className="eyebrow">WWCoC / 事前登録</div>
      <h1 className="small">探索者シート登録</h1>
      <p className="sub">キャラメーカーのテンプレートをそのまま貼り付けて登録する。</p>

      <div className="row-between">
        <div className="mono small-text">{characters.length} 人 登録済み</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="plain" href="https://w-chronicle.raindrop.jp/coc-ww-charsheet.html" target="_blank" rel="noopener noreferrer">
            探索者を作成 ↗
          </a>
          <button className="plain primary" onClick={() => { setPasteText(''); setPreview(null); setShowForm(true) }}>
            ＋ 新しい探索者を登録
          </button>
        </div>
      </div>

      <div className="grid">
        {characters.length === 0 && (
          <div className="empty-state">まだ探索者が登録されていません。「＋ 新しい探索者を登録」から始めましょう。</div>
        )}
        {characters.map(c => (
          <div key={c.id} className="pcard" onClick={() => setDetail(c)}>
            <div className="portrait">{(c.name || '?').trim().charAt(0)}</div>
            <div className="name">{c.name}</div>
            {c.parsed?.house && <span className="house-chip">{c.parsed.house}</span>}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>新しい探索者を登録</h2>
              <button className="close-btn" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="sheet-body">
              <div className="paste-hint">
                キャラメーカーの出力をそのままコピー＆ペーストしてください。
                {' '}
                <button type="button" onClick={() => handlePaste(SAMPLE_TEXT)}>サンプルを入れてみる</button>
              </div>
              <textarea
                className="paste-area"
                value={pasteText}
                onChange={(e) => handlePaste(e.target.value)}
                placeholder={"名前：\n性別：\n年齢：\n寮：\n出身地：\n【能力値】\nSTR　CON　DEX　INT\n40　40　40　40\n…"}
              />
              <div className="preview-box">
                {preview?.name ? (
                  <>
                    <div className="pv-name">{preview.name}</div>
                    <div className="pv-row">
                      {preview.gender || '—'} ／ {preview.age || '—'}歳 ／ {preview.house || '寮未検出'} ／ {preview.origin || '—'}
                    </div>
                  </>
                ) : (
                  <div className="dim">貼り付けると、ここにプレビューが表示されます。</div>
                )}
              </div>
            </div>
            <div className="sheet-actions">
              <button className="plain" onClick={() => setShowForm(false)}>キャンセル</button>
              <button className="plain primary" onClick={saveCharacter}>登録する</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>探索者シート</h2>
              <button className="close-btn" onClick={() => setDetail(null)}>&times;</button>
            </div>
            <div className="sheet-body">
              <div className="detail-name">{detail.name}</div>
              <pre className="raw-text">{detail.raw_text}</pre>
            </div>
            <div className="sheet-actions">
              <button className="plain primary" onClick={() => setDetail(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
