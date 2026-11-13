import { useEffect, useState } from 'react'
import { Clapperboard, Eye, Play, RefreshCw } from 'lucide-react'
import { listVods } from './lib/api.js'
import { formatDateTime, formatDuration } from './lib/utils.js'
import { matctrlPath } from './lib/paths.js'
import { EmptyState } from './components/ui.jsx'

export function VodLibraryView() {
  const [vods, setVods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listVods()
      .then((data) => {
        if (!cancelled) setVods(data)
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'No se pudo cargar la biblioteca.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="vod-page">
      <header className="vod-header">
        <a href={matctrlPath('/')} className="brand">
          <span className="brand-icon">
            <Clapperboard size={18} />
          </span>
          <span>
            MAT<span>CTRL</span>
          </span>
        </a>
        <a className="button secondary" href={matctrlPath('/')}>
          Ir a la mesa de control
        </a>
      </header>

      <section className="vod-content">
        <div className="eyebrow">BIBLIOTECA PÚBLICA</div>
        <h1>Repeticiones</h1>

        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <EmptyState
            icon={RefreshCw}
            title="Cargando repeticiones…"
            description="Consultando la biblioteca del servidor."
          />
        ) : vods.length ? (
          <div className="stream-grid">
            {vods.map((vod) => (
              <article className="stream-card" key={vod.id}>
                <a className="stream-thumb" href={matctrlPath(`/vod/${vod.id}`)}>
                  {vod.thumbnailUrl ? (
                    <img src={vod.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="stream-thumb-placeholder">
                      <Clapperboard size={24} />
                      <strong>MATCTRL</strong>
                    </div>
                  )}
                  <span className="duration-badge">
                    {formatDuration(vod.durationSeconds)}
                  </span>
                  <span className="visibility-badge">
                    {vod.visibility === 'unlisted' ? 'oculta' : 'pública'}
                  </span>
                </a>
                <div className="stream-card-body">
                  <span className="stream-card-title">{vod.title}</span>
                  <span className="stream-card-meta">
                    <span>{String(vod.matId || 'mat-01').toUpperCase()}</span>
                    <span>{formatDateTime(vod.startedAt)}</span>
                    <span>
                      <Eye size={10} /> {vod.peakViewers || 0}
                    </span>
                  </span>
                  <div className="stream-card-actions">
                    <a className="button primary" href={matctrlPath(`/vod/${vod.id}`)}>
                      <Play size={12} /> Reproducir
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clapperboard}
            title="Todavía no hay repeticiones públicas"
            description="Cuando un directo termine y se guarde como repetición, aparecerá aquí."
          />
        )}
      </section>
    </main>
  )
}
