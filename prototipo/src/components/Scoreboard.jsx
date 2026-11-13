import { Avatar } from './ui.jsx'
import { formatClock } from '../lib/utils.js'

function OverlaySide({ side, data, celebrating }) {
  return (
    <div
      className={`scoreboard-side ${side} ${
        celebrating ? 'winner-celebrating' : ''
      }`}
    >
      <Avatar item={data} />
      <div className="scoreboard-side-info">
        <strong>{data.name}</strong>
        <small>{data.team || data.belt || '—'}</small>
      </div>
      <b className="scoreboard-side-points">{data.points}</b>
    </div>
  )
}

export function ScoreboardOverlay({ score, celebratingId }) {
  if (!score) return null
  return (
    <>
      <div className="scoreboard-event">
        <i />
        {score.eventName} · {score.roundLabel || 'MAT 01'}
      </div>
      <div className="scoreboard-overlay" aria-live="polite">
        <OverlaySide
          side="red"
          data={score.red}
          celebrating={celebratingId === score.red?.id}
        />
        <div className="scoreboard-clock">
          <strong>{formatClock(score.remaining)}</strong>
          <small>{score.running ? 'EN COMBATE' : 'DETENIDO'}</small>
        </div>
        <OverlaySide
          side="blue"
          data={score.blue}
          celebrating={celebratingId === score.blue?.id}
        />
      </div>
    </>
  )
}

function PanelSide({ side, data, celebrating }) {
  return (
    <div
      className={`scoreboard-panel-side ${side} ${
        celebrating ? 'winner-celebrating' : ''
      }`}
    >
      <strong>{data.name}</strong>
      <small>{data.team || data.belt || '—'}</small>
      <b>{data.points}</b>
    </div>
  )
}

export function ScoreboardPanel({ score, celebratingId }) {
  if (!score) {
    return (
      <div className="scoreboard-panel">
        <div className="scoreboard-panel-head">
          <span>MARCADOR EN VIVO</span>
          <span>SIN DATOS</span>
        </div>
        <p className="viewer-caption">
          El marcador aparecerá cuando la mesa de control inicie el combate.
        </p>
      </div>
    )
  }

  return (
    <div className="scoreboard-panel">
      <div className="scoreboard-panel-head">
        <span>MARCADOR EN VIVO</span>
        <span>{score.eventName}</span>
      </div>
      <div className="scoreboard-panel-grid">
        <PanelSide
          side="red"
          data={score.red}
          celebrating={celebratingId === score.red?.id}
        />
        <div className="scoreboard-panel-clock">
          <strong>{formatClock(score.remaining)}</strong>
          <span>{score.running ? 'EN COMBATE' : 'EN PAUSA'}</span>
        </div>
        <PanelSide
          side="blue"
          data={score.blue}
          celebrating={celebratingId === score.blue?.id}
        />
      </div>
      <div className="scoreboard-tiebreak">
        <span>Ventajas</span>
        <span>
          <b>{score.red?.advantages || 0}</b> ·{' '}
          <b>{score.blue?.advantages || 0}</b>
        </span>
      </div>
      <div className="scoreboard-tiebreak">
        <span>Penalizaciones</span>
        <span>
          <b>{score.red?.penalties || 0}</b> ·{' '}
          <b>{score.blue?.penalties || 0}</b>
        </span>
      </div>
    </div>
  )
}
