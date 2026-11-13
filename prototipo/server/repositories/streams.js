import { randomUUID } from 'node:crypto'
import { query } from '../db.js'

const basePath = process.env.MATCTRL_BASE_PATH || '/matctrl'
const playbackBase =
  process.env.MEDIAMTX_PLAYBACK_URL || 'http://localhost:9996'

function playbackUrl(row) {
  if (!row.recording_start || !Number(row.duration_seconds)) return ''
  const start = new Date(row.recording_start).toISOString()
  return `${basePath}/playback/get?path=${encodeURIComponent(row.path)}&start=${encodeURIComponent(start)}&duration=${Number(row.duration_seconds)}&format=mp4`
}

export function toPublicStream(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    title: row.title,
    matId: row.mat_id,
    boutId: row.bout_id || null,
    path: row.path,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    recordingStart: row.recording_start,
    durationSeconds: Number(row.duration_seconds) || 0,
    peakViewers: row.peak_viewers || 0,
    finalScore: row.final_score || null,
    visibility: row.visibility || 'public',
    isSaved: row.is_saved !== false,
    description: row.description || '',
    savedAt: row.saved_at || null,
    publishedAt: row.published_at || null,
    creatorId: row.creator_id,
    creatorName: row.creator_name || 'Usuario',
    creatorAvatar: row.creator_avatar || '',
    mimeType: row.mime_type || null,
    fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : 0,
    thumbnailUrl: row.thumbnail_path ? `${basePath}/api/streams/${row.id}/thumbnail` : '',
    hlsUrl: row.status === 'live' ? `${basePath}/hls/${encodeURIComponent(row.path)}/index.m3u8` : '',
    playbackUrl: playbackUrl(row),
    createdAt: row.created_at,
  }
}

export async function createStream({
  title,
  matId,
  tournamentId,
  boutId,
  creatorId,
  creatorName,
  creatorAvatar,
}) {
  const path = `${matId || 'mat-01'}-${randomUUID()}`
  const normalizedCreatorId = String(creatorId || '').slice(0, 80)
  if (!normalizedCreatorId) throw new Error('El creador autenticado es obligatorio.')
  const normalizedCreatorName = String(creatorName || 'Usuario').slice(0, 80)
  const normalizedCreatorAvatar = String(creatorAvatar || '').slice(0, 255)
  const result = await query(
    `INSERT INTO streams
       (tournament_id, bout_id, title, mat_id, path, status, creator_id, creator_name, creator_avatar)
     VALUES ($1, $2, $3, $4, $5, 'live', $6, $7, $8)
     RETURNING *`,
    [
      tournamentId || null,
      boutId || null,
      String(title || 'Directo').slice(0, 140),
      matId || 'mat-01',
      path,
      normalizedCreatorId,
      normalizedCreatorName,
      normalizedCreatorAvatar,
    ],
  )
  return toPublicStream(result.rows[0])
}

export async function getStream(id) {
  const result = await query('SELECT * FROM streams WHERE id = $1', [id])
  return result.rows[0] ? toPublicStream(result.rows[0]) : null
}

export async function getStreamRow(id) {
  const result = await query('SELECT * FROM streams WHERE id = $1', [id])
  return result.rows[0] || null
}

