import 'dotenv/config'
import express from 'express'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { closePool, query, waitForDatabase } from './db.js'
import { runMigrations } from './migrate.js'
import { authenticateToken, requireAuth } from './auth.js'
import {
  getActiveTournament,
  getTournamentById,
  listTournaments,
  saveTournament,
} from './repositories/tournaments.js'
import {
  createStream,
  deleteStream,
  finishStream,
  getStream,
  getStreamRow,
  listFeedStreams,
  listLiveStreams,
  listPublicVods,
  listStreams,
  markStaleLiveStreams,
  publishStream,
  saveStream,
  setThumbnail,
  updateStream,
} from './repositories/streams.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = path.join(root, 'data')
const thumbnailDirectory = path.join(dataDirectory, 'thumbnails')
const recordingsDirectory = path.join(dataDirectory, 'recordings')
const app = express()
const port = Number(process.env.PORT || 3001)

app.use(express.json({ limit: '2mb' }))

const mediaProxies = [
  ['/hls', process.env.MEDIAMTX_HLS_URL || 'http://localhost:8888'],
  ['/playback', process.env.MEDIAMTX_PLAYBACK_URL || 'http://localhost:9996'],
  ['/whip', process.env.MEDIAMTX_WHIP_URL || 'http://localhost:8889'],
]

for (const [prefix, base] of mediaProxies) {
  app.use(prefix, (request, response) => {
    const target = new URL(
      request.originalUrl.slice(prefix.length) || '/',
      base,
    )
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
    const proxy = transport(
      target,
      {
        method: request.method,
        headers: { ...request.headers, host: target.host },
      },
      (proxyResponse) => {
        response.writeHead(
          proxyResponse.statusCode || 502,
          proxyResponse.headers,
        )
        proxyResponse.pipe(response)
      },
    )
    proxy.on('error', (error) => {
      if (response.headersSent) {
        response.destroy(error)
        return
      }
      response.status(502).json({ error: 'MediaMTX no está disponible.' })
    })
    request.pipe(proxy)
  })
}

app.get('/api/health', async (_request, response) => {
  try {
    await query('SELECT 1')
    response.json({ status: 'ok', database: 'up' })
  } catch {
    response.status(503).json({ status: 'degraded', database: 'down' })
  }
})

app.get('/api/tournaments', requireAuth, async (request, response, next) => {
  try {
    response.json(await listTournaments(request.user.id))
  } catch (error) {
    next(error)
  }
})

app.get('/api/tournaments/:id', requireAuth, async (request, response, next) => {
  try {
    const tournament = await getTournamentById(request.params.id, request.user.id)
    if (!tournament) {
      return response.status(404).json({ error: 'Torneo no encontrado.' })
    }
    response.json(tournament)
  } catch (error) {
    next(error)
  }
})

app.get('/api/tournament', requireAuth, async (request, response, next) => {
  try {
    const tournament = await getActiveTournament(request.user.id)
    if (!tournament) {
      return response.status(404).json({ error: 'No hay torneo activo.' })
    }
    response.json(tournament)
  } catch (error) {
    next(error)
  }
})

app.post('/api/tournaments', requireAuth, async (request, response, next) => {
  try {
    const saved = await saveTournament(
      { ...request.body, id: undefined },
      request.user.id,
    )
    response.status(201).json(saved)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El torneo')) {
      return response.status(400).json({ error: error.message })
    }
    if (error?.code === 'FORBIDDEN') {
      return response.status(403).json({ error: error.message })
    }
    next(error)
  }
})

app.put('/api/tournament', requireAuth, async (request, response, next) => {
  try {
    const saved = await saveTournament(request.body, request.user.id)
    response.json(saved)
  } catch (error) {
    if (error?.code === 'NOT_FOUND') {
      return response.status(404).json({ error: error.message })
    }
    if (error?.code === 'FORBIDDEN') {
      return response.status(403).json({ error: error.message })
    }
    if (error instanceof Error && error.message.startsWith('El torneo')) {
      return response.status(400).json({ error: error.message })
    }
    next(error)
  }
})

app.get('/api/ice', (_request, response) => {
  const iceServers = [
    { urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' },
  ]
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    })
  }
  response.json({ iceServers })
})

