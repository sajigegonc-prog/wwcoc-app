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

// よく使う定番ダイス（CoCのダメージロールなど）
export const DICE_OPTIONS = [
  { label: '1D3', count: 1, sides: 3 },
  { label: '1D4', count: 1, sides: 4 },
  { label: '1D6', count: 1, sides: 6 },
  { label: '1D8', count: 1, sides: 8 },
  { label: '1D10', count: 1, sides: 10 },
  { label: '2D6', count: 2, sides: 6 },
  { label: '3D6', count: 3, sides: 6 },
]

export function rollCustom(count, sides) {
  const rolls = []
  for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1)
  const total = rolls.reduce((a, b) => a + b, 0)
  return { rolls, total }
}
