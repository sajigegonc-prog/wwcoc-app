function splitWS(line) {
  return line.trim().split(/[\s\u3000]+/).filter(Boolean)
}

export function parseSheetText(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim())
  const data = {
    name: '', gender: '', age: '', house: '', origin: '',
    stats: {}, skills: { explore: [], social: [], action: [] },
    favSubject: '', weakSubject: '', appearance: '', personality: '',
    wand: '', pet: '', belongings: '', treasure: '', intro: ''
  }
  const simpleKeyMap = {
    '名前': 'name', '性別': 'gender', '年齢': 'age', '寮': 'house', '出身地': 'origin',
    '得意': 'favSubject', '苦手': 'weakSubject', '容姿': 'appearance', '性格': 'personality',
    '杖': 'wand', 'ペット': 'pet', 'その他私物': 'belongings', '大切なもの': 'treasure'
  }
  let mode = null
  const introLines = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line) { i++; continue }
    if (line.includes('【能力値】') || line.includes('【技能】') ||
        line.includes('【得意科目') || line.includes('【容姿・性格】') ||
        line.includes('【所持品】')) { i++; continue }
    if (line.includes('【キャラクター一言紹介】')) { mode = 'intro'; i++; continue }
    if (mode === 'intro') { introLines.push(lines[i]); i++; continue }
    if (/^STR/.test(line) && line.includes('CON')) {
      const headers = splitWS(line); const values = splitWS(lines[i + 1] || '')
      headers.forEach((h, idx) => data.stats[h] = values[idx] || '')
      i += 2; continue
    }
    if (/^POW/.test(line) && line.includes('APP')) {
      const headers = splitWS(line); const values = splitWS(lines[i + 1] || '')
      headers.forEach((h, idx) => data.stats[h] = values[idx] || '')
      i += 2; continue
    }
    if (/^HP/.test(line) && line.includes('SAN')) {
      const headers = splitWS(line); const values = splitWS(lines[i + 1] || '')
      headers.forEach((h, idx) => data.stats[h] = values[idx] || '')
      i += 2; continue
    }
    if (line === '探索系') { mode = 'explore'; i++; continue }
    if (line === '対人系') { mode = 'social'; i++; continue }
    if (line === '行動系') { mode = 'action'; i++; continue }
    if (line.startsWith('・') && (mode === 'explore' || mode === 'social' || mode === 'action')) {
      const parts = splitWS(line.slice(1))
      const value = parts.length > 1 ? parts.pop() : ''
      const name = parts.join(' ')
      data.skills[mode].push({ name, value })
      i++; continue
    }
    const m = line.match(/^([^\s：:]+)[：:]\s*(.*)$/)
    if (m && simpleKeyMap[m[1]]) { data[simpleKeyMap[m[1]]] = m[2] || ''; i++; continue }
    i++
  }
  data.intro = introLines.join('\n').trim()
  return data
}

export const SAMPLE_TEXT = `名前：藤堂ミラ
性別：女性
年齢：19
寮：ハッフルパフ
出身地：エディンバラ
【能力値】
STR　CON　DEX　INT
45　50　60　65
POW　APP　SIZ　EDU
55　50　40　60
HP　　SAN　　MP　　幸運
9　　55　　11　　50
【技能】
探索系
・目星　45
・聞き耳　40
・図書館　50
・隠密　35
対人系
・心理学　35
・説得　40
・言いくるめ　30
・威圧　25
行動系
・回避　50
・治療呪文　40
・解錠呪文　35
【得意科目／苦手科目】
得意：マグル学、薬草学
苦手：占い学
【容姿・性格】
容姿：160cm、赤茶色のショートヘア。作業用ゴーグルを額に上げている。
性格：几帳面で現実主義。感情はあまり表に出さないが、身内には甘い。
【所持品】
杖：桜材／白狐のひげ　34cm
ペット：（なし）
その他私物：脚に着けた工具ポーチ
大切なもの：父の形見の懐中時計
【キャラクター一言紹介】
日英の橋渡しをする、不器用だけど芯の強い魔法使い。`
