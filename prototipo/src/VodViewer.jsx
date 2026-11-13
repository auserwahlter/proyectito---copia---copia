import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Clapperboard,
  Clock3,
  Copy,
  Download,
  Radio,
  RefreshCw,
  Video,
} from 'lucide-react'
import { getStream } from './lib/api.js'
import { formatDateTime, formatDuration } from './lib/utils.js'
import { matctrlPath } from './lib/paths.js'
import { ScoreboardPanel } from './components/Scoreboard.jsx'

export function VodViewer({ streamId }) {
  const [stream, setStream] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getStream(streamId)
      .then((data) => {
        if (cancelled) return
        setStream(data)
        setError('')
      })
      .catch((cause) => {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar la grabación.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [streamId])

  return (
    <main className="vod-page">
      <header className="vod-header">
        <a href={matctrlPath('/')} className="brand">
          <span className="brand-icon">
            <Radio size={18} />
          </span>
          <span>
            MAT<span>CTRL</span>
          </span>
        </a>
        <a className="button secondary" href={matctrlPath('/vods')}>
          <ArrowLeft size={14} /> Biblioteca
        </a>
      </header>

      <section className="vod-content">
        {loading && (
          <div className="vod-empty">
            <RefreshCw size={26} />
            <strong>Cargando grabación…</strong>
          </div>
        )}

        {!loading && error && (
          <div className="vod-empty">
            <Video size={26} />
            <strong>No se pudo abrir la grabación</strong>
            <span>{error}</span>
            <a className="button secondary" href={matctrlPath('/vods')}>
              Volver a la biblioteca
            </a>
          </div>
        )}

        {!loading && !error && stream && (
          <>
            <div className="eyebrow">
              BIBLIOTECA <i>·</i> {String(stream.matId || 'MAT 01').toUpperCase()}
            </div>
            <h1>{stream.title}</h1>
            {stream.description && (
              <p className="viewer-caption">{stream.description}</p>
            )}
            {stream.playbackUrl ? (
              <div className="vod-player">
                <video
                  src={stream.playbackUrl}
                  controls
                  autoPlay
                  playsInline
                />
              </div>
            ) : (
              <div className="vod-empty">
                <Clapperboard size={26} />
                <strong>Grabación no disponible</strong>
                <span>
                  MediaMTX no generó un archivo reproducible para este directo.
                </span>
              </div>
            )}
            <div className="vod-meta">
              <span>
                <Clock3 size={13} /> {formatDuration(stream.durationSeconds)}
              </span>
              <span>{formatDateTime(stream.startedAt)}</span>
              <span>{stream.peakViewers || 0} espectadores máximos</span>
              <span>Estado: {stream.status}</span>
            </div>
            <div className="vod-actions">
              {stream.playbackUrl && (
                <a
                  className="button secondary"
                  href={stream.playbackUrl}
                  download
                >
                  <Download size={14} /> Descargar MP4
                </a>
              )}
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  if (!navigator.clipboard) {
                    window.prompt('Copia el enlace:', window.location.href)
                    return
                  }
                  navigator.clipboard
                    .writeText(window.location.href)
                    .catch(() =>
                      window.prompt('Copia el enlace:', window.location.href),
                    )
                }}
              >
                <Copy size={14} /> Compartir
              </button>
              <a className="button secondary" href={matctrlPath('/vods')}>
                <ArrowLeft size={14} /> Volver a la biblioteca
              </a>
            </div>
            {stream.finalScore && (
              <ScoreboardPanel score={stream.finalScore} />
            )}
            <p className="viewer-caption">
              La grabación se sirve desde el servidor de reproducción de
              MediaMTX. La descarga depende del navegador y del tamaño del
              archivo.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
