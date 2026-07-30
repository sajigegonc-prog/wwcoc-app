export function rollD100() {
  return Math.floor(Math.random() * 100) + 1
}

export function judgeResult(roll, skillValue) {
  const v = parseInt(skillValue, 10)
  if (roll === 100 || (v < 50 && roll >= 96)) return 'ファンブル'
  if (roll <= Math.floor(v / 5)) return 'クリティカル'
  if (roll <= Math.floor(v / 2)) return 'スペシャル'
  if (roll <= v) return '成功'
  return '失敗'
}