app.get('/api/live', async (_request, response, next) => {
  try {
    const streams = await listLiveStreams()
    response.json(
      streams.map((stream) => ({
        ...stream,
        viewers: rooms.get(stream.path)?.viewers.size || 0,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.get('/api/vods', async (_request, response, next) => {
  try {
    response.json(await listPublicVods())
  } catch (error) {
    next(error)
  }
})

app.get('/api/feed', async (_request, response, next) => {
  try {
    response.json(await listFeedStreams())
  } catch (error) {
    next(error)
  }
})

app.get('/api/users/:userId/streams', async (request, response, next) => {
  try {
    const streams = await listFeedStreams({ creatorId: request.params.userId })
    response.json(streams)
  } catch (error) {
    next(error)
  }
})

app.get('/api/rooms/:roomId/score', (request, response) => {
  const roomId = decodeURIComponent(request.params.roomId)
  const room = rooms.get(roomId)
  response.json({
    roomId,
    live: Boolean(room?.publisher),
    viewers: room?.viewers.size || 0,
    score: room?.score || null,
  })
})

app.post('/api/streams/:id/save', requireAuth, async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row || String(row.creator_id) !== String(request.user.id)) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    const stream = await saveStream(request.params.id)
    if (!stream) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    response.json(stream)
  } catch (error) {
    next(error)
  }
})

app.post('/api/streams/:id/publish', requireAuth, async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row || String(row.creator_id) !== String(request.user.id)) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    const stream = await publishStream(
      request.params.id,
      request.body?.visibility,
    )
    if (!stream) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    response.json(stream)
  } catch (error) {
    next(error)
  }
})

app.get('/api/streams', requireAuth, async (request, response, next) => {
  try {
    const status = request.query.status
    const streams = await listStreams({
      status:
        status === 'live' || status === 'saved' || status === 'ended'
          ? String(status)
          : undefined,
      creatorId: String(request.user.id),
    })
    response.json(
      streams.map((stream) => ({
        ...stream,
        viewers: rooms.get(stream.path)?.viewers.size || 0,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/streams', requireAuth, async (request, response, next) => {
  try {
    let tournament = null
    if (request.body?.tournamentId) {
      tournament = await getTournamentById(
        request.body.tournamentId,
        request.user.id,
      )
      if (!tournament) {
        return response.status(404).json({ error: 'Torneo no encontrado.' })
      }
      if (
        request.body.boutId &&
        !tournament.bouts.some((bout) => bout.id === request.body.boutId)
      ) {
        return response.status(400).json({ error: 'Combate no encontrado.' })
      }
    }
    const stream = await createStream({
      title: request.body?.title,
      matId: request.body?.matId,
      tournamentId: tournament?.id,
      boutId: request.body?.boutId,
      creatorId: String(request.user.id),
      creatorName: request.user.nombre,
    })
    response.status(201).json(stream)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El creador')) {
      return response.status(400).json({ error: error.message })
    }
    next(error)
  }
})

app.get('/api/public/streams/:id', async (request, response, next) => {
  try {
    const stream = await getStream(request.params.id)
    if (!stream) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    if (
      stream.status !== 'live' &&
      (stream.status !== 'saved' ||
        !stream.isSaved ||
        stream.visibility === 'private')
    ) {
      return response.status(404).json({ error: 'Grabación no disponible.' })
    }
    response.json({
      ...stream,
      viewers: rooms.get(stream.path)?.viewers.size || 0,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/streams/:id', requireAuth, async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row || String(row.creator_id) !== String(request.user.id)) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    const stream = await getStream(request.params.id)
    if (!stream) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    response.json({
      ...stream,
      viewers: rooms.get(stream.path)?.viewers.size || 0,
    })
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/streams/:id/thumbnail',
  requireAuth,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    limit: process.env.MAX_THUMBNAIL_BYTES || '5mb',
  }),
  async (request, response, next) => {
    try {
      const row = await getStreamRow(request.params.id)
      if (!row || String(row.creator_id) !== String(request.user.id)) {
        return response.status(404).json({ error: 'Directo no encontrado.' })
      }
      if (!Buffer.isBuffer(request.body) || !request.body.length) {
        return response.status(400).json({ error: 'Miniatura vacía.' })
      }
      const extension =
        request.headers['content-type'] === 'image/png'
          ? 'png'
          : request.headers['content-type'] === 'image/webp'
            ? 'webp'
            : 'jpg'
      await mkdir(thumbnailDirectory, { recursive: true })
      const filePath = path.join(thumbnailDirectory, `${row.id}.${extension}`)
      await writeFile(filePath, request.body)
      const stream = await setThumbnail(row.id, filePath)
      response.json(stream)
    } catch (error) {
      next(error)
    }
  },
)

app.get('/api/streams/:id/thumbnail', async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row?.thumbnail_path) {
      return response.status(404).json({ error: 'Miniatura no encontrada.' })
    }
    response.sendFile(path.resolve(row.thumbnail_path))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/streams/:id', requireAuth, async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row || String(row.creator_id) !== String(request.user.id)) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    const body = request.body || {}
    if (body.finish || body.status === 'ended' || body.status === 'saved') {
      const stream = await finishStream(request.params.id, {
        peakViewers: body.peakViewers,
        finalScore: body.finalScore,
        endedAt: body.endedAt,
        save: body.save,
      })
      if (!stream) {
        return response.status(404).json({ error: 'Directo no encontrado.' })
      }
      if (body.save === false && stream.path) {
        await rm(path.join(recordingsDirectory, stream.path), {
          recursive: true,
          force: true,
        })
      }
      return response.json(stream)
    }
    const stream = await updateStream(request.params.id, {
      status: body.status,
      peak_viewers: body.peakViewers,
      final_score: body.finalScore,
      ended_at: body.endedAt,
      title: body.title,
      description: body.description,
      visibility: body.visibility,
      is_saved: body.isSaved,
    })
    if (!stream) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    response.json(stream)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/streams/:id', requireAuth, async (request, response, next) => {
  try {
    const row = await getStreamRow(request.params.id)
    if (!row || String(row.creator_id) !== String(request.user.id)) {
      return response.status(404).json({ error: 'Directo no encontrado.' })
    }
    if (row.status === 'live') {
      return response
        .status(409)
        .json({ error: 'Detén la emisión antes de eliminar el directo.' })
    }
    await deleteStream(request.params.id)
    await rm(path.join(recordingsDirectory, row.path), {
      recursive: true,
      force: true,
    })
    if (row.thumbnail_path) {
      await rm(row.thumbnail_path, { force: true })
    }
    response.json({ deleted: true })
  } catch (error) {
    next(error)
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.get(/.*/, (_request, response) =>
    response.sendFile(path.join(root, 'dist', 'index.html')),
  )
}

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Error interno del servidor.' })
})

const server = createServer(app)
const socketServer = new WebSocketServer({ server, path: '/ws' })
const rooms = new Map()

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function ensureRoom(roomId, meta = {}) {
  let room = rooms.get(roomId)
  if (!room) {
    room = {
      publisher: null,
      viewers: new Map(),
      score: null,
      title: meta.title || 'Directo',
      matId: meta.matId || 'mat-01',
      startedAt: new Date(),
      peakViewers: 0,
      streamId: meta.streamId || null,
    }
    rooms.set(roomId, room)
  }
  return room
}

function broadcastViewerCount(room) {
  const message = {
    type: 'viewer-count',
    viewers: room.viewers.size,
  }
  send(room.publisher, message)
  for (const viewer of room.viewers.values()) send(viewer, message)
}

function removeClient(socket) {
  const room = rooms.get(socket.roomId)
  if (!room) return
  if (room.publisher === socket) {
    room.publisher = null
    for (const viewer of room.viewers.values()) {
      send(viewer, { type: 'publisher-left' })
    }
    if (room.streamId) {
      const streamId = room.streamId
      const peakViewers = room.peakViewers
      const finalScore = room.score
      setTimeout(() => {
        finishStream(streamId, { peakViewers, finalScore }).catch((error) =>
          console.error('No se pudo cerrar el directo:', error.message),
        )
      }, 1500)
    }
  } else if (socket.viewerId) {
    room.viewers.delete(socket.viewerId)
    send(room.publisher, {
      type: 'viewer-left',
      viewerId: socket.viewerId,
    })
    broadcastViewerCount(room)
  }
  if (!room.publisher && room.viewers.size === 0) rooms.delete(socket.roomId)
}

socketServer.on('connection', (socket, request) => {
  socket.isAlive = true
  socket.on('pong', () => {
    socket.isAlive = true
  })
  const socketUrl = new URL(request.url, 'http://localhost')
  const socketToken = socketUrl.searchParams.get('token')
  socket.on('message', async (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    const { type, roomId } = message
    if (!roomId || typeof roomId !== 'string' || roomId.length > 120) return

    if (type === 'publisher') {
      let user
      let stream
      try {
        user = await authenticateToken(socketToken)
        stream = message.streamId ? await getStreamRow(message.streamId) : null
      } catch (error) {
        console.error('No se pudo validar el publicador de MATCTRL:', error.message)
        socket.close()
        return
      }
      if (
        !user ||
        !stream ||
        stream.status !== 'live' ||
        String(stream.creator_id) !== String(user.id) ||
        stream.path !== roomId
      ) {
        send(socket, { type: 'error', message: 'Debes iniciar sesión como propietario para emitir.' })
        socket.close()
        return
      }
      const room = ensureRoom(roomId, {
        title: message.title,
        matId: message.matId,
        streamId: message.streamId,
      })
      room.publisher = socket
      socket.roomId = roomId
      socket.role = 'publisher'
      socket.userId = String(user.id)
      if (message.streamId) room.streamId = message.streamId
      send(socket, {
        type: 'publisher-ready',
        viewers: room.viewers.size,
      })
      for (const viewer of room.viewers.values()) {
        send(viewer, { type: 'publisher-ready' })
      }
      for (const viewerId of room.viewers.keys()) {
        send(socket, { type: 'viewer-joined', viewerId })
      }
      broadcastViewerCount(room)
      return
    }

    if (type === 'viewer') {
      const room = ensureRoom(roomId)
      socket.roomId = roomId
      socket.role = 'viewer'
      socket.viewerId = message.viewerId || `viewer-${Date.now()}`
      room.viewers.set(socket.viewerId, socket)
      room.peakViewers = Math.max(room.peakViewers, room.viewers.size)
      send(socket, {
        type: room.publisher ? 'publisher-ready' : 'waiting-for-publisher',
        viewerId: socket.viewerId,
      })
      if (room.score) send(socket, { type: 'score', score: room.score })
      send(room.publisher, {
        type: 'viewer-joined',
        viewerId: socket.viewerId,
      })
      broadcastViewerCount(room)
      return
    }

    const room = rooms.get(roomId)
    if (!room) return
    if (type === 'score' && socket.role === 'publisher') {
      room.score = message.score || null
      for (const viewer of room.viewers.values()) {
        send(viewer, { type: 'score', score: room.score })
      }
    } else if (type === 'stop' && socket.roomId === roomId) {
      removeClient(socket)
    }
  }).on('error', (error) => {
    console.error('Error procesando mensaje WebSocket de MATCTRL:', error.message)
  })
  socket.on('close', () => removeClient(socket))
  socket.on('error', () => removeClient(socket))
})

const heartbeat = setInterval(() => {
  for (const socket of socketServer.clients) {
    if (socket.isAlive === false) {
      socket.terminate()
      continue
    }
    socket.isAlive = false
    socket.ping()
  }
}, 30000)

async function start() {
  await waitForDatabase()
  if (process.env.AUTO_MIGRATE !== 'false') await runMigrations()
  await markStaleLiveStreams()
  await mkdir(thumbnailDirectory, { recursive: true })
  await mkdir(recordingsDirectory, { recursive: true })
  server.listen(port, '127.0.0.1', () =>
    console.log(`MATCTRL interno disponible en 127.0.0.1:${port}`),
  )
}

async function shutdown() {
  clearInterval(heartbeat)
  socketServer.close()
  server.close()
  await closePool()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start().catch((error) => {
  console.error('No se pudo iniciar MATCTRL:', error)
  process.exitCode = 1
})
