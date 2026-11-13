import { matctrlPath } from './paths.js'

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  const token = localStorage.getItem('le_token')
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ArrayBuffer
    ) {
      init.body = body
    } else {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }
  const response = await fetch(path, init)
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : null
  if (!response.ok) {
    const error = new Error(data?.error || `Error ${response.status}`)
    error.status = response.status
    throw error
  }
  return data
}

export function getTournament() {
  return request(matctrlPath('/api/tournament'))
}

export function getTournaments() {
  return request(matctrlPath('/api/tournaments'))
}

export function getTournamentById(id) {
  return request(matctrlPath(`/api/tournaments/${encodeURIComponent(id)}`))
}

export function saveTournament(tournament) {
  return request(matctrlPath(tournament.id ? '/api/tournament' : '/api/tournaments'), {
    method: tournament.id ? 'PUT' : 'POST',
    body: tournament,
  })
}

export function getIceServers() {
  return request(matctrlPath('/api/ice'))
}

export function listStreams(options = {}) {
  const params = new URLSearchParams()
  if (typeof options === 'string') {
    if (options) params.set('status', options)
  } else {
    if (options.status) params.set('status', options.status)
    if (options.creatorId) params.set('creatorId', options.creatorId)
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  return request(matctrlPath(`/api/streams${query}`))
}

export function listFeedStreams() {
  return request(matctrlPath('/api/feed'))
}

export function listUserStreams(userId) {
  return request(matctrlPath(`/api/users/${encodeURIComponent(userId)}/streams`))
}

export function listLiveStreams() {
  return request(matctrlPath('/api/live'))
}

export function listVods() {
  return request(matctrlPath('/api/vods'))
}

export function getRoomScore(roomId) {
  return request(matctrlPath(`/api/rooms/${encodeURIComponent(roomId)}/score`))
}

export function saveStream(id) {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}/save`), {
    method: 'POST',
  })
}

export function publishStream(id, visibility = 'public') {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}/publish`), {
    method: 'POST',
    body: { visibility },
  })
}

export function getStream(id) {
  return request(matctrlPath(`/api/public/streams/${encodeURIComponent(id)}`))
}

export function createStream(payload) {
  return request(matctrlPath('/api/streams'), { method: 'POST', body: payload })
}

export function finishStream(id, payload = {}) {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: { ...payload, finish: true },
  })
}

export function updateStream(id, payload) {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteStream(id) {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
}

export function uploadThumbnail(id, blob) {
  return request(matctrlPath(`/api/streams/${encodeURIComponent(id)}/thumbnail`), {
    method: 'POST',
    body: blob,
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
  })
}

export function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('le_token')
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${protocol}//${window.location.host}${matctrlPath('/ws')}${query}`
}
