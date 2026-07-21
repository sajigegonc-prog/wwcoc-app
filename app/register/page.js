'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser, createLoginCredentials, getCurrentLoginId } from '../../lib/auth'
import { parseSheetText, SAMPLE_TEXT } from '../../lib/parseSheet'

export default function Register() {
  const [userId, setUserId] = useState(null)
  const [characters, setCharacters] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [loginId, setLoginId] = useState(null)
  const [newCredentials, setNewCredentials] = useState(null)
  const [creatingCreds, setCreatingCreds] = useState(false)

  useEffect(() => {
    (async () => {
      const user = await ensureAnonUser()
      setUserId(user.id)
      loadCharacters(user.id)
      const id = await getCurrentLoginId()
      setLoginId(id)
    })()
  }, [])

  async function handleCreateCredentials() {
    setCreatingCreds(true)
    try {
      const creds = await createLoginCredentials()
      setNewCredentials(creds)
      setLoginId(creds.id)
    } catch (err) {
      alert('発行に失敗しました: ' + err.message)
    } finally {
      setCreatingCreds(false)
    }
  }

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
    if (!data.firstName) { alert('「ファーストネーム：」の行が見つかりません') ; return }
    if (editingId) {
      const { error } = await supabase.from('characters').update({
        name: data.name,
        raw_text: pasteText,
        parsed: data,
      }).eq('id', editingId)
      if (error) { alert('更新に失敗しました: ' + error.message); return }
    } else {
      const { error } = await supabase.from('characters').insert({
        owner_id: userId,
        name: data.name,
        raw_text: pasteText,
        parsed: data,
      })
      if (error) { alert('保存に失敗しました: ' + error.message); return }
    }
    setShowForm(false)
    setEditingId(null)
    setPasteText('')
    setPreview(null)
    loadCharacters(userId)
  }

  function openEditForm(c) {
    setDetail(null)
    setEditingId(c.id)
    handlePaste(c.raw_text || '')
    setShowForm(true)
  }

  async function deleteCharacter(c) {
    if (!window.confirm(`「${c.name}」を削除しますか？この操作は取り消せません。`)) return
    const { error } = await supabase.from('characters').delete().eq('id', c.id)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    setDetail(null)
    loadCharacters(userId)
  }

  return (
    <div className="wrap">
      <Link href="/" className="back-link">← トップへ戻る</Link>
      <div className="eyebrow">WWCoC / 事前登録</div>
      <h1 className="small">探索者シート登録</h1>
      <p className="sub">キャラメーカーのテンプレートをそのまま貼り付けて登録する。</p>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="mono small-text" style={{ marginBottom: 8 }}>データを守る（推奨）</div>
        {newCredentials ? (
          <>
            <div className="id-display">
              <div className="label">ID</div>
              <div className="row">{newCredentials.id}</div>
              <div className="label">パスワード</div>
              <div className="row">{newCredentials.password}</div>
            </div>
            <p className="dim">
              このパスワードは今しか表示されません。必ずメモしてください。Cookieを消してしまった時や、別の端末を使う時は、トップページの「IDでログイン」からこの2つを入力すれば復帰できます。
            </p>
          </>
        ) : loginId ? (
          <p className="dim">
            発行済みのID：<strong className="mono" style={{ color: 'var(--ink)' }}>{loginId}</strong>　
            <Link href="/login" className="plain" style={{ display: 'inline-flex', marginLeft: 8 }}>IDでログイン</Link>
            <br />
            このIDとパスワードがあれば、Cookieが消えた時だけでなく、友達のスマホや他のPCなど、別の端末からでも同じデータにログインできます。
          </p>
        ) : (
          <>
            <p className="dim" style={{ marginBottom: 10 }}>
              今のデータは、このブラウザだけに保存されています。Cookieを消す・機種変更するなど、思わぬきっかけでアクセスできなくなることがあります。ID・パスワードを発行しておくと、もしもの時も同じデータに戻ってこられます（別の端末で使いたい時にも使えます。メールアドレスは不要です）。
            </p>
            <button className="plain primary" onClick={handleCreateCredentials} disabled={creatingCreds}>
              {creatingCreds ? '発行中…' : 'ID・パスワードを発行する'}
            </button>
          </>
        )}
      </div>

      <div className="row-between">
        <div className="mono small-text">{characters.length} 人 登録済み</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="plain" href="https://w-chronicle.raindrop.jp/coc-ww-charsheet.html" target="_blank" rel="noopener noreferrer">
            探索者を作成 ↗
          </a>
          <button className="plain primary" onClick={() => { setEditingId(null); setPasteText(''); setPreview(null); setShowForm(true) }}>
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
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null) } }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>{editingId ? '探索者シートを編集' : '新しい探索者を登録'}</h2>
              <button className="close-btn" onClick={() => { setShowForm(false); setEditingId(null) }}>&times;</button>
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
                placeholder={"ファーストネーム：\nファミリーネーム：\n性別：\n年齢：\n寮：\n出身地：\n【能力値】\nSTR　CON　DEX　INT\n40　40　40　40\n…"}
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
              <button className="plain" onClick={() => { setShowForm(false); setEditingId(null) }}>キャンセル</button>
              <button className="plain primary" onClick={saveCharacter}>{editingId ? '更新する' : '登録する'}</button>
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
              <button className="plain" style={{ borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={() => deleteCharacter(detail)}>削除</button>
              <button className="plain" onClick={() => openEditForm(detail)}>編集</button>
              <button className="plain primary" onClick={() => setDetail(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
