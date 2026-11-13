export const ACTIONS = [
  ['Derribo', 2],
  ['Barrido', 2],
  ['Rodilla al vientre', 2],
  ['Pase de guardia', 3],
  ['Montada', 4],
  ['Control de espalda', 4],
]

export const ROUNDS = ['Cuartos de final', 'Semifinal', 'Final']
export const BELTS = ['Blanca', 'Azul', 'Púrpura', 'Marrón', 'Negra']
export const WEIGHTS = ['-64 kg', '-70 kg', '-76 kg', '-82 kg', '-88 kg', '+88 kg']
export const AVATAR_COLORS = ['mint', 'coral', 'blue', 'gold']

export const blankScore = () => ({ points: 0, advantages: 0, penalties: 0 })

export function formatClock(value) {
  const safe = Math.max(0, Number(value) || 0)
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}

export function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = Math.floor(safe % 60)
  return hours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest
        .toString()
        .padStart(2, '0')}`
    : `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function formatDate(value, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function matchDuration(bout, fighters, durations) {
  const minutes = {
    Blanca: 5,
    Azul: 6,
    Púrpura: 7,
    Marrón: 8,
    Negra: 10,
    ...(durations || {}),
  }
  const participantMinutes = [bout?.redId, bout?.blueId].map(
    (id) => minutes[fighters?.find((item) => item.id === id)?.belt] || 5,
  )
  return Math.max(...participantMinutes) * 60
}

export function groupRounds(bouts = []) {
  return [
    ...bouts.reduce(
      (map, item) =>
        map.set(item.round, [...(map.get(item.round) || []), item]),
      new Map(),
    ),
  ].sort(([a], [b]) => a - b)
}

export function roundTitle(round, totalRounds) {
  const count = Math.max(1, Number(totalRounds) || 1)
  return ROUNDS[ROUNDS.length - count + round] || `Ronda ${Number(round) + 1}`
}

export function roundCount(bouts = []) {
  return Math.max(1, ...bouts.map((item) => Number(item.round) + 1))
}

export function decideWinner(bout, redId, blueId) {
  if (!bout) return null
  const redScore = [
    bout.red?.points || 0,
    bout.red?.advantages || 0,
    -(bout.red?.penalties || 0),
  ]
  const blueScore = [
    bout.blue?.points || 0,
    bout.blue?.advantages || 0,
    -(bout.blue?.penalties || 0),
  ]
  const deciding = redScore.findIndex(
    (value, index) => value !== blueScore[index],
  )
  if (deciding < 0) return null
  return redScore[deciding] > blueScore[deciding] ? redId : blueId
}

export function scoreboardPayload({ bout, red, blue, remaining, running, eventName, roundLabel }) {
  if (!bout) return null
  return {
    boutId: bout.id,
    eventName: eventName || 'MATCTRL',
    roundLabel: roundLabel || '',
    remaining: Number(remaining) || 0,
    running: Boolean(running),
    red: {
      id: red?.id || null,
      name: red?.name || 'Por definir',
      team: red?.team || '',
      initials: red?.initials || '?',
      color: red?.color || 'neutral',
      belt: red?.belt || '',
      ...bout.red,
    },
    blue: {
      id: blue?.id || null,
      name: blue?.name || 'Por definir',
      team: blue?.team || '',
      initials: blue?.initials || '?',
      color: blue?.color || 'neutral',
      belt: blue?.belt || '',
      ...bout.blue,
    },
    winnerId: bout.winnerId || null,
    status: bout.status || 'upcoming',
  }
}

export function winnerSide(score, fighterId) {
  if (!score || !fighterId) return null
  if (score.red?.id === fighterId) return 'red'
  if (score.blue?.id === fighterId) return 'blue'
  return null
}
