import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../db.js'
import {
  blankScore,
  defaultOperator,
  mergeSettings,
} from '../defaults.js'

function mapTournamentRow(row) {
  return {
    id: row.id,
    eventName: row.name,
    date: row.event_date
      ? new Date(row.event_date).toISOString().slice(0, 10)
      : '',
    location: row.location || '',
    matCount: row.mat_count || 1,
    status: row.status,
    playbackUrl: row.playback_url || '',
    operator: { ...defaultOperator, ...(row.operator || {}) },
    settings: mergeSettings(row.settings || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapFighterRow(row) {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    belt: row.belt,
    weight: row.weight,
    initials: row.initials,
    color: row.color,
    verified: row.verified,
  }
}

function mapBoutRow(row) {
  return {
    id: row.id,
    round: row.round,
    slot: row.slot,
    redId: row.red_id,
    blueId: row.blue_id,
    red: {
      points: row.red_points,
      advantages: row.red_advantages,
      penalties: row.red_penalties,
    },
    blue: {
      points: row.blue_points,
      advantages: row.blue_advantages,
      penalties: row.blue_penalties,
    },
    status: row.status,
    winnerId: row.winner_id,
    division: {
      belt: row.division_belt || '',
      weight: row.division_weight || '',
    },
    history: Array.isArray(row.history) ? row.history : [],
  }
}

export async function listTournaments(ownerId) {
  const result = await query(
    `SELECT id, name, event_date, location, status, created_at, updated_at
       FROM tournaments
      WHERE owner_id = $1
      ORDER BY updated_at DESC`,
    [String(ownerId)],
  )
  return result.rows.map((row) => ({
    id: row.id,
    eventName: row.name,
    date: row.event_date
      ? new Date(row.event_date).toISOString().slice(0, 10)
      : '',
    location: row.location || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function getActiveTournament(ownerId) {
  const tournamentResult = await query(
    `SELECT * FROM tournaments
     WHERE owner_id = $1 AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [String(ownerId)],
  )
  const row = tournamentResult.rows[0]
  if (!row) return null
  const [fighters, bouts] = await Promise.all([
    query('SELECT * FROM fighters WHERE tournament_id = $1 ORDER BY created_at, name', [row.id]),
    query('SELECT * FROM bouts WHERE tournament_id = $1 ORDER BY round, slot', [row.id]),
  ])
  return {
    ...mapTournamentRow(row),
    fighters: fighters.rows.map(mapFighterRow),
    bouts: bouts.rows.map(mapBoutRow),
  }
}

export async function getTournamentById(id, ownerId) {
  const result = await query(
    'SELECT * FROM tournaments WHERE id = $1 AND owner_id = $2',
    [id, String(ownerId)],
  )
  const row = result.rows[0]
  if (!row) return null
  const [fighters, bouts] = await Promise.all([
    query('SELECT * FROM fighters WHERE tournament_id = $1 ORDER BY created_at, name', [row.id]),
    query('SELECT * FROM bouts WHERE tournament_id = $1 ORDER BY round, slot', [row.id]),
  ])
  return {
    ...mapTournamentRow(row),
    fighters: fighters.rows.map(mapFighterRow),
    bouts: bouts.rows.map(mapBoutRow),
  }
}

export async function saveTournament(payload, ownerId) {
  if (!payload || typeof payload.eventName !== 'string') {
    throw new Error('El torneo debe incluir eventName.')
  }
  if (!Array.isArray(payload.fighters) || !Array.isArray(payload.bouts)) {
    throw new Error('El torneo debe incluir fighters y bouts.')
  }
  if (!String(payload.eventName).trim()) {
    throw new Error('El torneo debe tener un nombre.')
  }

  let savedTournamentId
  await withTransaction(async (client) => {
    const existing = payload.id
      ? await client.query(
          'SELECT id FROM tournaments WHERE id = $1 AND owner_id = $2',
          [payload.id, String(ownerId)],
        )
      : { rows: [] }
    if (payload.id && !existing.rows[0]) {
      const error = new Error('No se encontró el torneo de esta cuenta.')
      error.code = 'NOT_FOUND'
      throw error
    }
    const tournamentId = existing.rows[0]?.id || payload.id || randomUUID()
    savedTournamentId = tournamentId

    await client.query(
      `INSERT INTO tournaments
        (id, owner_id, name, event_date, location, mat_count, status, playback_url, operator, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         event_date = EXCLUDED.event_date,
         location = EXCLUDED.location,
         mat_count = EXCLUDED.mat_count,
         status = EXCLUDED.status,
         playback_url = EXCLUDED.playback_url,
         operator = EXCLUDED.operator,
         settings = EXCLUDED.settings`,
      [
        tournamentId,
        String(ownerId),
        payload.eventName.trim() || 'Torneo sin nombre',
        payload.date || null,
        payload.location || '',
        Number(payload.matCount) || 1,
        payload.status === 'archived' ? 'archived' : 'active',
        payload.playbackUrl || '',
        JSON.stringify({ ...defaultOperator, ...(payload.operator || {}) }),
        JSON.stringify(mergeSettings(payload.settings || {})),
      ],
    )

    await client.query('DELETE FROM bouts WHERE tournament_id = $1', [
      tournamentId,
    ])

    const fighterIds = new Set(payload.fighters.map((fighter) => fighter.id))
    for (const fighter of payload.fighters) {
      const fighterResult = await client.query(
        `INSERT INTO fighters
          (id, tournament_id, name, team, belt, weight, initials, color, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           tournament_id = EXCLUDED.tournament_id,
           name = EXCLUDED.name,
           team = EXCLUDED.team,
           belt = EXCLUDED.belt,
           weight = EXCLUDED.weight,
           initials = EXCLUDED.initials,
           color = EXCLUDED.color,
           verified = EXCLUDED.verified
         WHERE fighters.tournament_id = EXCLUDED.tournament_id`,
        [
          fighter.id,
          tournamentId,
          fighter.name,
          fighter.team || 'Independiente',
          fighter.belt || 'Blanca',
          fighter.weight || '-64 kg',
          fighter.initials || '',
          fighter.color || 'mint',
          fighter.verified !== false,
        ],
      )
      if (fighterResult.rowCount !== 1) {
        const error = new Error('Un peleador pertenece a otro torneo.')
        error.code = 'FORBIDDEN'
        throw error
      }
    }

    for (const bout of payload.bouts) {
      const red = payload.fighters.find((fighter) => fighter.id === bout.redId)
      const blue = payload.fighters.find((fighter) => fighter.id === bout.blueId)
      const redId = fighterIds.has(bout.redId) ? bout.redId : null
      const blueId = fighterIds.has(bout.blueId) ? bout.blueId : null
      const winnerId = fighterIds.has(bout.winnerId) ? bout.winnerId : null
      const redScore = { ...blankScore(), ...(bout.red || {}) }
      const blueScore = { ...blankScore(), ...(bout.blue || {}) }
      const boutResult = await client.query(
        `INSERT INTO bouts
          (id, tournament_id, round, slot, red_id, blue_id,
           red_points, red_advantages, red_penalties,
           blue_points, blue_advantages, blue_penalties,
           status, winner_id, division_belt, division_weight, history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO UPDATE SET
           tournament_id = EXCLUDED.tournament_id,
           round = EXCLUDED.round,
           slot = EXCLUDED.slot,
           red_id = EXCLUDED.red_id,
           blue_id = EXCLUDED.blue_id,
           red_points = EXCLUDED.red_points,
           red_advantages = EXCLUDED.red_advantages,
           red_penalties = EXCLUDED.red_penalties,
           blue_points = EXCLUDED.blue_points,
           blue_advantages = EXCLUDED.blue_advantages,
           blue_penalties = EXCLUDED.blue_penalties,
           status = EXCLUDED.status,
           winner_id = EXCLUDED.winner_id,
           division_belt = EXCLUDED.division_belt,
           division_weight = EXCLUDED.division_weight,
           history = EXCLUDED.history
         WHERE bouts.tournament_id = EXCLUDED.tournament_id`,
        [
          bout.id,
          tournamentId,
          Number(bout.round) || 0,
          Number(bout.slot) || 0,
          redId,
          blueId,
          redScore.points || 0,
          redScore.advantages || 0,
          redScore.penalties || 0,
          blueScore.points || 0,
          blueScore.advantages || 0,
          blueScore.penalties || 0,
          ['upcoming', 'live', 'completed'].includes(bout.status)
            ? bout.status
            : 'upcoming',
          winnerId,
          bout.division?.belt || red?.belt || blue?.belt || '',
          bout.division?.weight || red?.weight || blue?.weight || '',
          JSON.stringify(Array.isArray(bout.history) ? bout.history : []),
        ],
      )
      if (boutResult.rowCount !== 1) {
        const error = new Error('Un combate pertenece a otro torneo.')
        error.code = 'FORBIDDEN'
        throw error
      }
    }

    await client.query(
      `DELETE FROM fighters
       WHERE tournament_id = $1
         AND NOT (id = ANY($2::text[]))`,
      [tournamentId, [...fighterIds]],
    )
  })

  return getTournamentById(savedTournamentId, ownerId)
}
