import { useEffect, useRef, useState } from 'react'
import { Activity, Copy, Maximize2, Radio } from 'lucide-react'
import { getRoomScore, getStream, socketUrl } from './lib/api.js'
import { formatClock } from './lib/utils.js'
import { matctrlPath } from './lib/paths.js'

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function PublicSide({ side, data }) {
  return (
    <div className={`public-score-side ${side}`}>
      <span className="public-score-tag">{side === 'red' ? 'ROJO' : 'AZUL'}</span>
      <strong>{data?.name || 'Por definir'}</strong>
      <small>{data?.team || data?.belt || '—'}</small>
      <b>{data?.points || 0}</b>
      <div className="public-score-minor">
        <span>
          <b>{data?.advantages || 0}</b> ventajas
        </span>
        <span>
          <b>{data?.penalties || 0}</b> penal.
        </span>
      </div>
    </div>
  )
}

export function ScoreViewer({ roomId }) {
  const [room, setRoom] = useState(roomId)
  const [score, setScore] = useState(null)
  const [status, setStatus] = useState('loading')
  const [viewers, setViewers] = useState(0)
  const [copied, setCopied] = useState(false)
  const viewerId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    let cancelled = false
    getStream(roomId)
      .then((data) => {
        if (cancelled) return
        if (data?.path) setRoom(data.path)
        if (data?.finalScore) setScore(data.finalScore)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [roomId])

  useEffect(() => {
    if (!room) return undefined
    let socket = null
    let retry = null
    let closed = false

    function connect() {
      socket = new WebSocket(socketUrl())
      socket.addEventListener('open', () => {
        setStatus('connecting')
        send(socket, {
          type: 'viewer',
          roomId: room,
          viewerId: viewerId.current,
        })
      })
      socket.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        if (message.type === 'score') {
          setScore(message.score)
          setStatus('live')
        }
        if (message.type === 'publisher-ready') setStatus('live')
        if (message.type === 'waiting-for-publisher') setStatus('waiting')
        if (message.type === 'publisher-left') setStatus('ended')
        if (message.type === 'viewer-count') setViewers(message.viewers || 0)
      })
      socket.addEventListener('close', () => {
        if (closed) return
        setStatus('reconnecting')
        retry = window.setTimeout(connect, 2000)
      })
    }

    connect()

    const poll = window.setInterval(() => {
      getRoomScore(room)
        .then((data) => {
          if (data?.score) setScore(data.score)
          if (data?.viewers !== undefined) setViewers(data.viewers)
          if (data?.live) setStatus((current) => (current === 'loading' ? 'live' : current))
        })
        .catch(() => {})
    }, 5000)

    return () => {
      closed = true
      window.clearTimeout(retry)
      window.clearInterval(poll)
      socket?.close()
    }
  }, [room])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copia el enlace del marcador:', window.location.href)
    }
  }

  const label = {
    loading: 'CARGANDO',
    connecting: 'CONECTANDO',
    waiting: 'ESPERANDO SEÑAL',
    live: 'EN VIVO',
    ended: 'DIRECTO FINALIZADO',
    reconnecting: 'RECONECTANDO',
  }[status]

  return (
    <main className="score-page">
      <header className="score-page-header">
        <a href={matctrlPath('/')} className="brand">
          <span className="brand-icon">
            <Activity size={18} />
          </span>
          <span>
            MAT<span>CTRL</span>
          </span>
        </a>
        <div className="score-page-actions">
          <span className={`connection ${status === 'live' ? 'connected' : ''}`}>
            <i />
            {label}
          </span>
          {status === 'live' && (
            <span className="studio-stat">
              <b>{viewers}</b> viendo
            </span>
          )}
          <button className="button secondary" onClick={copyLink} type="button">
            <Copy size={14} />
            {copied ? 'Copiado' : 'Compartir'}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 size={14} /> Pantalla completa
          </button>
        </div>
      </header>

      {score ? (
        <section className="public-score">
          <div className="public-score-head">
            <span>
              <Radio size={13} /> {score.eventName || 'MATCTRL'}
            </span>
            <span>{score.roundLabel || 'MAT 01'}</span>
            <span>{score.status === 'completed' ? 'FINAL' : 'MARCADOR EN VIVO'}</span>
          </div>
          <div className="public-score-grid">
            <PublicSide side="red" data={score.red} />
            <div className="public-score-clock">
              <strong>{formatClock(score.remaining)}</strong>
              <span>{score.running ? 'EN COMBATE' : 'EN PAUSA'}</span>
            </div>
            <PublicSide side="blue" data={score.blue} />
          </div>
          {score.winnerId && (
            <div className="public-score-winner">
              Ganador:{' '}
              {score.winnerId === score.red?.id ? score.red?.name : score.blue?.name}
            </div>
          )}
        </section>
      ) : (
        <section className="public-score public-score-empty">
          <Activity size={30} />
          <strong>Esperando marcador</strong>
          <span>
            La mesa de control enviará el puntaje en cuanto inicie el combate.
          </span>
          <a className="button secondary" href={matctrlPath(`/live/${encodeURIComponent(roomId)}`)}>
            Ver directo
          </a>
        </section>
      )}
    </main>
  )
}
