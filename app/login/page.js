'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginWithId } from '../../lib/auth'

export default function Login() {
  const router = useRouter()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    if (!id.trim() || !password.trim()) { alert('IDとパスワードを入力してください'); return }
    setBusy(true)
    try {
      await loginWithId(id, password)
      router.push('/register')
    } catch (err) {
      alert('ログインに失敗しました。IDまたはパスワードが違います。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap narrow">
      <Link href="/" className="back-link">← トップへ戻る</Link>
      <div className="eyebrow">WWCoC / 別端末で続ける</div>
      <h1 className="small">IDでログイン</h1>
      <p className="sub">探索者登録ページで発行したIDとパスワードで、別の端末からも同じデータにアクセスできます。</p>
      <div className="card">
        <div className="ffield">
          <label>ID</label>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="ABCD-1234" />
        </div>
        <div className="ffield">
          <label>パスワード</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="actions">
          <button className="plain primary" onClick={handleLogin} disabled={busy}>
            {busy ? 'ログイン中…' : 'ログインする'}
          </button>
        </div>
      </div>
      <p className="dim">
        IDをまだ発行していない場合は、探索者登録ページの「他の端末でも使う」から発行できます。
      </p>
    </div>
  )
}
