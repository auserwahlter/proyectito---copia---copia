import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import Hls from 'hls.js'
import {
  Camera,
  Check,
  ChevronDown,
  Copy,
  Radio,
  RefreshCw,
  Square,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  createStream,
  finishStream,
  getIceServers,
  getStream,
  socketUrl,
  uploadThumbnail,
} from './lib/api.js'
import { matctrlPath } from './lib/paths.js'
import { formatDuration, scoreboardPayload } from './lib/utils.js'
import { ScoreboardOverlay, ScoreboardPanel } from './components/Scoreboard.jsx'
import { useWinnerCelebration } from './hooks/useWinnerCelebration.js'

const WHIP_BASE = import.meta.env.VITE_WHIP_BASE || '/matctrl/whip'
const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }]

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function whipUrl(path) {
  return `${WHIP_BASE.replace(/\/$/, '')}/${encodeURIComponent(path)}/whip`
}

function resolveWhipResource(url) {
  if (!url) return ''
  try {
    const pathname = new URL(url, window.location.origin).pathname
    if (/^https?:/i.test(WHIP_BASE)) {
      return `${WHIP_BASE.replace(/\/$/, '')}${pathname}`
    }
    if (pathname.startsWith('/matctrl/whip')) return pathname
    return pathname.startsWith('/whip')
      ? matctrlPath(pathname)
      : matctrlPath(`/whip${pathname}`)
  } catch {
    return url
  }
}

function waitForIceGathering(peer, timeout = 2600) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, timeout)
    function done() {
      window.clearTimeout(timer)
      peer.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    function check() {
      if (peer.iceGatheringState === 'complete') done()
    }
    peer.addEventListener('icegatheringstatechange', check)
  })
}

