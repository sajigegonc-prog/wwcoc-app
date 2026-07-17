'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { ensureAnonUser } from '../lib/auth'

export default function Home() {
  useEffect(() => { ensureAnonUser().catch(console.error) }, [])

  return (
    <div className="wrap narrow">
      <div className="top-hero">
        <div className="crest">🦉</div>
        <div className="eyebrow" style={{ justifyContent: 'center' }}>WWCoC AI TRPG</div>
        <h1>探索者たちよ、集え</h1>
        <p className="sub">セッションを始める前に、まず選ぶところから。</p>
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
        <Link href="/register" className="top-btn">
          <div><div>探索者登録</div><span className="desc">探索者シートを事前に登録・管理する</span></div>
          <span className="arrow">→</span>
        </Link>
      </div>
    </div>
  )
}
