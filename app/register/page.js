'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { ensureAnonUser, createLoginCredentials, getCurrentLoginId, logout } from '../../lib/auth'
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
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [avatarZoom, setAvatarZoom] = useState(1.3)
  const [avatarPosX, setAvatarPosX] = useState(50)
  const [avatarPosY, setAvatarPosY] = useState(50)

  function handleAvatarFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const maxDim = 640
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        setAvatarSrc(canvas.toDataURL('image/jpeg', 0.85))
        setAvatarZoom(1.3)
        setAvatarPosX(50)
        setAvatarPosY(50)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  function avatarPayload() {
    if (!avatarSrc) return null
    return { src: avatarSrc, zoom: avatarZoom, posX: avatarPosX, posY: avatarPosY }
  }

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

  async function handleLogout() {
    if (!window.confirm('ログアウトしますか？ 再度このIDとパスワードでログインすれば、いつでも同じデータに戻れます。')) return
    try {
      await logout()
      window.location.href = '/'
    } catch (err) {
      alert('ログアウトに失敗しました: ' + err.message)
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
        avatar: avatarPayload(),
      }).eq('id', editingId)
      if (error) { alert('更新に失敗しました: ' + error.message); return }
    } else {
      const { error } = await supabase.from('characters').insert({
        owner_id: userId,
        name: data.name,
        raw_text: pasteText,
        parsed: data,
        avatar: avatarPayload(),
      })
      if (error) { alert('保存に失敗しました: ' + error.message); return }
    }
    setShowForm(false)
    setEditingId(null)
    setPasteText('')
    setPreview(null)
    setAvatarSrc(null)
    loadCharacters(userId)
  }

  function openEditForm(c) {
    setDetail(null)
    setEditingId(c.id)
    handlePaste(c.raw_text || '')
    if (c.avatar) {
      setAvatarSrc(c.avatar.src)
      setAvatarZoom(c.avatar.zoom || 1.3)
      setAvatarPosX(c.avatar.posX ?? 50)
      setAvatarPosY(c.avatar.posY ?? 50)
    } else {
      setAvatarSrc(null)
      setAvatarZoom(1.3)
      setAvatarPosX(50)
      setAvatarPosY(50)
    }
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
            <button className="plain" style={{ display: 'inline-flex', marginLeft: 8, borderColor: 'var(--wax)', color: 'var(--wax)' }} onClick={handleLogout}>ログアウト</button>
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
          <button
            className="plain primary"
            onClick={() => { setEditingId(null); setPasteText(''); setPreview(null); setAvatarSrc(null); setAvatarZoom(1.3); setAvatarPosX(50); setAvatarPosY(50); setShowForm(true) }}
          >
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

      {showForm && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null) } }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>{editingId ? '探索者シートを編集' : '新しい探索者を登録'}</h2>
              <button className="close-btn" onClick={() => { setShowForm(false); setEditingId(null) }}>&times;</button>
            </div>
            <div className="sheet-body">
              <div className="ffield">
                <label>アイコン画像（任意）</label>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 120, height: 120, borderRadius: '50%',
                      border: '2px solid var(--gold-soft)', background: 'var(--paper)',
                      backgroundImage: avatarSrc ? `url(${avatarSrc})` : undefined,
                      backgroundSize: avatarSrc ? `${avatarZoom * 100}%` : undefined,
                      backgroundPosition: avatarSrc ? `${avatarPosX}% ${avatarPosY}%` : undefined,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <input type="file" accept="image/*" onChange={(e) => handleAvatarFile(e.target.files[0])} />
                    {avatarSrc && (
                      <>
                        <div style={{ marginTop: 10 }}>
                          <label>拡大</label>
                          <input type="range" min="1" max="3" step="0.1" value={avatarZoom} onChange={(e) => setAvatarZoom(parseFloat(e.target.value))} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <label>左右position</label>
                          <input type="range" min="0" max="100" value={avatarPosX} onChange={(e) => setAvatarPosX(parseInt(e.target.value, 10))} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <label>上下position</label>
                          <input type="range" min="0" max="100" value={avatarPosY} onChange={(e) => setAvatarPosY(parseInt(e.target.value, 10))} />
                        </div>
                        <button type="button" className="plain" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setAvatarSrc(null)}>画像を削除</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

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
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                {detail.avatar?.src && (
                  <div
                    style={{
                      width: 88, height: 88, borderRadius: '50%',
                      border: '2px solid var(--gold-soft)', flexShrink: 0,
                      backgroundImage: `url(${detail.avatar.src})`,
                      backgroundSize: `${(detail.avatar.zoom || 1) * 100}%`,
                      backgroundPosition: `${detail.avatar.posX ?? 50}% ${detail.avatar.posY ?? 50}%`,
                    }}
                  />
                )}
                <div className="detail-name" style={{ margin: 0 }}>{detail.name}</div>
              </div>
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