export async function listStreams({ status, creatorId } = {}) {
  const clauses = []
  const values = []

  if (status) {
    clauses.push(`status = $${values.length + 1}`)
    values.push(status)
  }

  if (creatorId) {
    clauses.push(`creator_id = $${values.length + 1}`)
    values.push(creatorId)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await query(
    `SELECT * FROM streams ${where} ORDER BY started_at DESC`,
    values,
  )
  return result.rows.map(toPublicStream)
}

export async function listLiveStreams() {
  return listStreams({ status: 'live' })
}

export async function listFeedStreams({ creatorId } = {}) {
  const clauses = [
    "((status = $1) OR (status = $2 AND visibility = $3 AND is_saved = true))",
  ]
  const values = ['live', 'saved', 'public']

  if (creatorId) {
    clauses.push('creator_id = $4')
    values.push(creatorId)
  }

  const result = await query(
    `SELECT * FROM streams
     WHERE ${clauses.join(' AND ')}
     ORDER BY started_at DESC`,
    values,
  )
  return result.rows.map(toPublicStream)
}

export async function listPublicVods() {
  const result = await query(
    `SELECT * FROM streams
     WHERE status = 'saved' AND visibility = 'public' AND is_saved = true
     ORDER BY started_at DESC`,
  )
  return result.rows.map(toPublicStream)
}

export async function saveStream(id) {
  return updateStream(id, {
    status: 'saved',
    is_saved: true,
    saved_at: new Date(),
  })
}

export async function publishStream(id, visibility = 'public') {
  const safe = ['public', 'unlisted', 'private'].includes(visibility)
    ? visibility
    : 'public'
  return updateStream(id, {
    visibility: safe,
    published_at: safe === 'public' ? new Date() : null,
  })
}

export async function updateStream(id, patch = {}) {
  const allowed = {
    status: 'status',
    ended_at: 'ended_at',
    recording_start: 'recording_start',
    duration_seconds: 'duration_seconds',
    peak_viewers: 'peak_viewers',
    final_score: 'final_score',
    title: 'title',
    description: 'description',
    visibility: 'visibility',
    is_saved: 'is_saved',
    saved_at: 'saved_at',
    published_at: 'published_at',
    mime_type: 'mime_type',
    file_path: 'file_path',
    file_size_bytes: 'file_size_bytes',
    thumbnail_path: 'thumbnail_path',
  }
  const sets = []
  const values = []
  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] === undefined) continue
    values.push(patch[key])
    sets.push(`${column} = $${values.length}`)
  }
  if (!sets.length) return getStream(id)
  values.push(id)
  const result = await query(
    `UPDATE streams SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  )
  return result.rows[0] ? toPublicStream(result.rows[0]) : null
}

export async function getPlaybackTimespan(path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 900 * attempt))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(
        `${playbackBase}/list?path=${encodeURIComponent(path)}`,
        { signal: controller.signal },
      )
      if (!response.ok) continue
      const timespans = await response.json()
      if (!Array.isArray(timespans) || !timespans.length) continue
      const first = timespans[0]
      return {
        start: new Date(first.start),
        duration: Number(first.duration) || 0,
      }
    } catch {
      /* MediaMTX todavía puede estar cerrando la grabación. */
    } finally {
      clearTimeout(timeout)
    }
  }
  return null
}

export async function finishStream(
  id,
  { peakViewers, finalScore, endedAt, save = true } = {},
) {
  const row = await getStreamRow(id)
  if (!row) return null
  const timespan = await getPlaybackTimespan(row.path)
  const result = await query(
    `UPDATE streams SET
       status = CASE
         WHEN $8 = false THEN 'ended'
         WHEN $2 = 'saved' OR status = 'saved' THEN 'saved'
         ELSE $2
       END,
       ended_at = COALESCE(ended_at, $3, now()),
       recording_start = CASE
         WHEN $8 = true THEN COALESCE($4, recording_start)
         ELSE NULL
       END,
       duration_seconds = CASE
         WHEN $8 = true THEN GREATEST(duration_seconds, $5)
         ELSE 0
       END,
       peak_viewers = GREATEST(peak_viewers, $6),
       final_score = COALESCE($7, final_score),
       is_saved = $8,
       saved_at = CASE
         WHEN $8 = true AND $2 = 'saved' THEN COALESCE(saved_at, now())
         ELSE NULL
       END,
       published_at = CASE
         WHEN $8 = true AND $2 = 'saved' THEN COALESCE(published_at, now())
         ELSE NULL
       END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      timespan ? 'saved' : 'ended',
      endedAt ? new Date(endedAt) : null,
      timespan ? timespan.start : null,
      timespan ? timespan.duration : 0,
      Number(peakViewers) || 0,
      finalScore ? JSON.stringify(finalScore) : null,
      Boolean(timespan) && save !== false,
    ],
  )
  return result.rows[0] ? toPublicStream(result.rows[0]) : null
}

export async function setThumbnail(id, thumbnailPath) {
  return updateStream(id, { thumbnail_path: thumbnailPath })
}

export async function deleteStream(id) {
  const row = await getStreamRow(id)
  if (!row) return null
  await query('DELETE FROM streams WHERE id = $1', [id])
  return row
}

export async function markStaleLiveStreams() {
  await query(
    `UPDATE streams
     SET status = 'ended',
         ended_at = COALESCE(ended_at, now()),
         is_saved = false,
         recording_start = NULL,
         duration_seconds = 0
     WHERE status = 'live'`,
  )
}