export const LiveStudio = forwardRef(function LiveStudio(
  {
    roomId = 'mat-01',
    tournament,
    bout,
    red,
    blue,
    remaining,
    running,
    eventName,
    roundLabel,
    onStreamCreated,
    onStreamEnded,
    onToast,
  },
  ref,
) {
  const [state, setState] = useState('idle')
  const [stream, setStream] = useState(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [thumbBusy, setThumbBusy] = useState(false)
  const [saveReplay, setSaveReplay] = useState(true)
  const preview = useRef(null)
  const socket = useRef(null)
  const media = useRef(null)
  const peer = useRef(null)
  const whipResource = useRef('')
  const streamRef = useRef(null)
  const scoreRef = useRef(null)
  const peakViewers = useRef(0)
  const startedAt = useRef(null)
  const starting = useRef(false)

  const score = useMemo(
    () =>
      scoreboardPayload({
        bout,
        red,
        blue,
        remaining,
        running,
        eventName,
        roundLabel,
      }),
    [bout, red, blue, remaining, running, eventName, roundLabel],
  )

  useEffect(() => {
    scoreRef.current = score
    if (streamRef.current && socket.current?.readyState === WebSocket.OPEN) {
      send(socket.current, {
        type: 'score',
        roomId: streamRef.current.path,
        score,
      })
    }
  }, [score])

  useEffect(() => {
    if (state !== 'live') return undefined
    const timer = window.setInterval(() => {
      if (startedAt.current) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [state])

  function setViewerTotal(count) {
    const total = Math.max(0, Number(count) || 0)
    peakViewers.current = Math.max(peakViewers.current, total)
    setViewers(total)
  }

  function connectSocket(created) {
    const connection = new WebSocket(socketUrl())
    socket.current = connection
    connection.addEventListener('open', () => {
      send(connection, {
        type: 'publisher',
        roomId: created.path,
        streamId: created.id,
        title: created.title,
        matId: created.matId,
      })
      if (scoreRef.current) {
        send(connection, {
          type: 'score',
          roomId: created.path,
          score: scoreRef.current,
        })
      }
    })
    connection.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type === 'publisher-ready') {
        setViewerTotal(message.viewers || 0)
      } else if (message.type === 'viewer-count') {
        setViewerTotal(message.viewers)
      }
    })
  }

  async function captureThumbnail(target = streamRef.current) {
    const video = preview.current
    if (!target || !video || !video.videoWidth || !video.videoHeight) return null
    try {
      setThumbBusy(true)
      const width = 640
      const height = Math.round((width * video.videoHeight) / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas
        .getContext('2d')
        ?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.82),
      )
      if (!blob) return null
      const updated = await uploadThumbnail(target.id, blob)
      if (updated && streamRef.current?.id === target.id) {
        setStream(updated)
        streamRef.current = { ...streamRef.current, ...updated }
      }
      return updated
    } catch {
      return null
    } finally {
      setThumbBusy(false)
    }
  }

  async function stopBroadcast({ silent = false, winnerId = null } = {}) {
    const current = streamRef.current
    const finalScore = scoreRef.current
      ? {
          ...scoreRef.current,
          ...(winnerId ? { winnerId, status: 'completed' } : {}),
        }
      : null
    if (current) {
      await captureThumbnail(current)
      if (finalScore) {
        send(socket.current, {
          type: 'score',
          roomId: current.path,
          score: finalScore,
        })
      }
      send(socket.current, { type: 'stop', roomId: current.path })
    }
    socket.current?.close()
    socket.current = null
    peer.current?.close()
    peer.current = null
    media.current?.getTracks().forEach((track) => track.stop())
    media.current = null
    if (preview.current) preview.current.srcObject = null
    if (whipResource.current) {
      fetch(whipResource.current, { method: 'DELETE' }).catch(() => {})
      whipResource.current = ''
    }
    setState('idle')
    setViewers(0)
    setElapsed(0)
    streamRef.current = null
    setStream(null)
    startedAt.current = null
    if (!current) return
    await new Promise((resolve) => window.setTimeout(resolve, 1500))
    try {
      const finished = await finishStream(current.id, {
        peakViewers: peakViewers.current,
        finalScore,
        save: saveReplay,
      })
      if (finished) {
        onStreamEnded?.(finished)
        if (!silent) {
          onToast?.({
            tone: 'success',
            title: 'Emisión finalizada',
            message: !saveReplay
              ? 'El directo se cerró sin guardar repetición.'
              : finished.playbackUrl
                ? 'La grabación está disponible en la biblioteca.'
                : 'El directo se cerró correctamente.',
          })
        }
      }
    } catch (cause) {
      if (!silent) {
        onToast?.({
          tone: 'error',
          title: 'No se pudo cerrar el directo',
          message: cause instanceof Error ? cause.message : 'Intenta de nuevo.',
        })
      }
    }
  }

  async function startBroadcast(deviceId) {
    if (starting.current) {
      return { ok: false, error: 'La emisión ya se está iniciando.' }
    }
    starting.current = true
    setError('')
    if (media.current || peer.current || streamRef.current) {
      await stopBroadcast({ silent: true })
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const message =
        'El navegador requiere localhost o HTTPS para acceder a la cámara.'
      setError(message)
      setState('error')
      starting.current = false
      return { ok: false, error: message }
    }

    let created = null
    try {
      const videoConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
      try {
        media.current = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: true,
        })
      } catch (cause) {
        if (
          !['NotFoundError', 'OverconstrainedError', 'NotAllowedError'].includes(
            cause?.name,
          )
        ) {
          throw cause
        }
        if (cause?.name === 'NotAllowedError') throw cause
        media.current = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
      }
      if (preview.current) preview.current.srcObject = media.current
      setState('connecting')

      created = await createStream({
        title: `${eventName || 'Directo nuevo'} · ${String(roomId).toUpperCase()}`,
        matId: roomId,
        tournamentId: tournament?.id,
      })
      streamRef.current = created
      setStream(created)
      startedAt.current = Date.now()
      peakViewers.current = 0
      setElapsed(0)
      onStreamCreated?.(created)
      connectSocket(created)

      const iceServers = await getIceServers()
        .then((data) => data.iceServers)
        .catch(() => FALLBACK_ICE)
      const connection = new RTCPeerConnection({ iceServers })
      peer.current = connection
      media.current
        .getTracks()
        .forEach((track) => connection.addTrack(track, media.current))
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await waitForIceGathering(connection)
      const response = await fetch(whipUrl(created.path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: connection.localDescription.sdp,
      })
      if (!response.ok) {
        throw new Error(
          `MediaMTX rechazó la emisión (${response.status}). Verifica que el contenedor de MediaMTX esté activo.`,
        )
      }
      whipResource.current = resolveWhipResource(
        response.headers.get('location'),
      )
      const answer = await response.text()
      await connection.setRemoteDescription({ type: 'answer', sdp: answer })
      setState('live')
      setViewerTotal(0)
      window.setTimeout(() => captureThumbnail(created), 1400)
      onToast?.({
        tone: 'success',
        title: 'Emisión iniciada',
        message: 'La grabación se guardará en el servidor al finalizar.',
      })
      return { ok: true, stream: created }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'No se pudo iniciar la emisión.'
      setError(message)
      setState('error')
      onToast?.({
        tone: 'error',
        title: 'No se pudo iniciar la emisión',
        message,
      })
      peer.current?.close()
      peer.current = null
      media.current?.getTracks().forEach((track) => track.stop())
      media.current = null
      if (preview.current) preview.current.srcObject = null
      if (whipResource.current) {
        fetch(whipResource.current, { method: 'DELETE' }).catch(() => {})
        whipResource.current = ''
      }
      socket.current?.close()
      socket.current = null
      setViewers(0)
      setElapsed(0)
      startedAt.current = null
      if (created) {
        try {
          await finishStream(created.id, { peakViewers: 0 })
        } catch {
          /* la sesión se cerrará al liberar el recurso */
        }
        onStreamEnded?.(created)
      }
      streamRef.current = null
      setStream(null)
      return { ok: false, error: message }
    } finally {
      starting.current = false
    }
  }

  useImperativeHandle(ref, () => ({
    startBroadcast,
    stopBroadcast,
    captureThumbnail,
    state,
    stream,
  }))

  useEffect(
    () => () => {
      send(socket.current, {
        type: 'stop',
        roomId: streamRef.current?.path,
      })
      socket.current?.close()
      peer.current?.close()
      media.current?.getTracks().forEach((track) => track.stop())
      if (whipResource.current) {
        fetch(whipResource.current, { method: 'DELETE' }).catch(() => {})
      }
    },
    [],
  )

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copia el enlace de espectadores:', shareUrl)
    }
  }

  async function copyScoreLink() {
    try {
      await navigator.clipboard.writeText(scoreUrl)
      onToast?.({
        tone: 'success',
        title: 'Enlace del marcador copiado',
        message: 'Compártelo con el público o úsalo en OBS.',
      })
    } catch {
      window.prompt('Copia el enlace del marcador:', scoreUrl)
    }
  }

  const shareUrl = stream
    ? `${window.location.origin}${matctrlPath(`/live/${encodeURIComponent(stream.id)}`)}`
    : `${window.location.origin}${matctrlPath(`/live/${encodeURIComponent(roomId)}`)}`
  const scoreUrl = `${window.location.origin}${matctrlPath(
    `/score/${encodeURIComponent(stream?.path || roomId)}`,
  )}`
  const live = state === 'live'
  const busy = state === 'connecting'

  return (
    <section className="live-studio">
      <div className="live-studio-head">
        <div>
          <div className="eyebrow">EMISIÓN DESDE ESTE NAVEGADOR</div>
          <h2>Cámara en directo</h2>
        </div>
        <span className={`connection ${live ? 'connected' : ''}`}>
          <i />
          {live
            ? 'En directo'
            : busy
              ? 'Conectando'
              : state === 'error'
                ? 'Error de conexión'
                : 'Emisión detenida'}
        </span>
      </div>
      <div className="studio-meta-row">
        {live && (
          <span className="recording-pill">
            <i /> GRABANDO EN SERVIDOR
          </span>
        )}
        <span className="studio-stat">
          <b>{viewers}</b> espectadores
        </span>
        <span className="studio-stat">
          Duración <b>{formatDuration(elapsed)}</b>
        </span>
        {stream && (
          <span className="studio-stat">
            ID <b>{String(stream.id).slice(0, 8)}</b>
          </span>
        )}
      </div>
      <div className="live-studio-grid">
        <div
          className={`publisher-preview ${
            state === 'idle' || state === 'error' ? '' : 'has-stream'
          }`}
        >
          {state === 'idle' || state === 'error' ? (
            <div className="video-empty">
              <Video size={28} />
              <strong>La cámara está apagada</strong>
              <span>
                Al iniciar, el navegador pedirá permiso para cámara y micrófono.
              </span>
            </div>
          ) : null}
          <video ref={preview} autoPlay muted playsInline />
          {live && (
            <span className="live-preview-badge">
              <i /> EMITIENDO
            </span>
          )}
        </div>
        <div className="live-studio-controls">
          <p>
            La señal se publica en MediaMTX por WHIP y se distribuye por HLS. El
            servidor graba el directo y lo guarda en la biblioteca al detener la
            emisión.
          </p>
          <div className="studio-actions">
            <button
              className="button primary"
              onClick={
                live || busy ? () => stopBroadcast() : () => startBroadcast()
              }
              disabled={starting.current}
            >
              {live || busy ? (
                <>
                  <Square size={13} fill="currentColor" /> Detener emisión
                </>
              ) : (
                <>
                  <Radio size={15} /> Iniciar emisión
                </>
              )}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => captureThumbnail()}
              disabled={!live || thumbBusy}
              title="Guardar miniatura del directo"
            >
              <RefreshCw size={14} /> {thumbBusy ? 'Guardando…' : 'Miniatura'}
            </button>
          </div>
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}
          <label className="share-label" htmlFor={`share-${roomId}`}>
            Enlace para espectadores
          </label>
          <div className="share-row">
            <input
              id={`share-${roomId}`}
              readOnly
              value={shareUrl}
              onFocus={(event) => event.target.select()}
            />
            <button
              aria-label="Copiar enlace de espectadores"
              title="Copiar enlace"
              onClick={copyShareLink}
              disabled={!stream}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <small className="share-hint">
            Comparte el enlace mientras la emisión esté activa. Al finalizar, el
            video queda disponible en la sección Directos.
          </small>
          <label className="save-replay-toggle">
            <input
              type="checkbox"
              checked={saveReplay}
              onChange={(event) => setSaveReplay(event.target.checked)}
              disabled={live || busy}
            />
            Guardar repetición al finalizar
          </label>
          <button
            className="button secondary score-link-button"
            type="button"
            onClick={copyScoreLink}
          >
            <Copy size={14} /> Copiar enlace del marcador
          </button>
        </div>
      </div>
    </section>
  )
})

