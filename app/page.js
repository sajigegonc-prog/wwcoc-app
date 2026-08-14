'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="wrap narrow">
      <div className="top-hero">
        <h1>WWCoC セッション管理アプリ</h1>
        <p className="sub">ハリー・ポッター×クトゥルフ神話TRPGを、AI KPと一緒に遊ぶための卓管理アプリ。</p>
      </div>

      <div className="top-menu">
        <Link href="/select?flow=host" className="top-btn primary">
          <div><div>ホストとして始める</div><span className="desc">セッションを新規に立ち上げる</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/select?flow=join" className="top-btn">
          <div><div>チャットに参加する</div><span className="desc">セッションIDとパスワードで参加</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/resume" className="top-btn">
          <div><div>セッションを再開する</div><span className="desc">参加中のセッション一覧から選ぶ</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/register" className="top-btn">
          <div><div>探索者登録</div><span className="desc">探索者シートを事前に登録・管理する</span></div>
          <span className="arrow">→</span>
        </Link>
        <Link href="/select?flow=solo" className="top-btn">
          <div><div>ソロダイス</div><span className="desc">セッションを作らず、探索者を選んでダイスだけ振る</span></div>
          <span className="arrow">→</span>
        </Link>
      </div>

      <p style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/login" className="back-link" style={{ display: 'inline-flex', justifyContent: 'center', margin: 0 }}>
          IDでログイン（データを復元／別の端末で続ける）
        </Link>
      </p>
    </div>
  )
}
