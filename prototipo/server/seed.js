import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closePool, pool, waitForDatabase, withTransaction } from './db.js'
import { defaultSettings } from './defaults.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const legacyTournamentFile = path.join(root, 'data', 'tournament.json')

const fallbackFighters = [
  { id: 'f1', name: 'Mateo Ríos', team: 'Lobo Grappling', belt: 'Marrón', weight: '-76 kg', initials: 'MR', color: 'mint' },
  { id: 'f2', name: 'Iván Salas', team: 'Tigre Jiu-Jitsu', belt: 'Marrón', weight: '-76 kg', initials: 'IS', color: 'coral' },
  { id: 'f3', name: 'Leo Márquez', team: 'Norte BJJ', belt: 'Púrpura', weight: '-76 kg', initials: 'LM', color: 'blue' },
  { id: 'f4', name: 'Bruno Vega', team: 'Lobo Grappling', belt: 'Púrpura', weight: '-76 kg', initials: 'BV', color: 'gold' },
  { id: 'f5', name: 'Nicolás Cruz', team: 'Vértice Jiu-Jitsu', belt: 'Marrón', weight: '-82 kg', initials: 'NC', color: 'coral' },
  { id: 'f6', name: 'Gael Fuentes', team: 'Norte BJJ', belt: 'Marrón', weight: '-82 kg', initials: 'GF', color: 'blue' },
]

const blankScore = () => ({ points: 0, advantages: 0, penalties: 0 })

const fallbackBouts = [
  { id: 'b1', round: 1, slot: 0, redId: 'f1', blueId: 'f2', red: { ...blankScore(), points: 4, advantages: 1 }, blue: { ...blankScore(), points: 2, penalties: 1 }, status: 'live', winnerId: null },
  { id: 'b2', round: 1, slot: 1, redId: 'f3', blueId: 'f4', red: blankScore(), blue: blankScore(), status: 'upcoming', winnerId: null },
  { id: 'b3', round: 2, slot: 0, redId: null, blueId: null, red: blankScore(), blue: blankScore(), status: 'upcoming', winnerId: null },
]

async function readLegacyTournament() {
  try {
    return JSON.parse(await readFile(legacyTournamentFile, 'utf8'))
  } catch {
    return null
  }
}

export async function seedIfEmpty() {
  await waitForDatabase()
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM tournaments')
  if (rows[0].count > 0) return false

  const legacy = await readLegacyTournament()
  const fighters = Array.isArray(legacy?.fighters) && legacy.fighters.length
    ? legacy.fighters
    : fallbackFighters
  const bouts = Array.isArray(legacy?.bouts) && legacy.bouts.length
    ? legacy.bouts
    : fallbackBouts
  const tournamentId = randomUUID()
  const weightByFighter = new Map(fighters.map((fighter) => [fighter.id, fighter]))

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tournaments
        (id, name, event_date, location, mat_count, status, playback_url, operator, settings)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)`,
      [
        tournamentId,
        legacy?.eventName || 'Copa Norte 2026',
        legacy?.date || '2026-10-23',
        legacy?.location || 'Gimnasio Norte',
        legacy?.matCount || 1,
        legacy?.playbackUrl || '',
        JSON.stringify({ name: 'Alex López', role: 'Árbitro principal' }),
        JSON.stringify(defaultSettings),
      ],
    )

    for (const fighter of fighters) {
      await client.query(
        `INSERT INTO fighters
          (id, tournament_id, name, team, belt, weight, initials, color, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          fighter.id,
          tournamentId,
          fighter.name,
          fighter.team || 'Independiente',
          fighter.belt || 'Blanca',
          fighter.weight || '-64 kg',
          fighter.initials || initialsFromName(fighter.name),
          fighter.color || 'mint',
        ],
      )
    }

    for (const bout of bouts) {
      const red = weightByFighter.get(bout.redId)
      const blue = weightByFighter.get(bout.blueId)
      await client.query(
        `INSERT INTO bouts
          (id, tournament_id, round, slot, red_id, blue_id,
           red_points, red_advantages, red_penalties,
           blue_points, blue_advantages, blue_penalties,
           status, winner_id, division_belt, division_weight, history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          bout.id,
          tournamentId,
          bout.round,
          bout.slot,
          bout.redId || null,
          bout.blueId || null,
          bout.red?.points || 0,
          bout.red?.advantages || 0,
          bout.red?.penalties || 0,
          bout.blue?.points || 0,
          bout.blue?.advantages || 0,
          bout.blue?.penalties || 0,
          bout.status || 'upcoming',
          bout.winnerId || null,
          red?.belt || blue?.belt || '',
          red?.weight || blue?.weight || '',
          JSON.stringify(bout.history || []),
        ],
      )
    }
  })

  console.log('Torneo inicial creado en PostgreSQL.')
  return true
}

function initialsFromName(name) {
  return String(name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIfEmpty()
    .then((created) => {
      console.log(created ? 'Seed aplicado.' : 'La base ya contiene torneos.')
    })
    .catch((error) => {
      console.error('Error aplicando seed:', error)
      process.exitCode = 1
    })
    .finally(closePool)
}