export function CameraPicker({ onStart, onCancel, error, busy = false }) {
  const [cameras, setCameras] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadDevices() {
      try {
        const devices = await Promise.race([
          navigator.mediaDevices?.enumerateDevices() || Promise.resolve([]),
          new Promise((resolve) => window.setTimeout(() => resolve([]), 1800)),
        ])
        if (!mounted) return
        const inputs = (devices || []).filter(
          (device) => device.kind === 'videoinput',
        )
        setCameras(inputs)
        setDeviceId((current) => current || inputs[0]?.deviceId || '')
      } catch {
        if (mounted) setCameras([])
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
    return () => {
      mounted = false
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
    }
  }, [])

  return (
    <div className="modal-shade camera-shade" role="presentation">
      <section
        className="modal camera-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-modal-title"
      >
        <header>
          <div>
            <h2 id="camera-modal-title">Iniciar combate</h2>
            <p>
              Elige la cámara que retransmitirá y permite acceso a cámara y
              micrófono.
            </p>
          </div>
        </header>
        <div className="camera-modal-body">
          <label htmlFor="camera-device-select">Cámara o webcam</label>
          <div className="camera-select-wrap">
            <Camera size={16} />
            <select
              id="camera-device-select"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              disabled={loading || busy}
            >
              <option value="">Cámara predeterminada</option>
              {cameras.map((camera, index) => (
                <option key={camera.deviceId || index} value={camera.deviceId}>
                  {camera.label || `Cámara ${index + 1}`}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <p className="camera-permission-note">
            {loading
              ? 'Buscando cámaras conectadas…'
              : cameras.length
                ? `${cameras.length} cámara${
                    cameras.length === 1 ? '' : 's'
                  } disponible${
                    cameras.length === 1 ? '' : 's'
                  }. El navegador pedirá permiso al iniciar.`
                : 'No se detectó una webcam; se probará la cámara predeterminada del navegador.'}
          </p>
          {error && (
            <p className="studio-error camera-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions camera-modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            className="button primary"
            type="button"
            disabled={loading || busy}
            onClick={() => onStart(deviceId)}
          >
            <Radio size={15} /> {busy ? 'Conectando cámara…' : 'Permitir y empezar'}
          </button>
        </div>
      </section>
    </div>
  )
}

export function LiveViewer({ streamId }) {
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('loading')
  const [score, setScore] = useState(null)
  const [viewers, setViewers] = useState(0)
  const [muted, setMuted] = useState(true)
  const [error, setError] = useState('')
  const [celebratingId, celebrate] = useWinnerCelebration()
  const video = useRef(null)
  const hls = useRef(null)
  const socket = useRef(null)
  const streamRef = useRef(null)
  const lastWinner = useRef(null)
  const viewerId = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  useEffect(() => {
    let cancelled = false
    setStream(null)
    setScore(null)
    setViewers(0)
    setError('')
    setStatus('loading')
    lastWinner.current = null

    function attachHls(data) {
      const element = video.current
      if (!element) return
      if (hls.current) {
        hls.current.destroy()
        hls.current = null
      }
      if (Hls.isSupported()) {
        const instance = new Hls({
          lowLatencyMode: true,
          backBufferLength: 30,
        })
        hls.current = instance
        instance.loadSource(data.hlsUrl)
        instance.attachMedia(element)
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus('live')
          element.play().catch(() => {})
        })
        instance.on(Hls.Events.ERROR, (_event, payload) => {
          if (!payload.fatal) return
          if (payload.type === Hls.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad()
          } else if (payload.type === Hls.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError()
          } else {
            setError('No se pudo reproducir la señal HLS.')
            setStatus('error')
          }
        })
      } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
        element.src = data.hlsUrl
        element.addEventListener(
          'loadedmetadata',
          () => {
            setStatus('live')
            element.play().catch(() => {})
          },
          { once: true },
        )
      } else {
        setError('Este navegador no soporta la reproducción HLS.')
        setStatus('error')
      }
    }

    function openSocket(data) {
      const connection = new WebSocket(socketUrl())
      socket.current = connection
      connection.addEventListener('open', () => {
        send(connection, {
          type: 'viewer',
          roomId: data.path,
          viewerId: viewerId.current,
        })
      })
      connection.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        if (message.type === 'waiting-for-publisher') setStatus('waiting')
        if (message.type === 'publisher-ready') {
          setStatus((current) => (current === 'live' ? current : 'connecting'))
        }
        if (message.type === 'publisher-left') {
          setStatus('ended')
          refreshStream()
        }
        if (message.type === 'score') {
          setScore(message.score)
          const winnerId = message.score?.winnerId
          if (winnerId && winnerId !== lastWinner.current) {
            lastWinner.current = winnerId
            celebrate(winnerId)
          }
        }
        if (message.type === 'viewer-count') setViewers(message.viewers)
      })
    }

    async function refreshStream() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, attempt === 0 ? 1200 : 1600),
        )
        if (cancelled) return
        try {
          const data = await getStream(streamId)
          if (cancelled) return
          streamRef.current = data
          setStream(data)
          if (data.playbackUrl && video.current) {
            if (hls.current) {
              hls.current.destroy()
              hls.current = null
            }
            video.current.src = data.playbackUrl
            video.current.controls = true
            return
          }
          if (data.status !== 'live') return
        } catch {
          return
        }
      }
    }

    async function start() {
      try {
        const data = await getStream(streamId)
        if (cancelled) return
        streamRef.current = data
        setStream(data)
        if (data.status === 'live') {
          setStatus('connecting')
          openSocket(data)
          attachHls(data)
        } else {
          setStatus('ended')
          if (data.playbackUrl && video.current) {
            video.current.src = data.playbackUrl
            video.current.controls = true
          }
        }
      } catch (cause) {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar el directo.',
        )
        setStatus('error')
      }
    }

    start()

    return () => {
      cancelled = true
      send(socket.current, {
        type: 'stop',
        roomId: streamRef.current?.path,
      })
      socket.current?.close()
      socket.current = null
      if (hls.current) {
        hls.current.destroy()
        hls.current = null
      }
      if (video.current) {
        video.current.pause()
        video.current.removeAttribute('src')
        video.current.load?.()
      }
    }
  }, [streamId, celebrate])

  const statusLabel = {
    loading: 'CARGANDO',
    connecting: 'CONECTANDO',
    waiting: 'ESPERANDO EMISIÓN',
    live: 'EN VIVO',
    ended: 'EMISIÓN FINALIZADA',
    error: 'ERROR',
  }[status]

  return (
    <main className="viewer-page">
      <header className="viewer-header">
        <a href={matctrlPath('/')} className="brand">
          <span className="brand-icon">
            <Radio size={18} />
          </span>
          <span>
            MAT<span>CTRL</span>
          </span>
        </a>
        <div className="viewer-header-actions">
          {status === 'live' && (
            <span className="studio-stat">
              <b>{viewers}</b> viendo
            </span>
          )}
          <a
            className="button secondary"
            href={matctrlPath(`/score/${encodeURIComponent(stream?.path || streamId)}`)}
          >
            Marcador
          </a>
          <span className={`connection ${status === 'live' ? 'connected' : ''}`}>
            <i />
            {statusLabel}
          </span>
        </div>
      </header>
      <section className="viewer-content">
        <div className="eyebrow">
          {stream?.title || 'MATCTRL'} <i>·</i>{' '}
          {String(stream?.matId || 'MAT 01').toUpperCase()}
        </div>
        <h1>{stream?.title || 'Retransmisión en vivo'}</h1>
        <div className="viewer-screen">
          <video
            ref={video}
            autoPlay
            playsInline
            muted={muted}
            controls={status === 'ended'}
          />
          <ScoreboardOverlay score={score} celebratingId={celebratingId} />
          {status === 'ended' && !stream?.playbackUrl && (
            <div className="video-empty">
              <Video size={28} />
              <strong>Emisión finalizada</strong>
              <span>La grabación todavía no está disponible.</span>
            </div>
          )}
        </div>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <div className="viewer-controls">
          {status === 'ended' && stream?.playbackUrl && (
            <a className="button primary" href={matctrlPath(`/vod/${stream.id}`)}>
              Ver grabación completa
            </a>
          )}
          {status === 'ended' && !stream?.playbackUrl && (
            <button
              className="button secondary"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => setMuted((value) => !value)}
            disabled={status !== 'live'}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muted ? 'Activar audio' : 'Silenciar'}
          </button>
          <a className="button secondary" href={matctrlPath('/')}>
            Ir a la mesa de control
          </a>
        </div>
        <ScoreboardPanel score={score} celebratingId={celebratingId} />
        <p className="viewer-caption">
          Señal HLS servida por MediaMTX. El servidor graba el directo y lo deja
          disponible en la biblioteca al finalizar.
        </p>
      </section>
    </main>
  )
}
