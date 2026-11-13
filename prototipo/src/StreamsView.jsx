import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clapperboard,
  Copy,
  Eye,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Save,
  Trash2,
  Video,
} from 'lucide-react'
import {
  deleteStream,
  listFeedStreams,
  listStreams,
  listUserStreams,
  publishStream,
  saveStream,
  updateStream,
} from './lib/api.js'
import { formatDateTime, formatDuration } from './lib/utils.js'
import { matctrlPath } from './lib/paths.js'
import {
  ActionMenu,
  ConfirmDialog,
  EmptyState,
  Modal,
} from './components/ui.jsx'

const TABS = [
  ['live', 'En vivo'],
  ['saved', 'Grabaciones'],
  ['ended', 'No guardados'],
  ['all', 'Todos'],
]

export function StreamsView({ onToast, creator }) {
  let sessionUser = null
  try {
    sessionUser = JSON.parse(
      localStorage.getItem('le_user') ||
        localStorage.getItem('lutaedanca_user') ||
        'null',
    )
  } catch {
    sessionUser = null
  }
  const activeCreator = creator || {
    id: String(sessionUser?.id || ''),
    name: sessionUser?.nombre || '',
  }
  const [streams, setStreams] = useState([])
  const [feed, setFeed] = useState([])
  const [tab, setTab] = useState('live')
  const [feedMode, setFeedMode] = useState('global')
  const [loading, setLoading] = useState(true)
  const [feedLoading, setFeedLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listStreams({ creatorId: feedMode === 'mine' ? activeCreator.id : undefined })
      .then((data) => {
        if (cancelled) return
        setStreams(data)
        setError('')
      })
      .catch((cause) => {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar la biblioteca.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, feedMode, activeCreator.id])

  useEffect(() => {
    let cancelled = false
    setFeedLoading(true)
    const request = feedMode === 'mine'
      ? listUserStreams(activeCreator.id)
      : listFeedStreams()
    request
      .then((data) => {
        if (cancelled) return
        setFeed(data.slice(0, 6))
      })
      .catch(() => {
        if (!cancelled) setFeed([])
      })
      .finally(() => {
        if (!cancelled) setFeedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeCreator.id, feedMode, refreshKey])

  const counts = useMemo(
    () => ({
      live: streams.filter((item) => item.status === 'live').length,
      saved: streams.filter((item) => item.status === 'saved').length,
      ended: streams.filter((item) => item.status === 'ended').length,
      all: streams.length,
    }),
    [streams],
  )

  const filtered =
    tab === 'all' ? streams : streams.filter((item) => item.status === tab)

  async function copyLink(stream) {
    const url = `${window.location.origin}${matctrlPath(`/live/${stream.id}`)}`
    try {
      await navigator.clipboard.writeText(url)
      onToast?.({
        tone: 'success',
        title: 'Enlace copiado',
        message: 'Compártelo con los espectadores.',
      })
    } catch {
      window.prompt('Copia el enlace:', url)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteStream(pendingDelete.id)
      setPendingDelete(null)
      setRefreshKey((value) => value + 1)
      onToast?.({
        tone: 'success',
        title: 'Directo eliminado',
        message: 'Se borraron los metadatos y la grabación del servidor.',
      })
    } catch (cause) {
      onToast?.({
        tone: 'error',
        title: 'No se pudo eliminar',
        message: cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      })
    } finally {
      setDeleting(false)
    }
  }

  async function toggleSaved(stream) {
    try {
      await saveStream(stream.id)
      setRefreshKey((value) => value + 1)
      onToast?.({
        tone: 'success',
        title: 'Repetición guardada',
        message: 'El directo ya está disponible en la biblioteca.',
      })
    } catch (cause) {
      onToast?.({
        tone: 'error',
        title: 'No se pudo guardar',
        message: cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      })
    }
  }

  async function toggleVisibility(stream) {
    const next = stream.visibility === 'public' ? 'private' : 'public'
    try {
      await publishStream(stream.id, next)
      setRefreshKey((value) => value + 1)
      onToast?.({
        tone: 'success',
        title: next === 'public' ? 'Repetición publicada' : 'Repetición oculta',
        message: stream.title,
      })
    } catch (cause) {
      onToast?.({
        tone: 'error',
        title: 'No se pudo cambiar la visibilidad',
        message: cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      })
    }
  }

  async function saveDetails(event) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await updateStream(editing.id, {
        title: String(form.get('title') || '').trim() || editing.title,
        description: String(form.get('description') || '').trim(),
        visibility: String(form.get('visibility') || 'public'),
      })
      setEditing(null)
      setRefreshKey((value) => value + 1)
      onToast?.({
        tone: 'success',
        title: 'Detalles guardados',
        message: 'La repetición se actualizó correctamente.',
      })
    } catch (cause) {
      onToast?.({
        tone: 'error',
        title: 'No se pudo guardar',
        message: cause instanceof Error ? cause.message : 'Intenta de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  const emptyCopy = {
    live: [
      'No hay emisiones activas',
      'Inicia una cámara desde la mesa de control para publicar un directo.',
    ],
    saved: [
      'Todavía no hay grabaciones',
      'Cuando termines un directo, MediaMTX guardará el video y aparecerá aquí.',
    ],
    ended: [
      'No hay directos sin guardar',
      'Los directos que cerraste sin guardar repetición aparecen aquí.',
    ],
    all: [
      'La biblioteca está vacía',
      'Los directos y sus grabaciones se guardarán automáticamente.',
    ],
  }[tab]

  return (
    <>
      <div className="stream-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={`stream-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            <small>{counts[id]}</small>
          </button>
        ))}
        <button
          className="stream-tab"
          onClick={() => setRefreshKey((value) => value + 1)}
          title="Actualizar biblioteca"
        >
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      <div className="stream-feed-bar">
        <div className="feed-toggle">
          <button
            type="button"
            className={feedMode === 'global' ? 'active' : ''}
            onClick={() => setFeedMode('global')}
          >
            Feed global
          </button>
          <button
            type="button"
            className={feedMode === 'mine' ? 'active' : ''}
            onClick={() => setFeedMode('mine')}
          >
            Mi feed
          </button>
        </div>
        <span className="stream-creator-label">
          Cuenta: <strong>{activeCreator.name || 'Usuario'}</strong>
        </span>
      </div>

      {feedLoading ? (
        <div className="feed-preview empty-state">Cargando feed…</div>
      ) : feed.length ? (
        <div className="feed-preview">
          {feed.map((stream) => (
            <article className="feed-card" key={stream.id}>
              <div className="feed-card-top">
                <strong>{stream.creatorName || 'Usuario general'}</strong>
                <span>{stream.status === 'live' ? 'EN VIVO' : 'VOD'}</span>
              </div>
              <h3>{stream.title}</h3>
              <p>{stream.description || 'Directo creado con la lógica activa del torneo.'}</p>
              <div className="feed-card-actions">
                <a href={matctrlPath(stream.status === 'live' ? `/live/${stream.id}` : `/vod/${stream.id}`)}>
                  {stream.status === 'live' ? 'Ver directo' : 'Reproducir'}
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <EmptyState
          icon={RefreshCw}
          title="Cargando biblioteca…"
          description="Consultando directos y grabaciones del servidor."
        />
      ) : filtered.length ? (
        <div className="stream-grid">
          {filtered.map((stream) => (
            <article className="stream-card" key={stream.id}>
              <div className="stream-thumb">
                {stream.thumbnailUrl ? (
                  <img src={stream.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="stream-thumb-placeholder">
                    <Clapperboard size={24} />
                    <strong>MATCTRL</strong>
                  </div>
                )}
                {stream.status === 'live' && (
                  <span className="live-badge">
                    <i /> EN VIVO
                  </span>
                )}
                {stream.status === 'saved' && (
                  <span className="duration-badge">
                    {formatDuration(stream.durationSeconds)}
                  </span>
                )}
                {stream.status !== 'live' && (
                  <span className="visibility-badge">
                    {!stream.isSaved
                      ? 'sin guardar'
                      : stream.visibility === 'unlisted'
                        ? 'oculta'
                        : stream.visibility === 'private'
                          ? 'privada'
                          : 'pública'}
                  </span>
                )}
                {stream.status === 'live' && (
                  <span className="viewer-badge">
                    <Eye size={10} /> {stream.viewers || 0}
                  </span>
                )}
              </div>
              <div className="stream-card-body">
                <span className="stream-card-title">{stream.title}</span>
                <span className="stream-card-meta">
                  <span>{String(stream.matId || 'mat-01').toUpperCase()}</span>
                  <span>{formatDateTime(stream.startedAt)}</span>
                </span>
                <div className="stream-card-actions">
                  {stream.status === 'live' ? (
                    <a className="button primary" href={matctrlPath(`/live/${stream.id}`)}>
                      <Radio size={12} /> Ver en vivo
                    </a>
                  ) : stream.playbackUrl ? (
                    <a className="button primary" href={matctrlPath(`/vod/${stream.id}`)}>
                      <Play size={12} /> Reproducir
                    </a>
                  ) : (
                    <button className="button secondary" disabled>
                      <Video size={12} /> Sin grabación
                    </button>
                  )}
                  <ActionMenu
                    label={`Opciones de ${stream.title}`}
                    items={[
                      stream.status === 'live' && {
                        label: 'Copiar enlace',
                        icon: Copy,
                        onClick: () => copyLink(stream),
                      },
                      stream.status === 'live' && {
                        label: 'Abrir en vivo',
                        icon: Radio,
                        onClick: () => {
                          window.location.href = matctrlPath(`/live/${stream.id}`)
                        },
                      },
                      stream.status === 'live' && {
                        label: 'Abrir marcador público',
                        icon: Activity,
                        onClick: () => {
                          window.open(
                            matctrlPath(`/score/${encodeURIComponent(stream.path)}`),
                            '_blank',
                          )
                        },
                      },
                      stream.playbackUrl && {
                        label: 'Abrir grabación',
                        icon: Play,
                        onClick: () => {
                          window.location.href = matctrlPath(`/vod/${stream.id}`)
                        },
                      },
                      stream.playbackUrl &&
                        !stream.isSaved && {
                          label: 'Guardar repetición',
                          icon: Save,
                          onClick: () => toggleSaved(stream),
                        },
                      stream.status === 'saved' && {
                        label:
                          stream.visibility === 'public'
                            ? 'Ocultar de la biblioteca'
                            : 'Publicar repetición',
                        icon: Eye,
                        onClick: () => toggleVisibility(stream),
                      },
                      stream.status !== 'live' && {
                        label: 'Editar detalles',
                        icon: Pencil,
                        onClick: () => setEditing(stream),
                      },
                      { separator: true },
                      {
                        label: 'Eliminar directo',
                        icon: Trash2,
                        danger: true,
                        onClick: () => setPendingDelete(stream),
                      },
                    ]}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === 'live' ? Radio : Clapperboard}
          title={emptyCopy[0]}
          description={emptyCopy[1]}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Eliminar directo"
          description={`Se borrarán los metadatos y la grabación de "${pendingDelete.title}". Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {editing && (
        <Modal
          title="Editar repetición"
          description="Cambia el título, la descripción y la visibilidad del VOD."
          onClose={() => setEditing(null)}
        >
          <form className="modal-form stream-edit-form" onSubmit={saveDetails}>
            <label>
              Título
              <input name="title" required defaultValue={editing.title} />
            </label>
            <label>
              Descripción
              <textarea
                name="description"
                defaultValue={editing.description || ''}
                placeholder="Describe el combate o evento"
              />
            </label>
            <label>
              Visibilidad
              <select name="visibility" defaultValue={editing.visibility || 'public'}>
                <option value="public">Pública</option>
                <option value="unlisted">Oculta (con enlace)</option>
                <option value="private">Privada</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="button primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
