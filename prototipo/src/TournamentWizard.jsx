import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { Avatar, Modal } from './components/ui.jsx'
import { roundTitle } from './lib/utils.js'

const STEPS = ['Evento', 'Peleadores', 'Siembra', 'Resumen']

export function TournamentWizard({
  tournament,
  initialSelected = [],
  onClose,
  onCreate,
}) {
  const [step, setStep] = useState(0)
  const [eventName, setEventName] = useState(tournament.eventName || '')
  const [selected, setSelected] = useState(initialSelected)
  const [search, setSearch] = useState('')

  const fighters = tournament.fighters || []
  const fighter = (id) => fighters.find((item) => item.id === id)
  const filtered = fighters.filter((item) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return `${item.name} ${item.team} ${item.belt} ${item.weight}`
      .toLowerCase()
      .includes(term)
  })
  const valid = [2, 4, 8].includes(selected.length)
  const rounds = useMemo(() => {
    if (!valid) return []
    return Math.log2(selected.length)
  }, [selected.length, valid])
  const firstRound = useMemo(() => {
    if (!valid) return []
    return Array.from({ length: selected.length / 2 }, (_, index) => [
      selected[index * 2],
      selected[index * 2 + 1],
    ])
  }, [selected, valid])

  function toggleFighter(id) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 8) return current
      return [...current, id]
    })
  }

  function move(index, delta) {
    setSelected((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function next() {
    setStep((current) => Math.min(3, current + 1))
  }

  function back() {
    setStep((current) => Math.max(0, current - 1))
  }

  function submit() {
    if (!valid || !eventName.trim()) return
    onCreate({ eventName: eventName.trim(), selected })
  }

  return (
    <Modal
      title="Crear llave"
      description="Asistente para generar el cuadro de eliminación directa."
      onClose={onClose}
      className="wizard"
    >
      <div className="wizard-steps">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`wizard-step ${index === step ? 'active' : ''} ${
              index < step ? 'done' : ''
            }`}
          >
            <i />
            <span>
              {index + 1}. {label}
            </span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="wizard-body">
          <h3>Datos del evento</h3>
          <p>
            El nombre se mostrará en la mesa de control, en las llaves y en la
            retransmisión.
          </p>
          <label className="wizard-field">
            Nombre del evento
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="Ej. Copa Norte 2026"
              autoFocus
            />
          </label>
          <div className="wizard-preview">
            <div className="wizard-preview-row">
              <span>Torneo actual</span>
              <strong>{tournament.eventName}</strong>
            </div>
            <div className="wizard-preview-row">
              <span>Peleadores registrados</span>
              <strong>{fighters.length}</strong>
            </div>
            <div className="wizard-preview-row">
              <span>Formato</span>
              <strong>Eliminación directa</strong>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="wizard-body">
          <h3>Selecciona participantes</h3>
          <p>
            Elige 2, 4 u 8 peleadores. El orden de selección define la siembra
            inicial y podrás ajustarlo en el siguiente paso.
          </p>
          <div className="wizard-search">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, academia, cinturón o peso"
            />
          </div>
          <strong className="picker-count">
            <UsersRound size={13} /> {selected.length} de 8 seleccionados
          </strong>
          <div className="fighter-picker">
            {filtered.map((item) => {
              const checked = selected.includes(item.id)
              return (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && selected.length >= 8}
                    onChange={() => toggleFighter(item.id)}
                  />
                  <Avatar item={item} />
                  <span>
                    {item.name}
                    <small>
                      {item.team} · {item.belt} · {item.weight}
                    </small>
                  </span>
                </label>
              )
            })}
            {!filtered.length && (
              <p className="empty-state">No hay peleadores que coincidan.</p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h3>Siembra del cuadro</h3>
          <p>
            Ajusta el orden de los clasificados. El primer peleador se cruza con
            el segundo, el tercero con el cuarto, y así sucesivamente.
          </p>
          <div className="seed-list">
            {selected.map((id, index) => {
              const item = fighter(id)
              return (
                <div className="seed-item" key={id}>
                  <b>{index + 1}</b>
                  <Avatar item={item} />
                  <span>
                    {item?.name}
                    <small>{item?.team}</small>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Subir a ${item?.name}`}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Bajar a ${item?.name}`}
                    onClick={() => move(index, 1)}
                    disabled={index === selected.length - 1}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )
            })}
            {!selected.length && (
              <p className="empty-state">Vuelve al paso anterior y elige peleadores.</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h3>Revisa y confirma</h3>
          <p>
            Se crearán {valid ? rounds : 0} ronda
            {valid && rounds === 1 ? '' : 's'} y{' '}
            {valid ? selected.length - 1 : 0} combate
            {valid && selected.length - 1 === 1 ? '' : 's'}.
          </p>
          <div className="wizard-preview">
            <div className="wizard-preview-row">
              <span>Evento</span>
              <strong>{eventName || 'Sin nombre'}</strong>
            </div>
            <div className="wizard-preview-row">
              <span>Participantes</span>
              <strong>{selected.length}</strong>
            </div>
            <div className="wizard-preview-row">
              <span>Rondas</span>
              <strong>{valid ? rounds : 0}</strong>
            </div>
            <div className="wizard-preview-row">
              <span>Estado</span>
              <strong>{valid ? 'Listo para generar' : 'Faltan peleadores'}</strong>
            </div>
          </div>
          {valid && (
            <div className="wizard-preview">
              <div className="wizard-preview-row">
                <span>
                  <Trophy size={13} /> {roundTitle(0, rounds)}
                </span>
                <strong>{firstRound.length} combates</strong>
              </div>
              {firstRound.map(([redId, blueId], index) => (
                <div className="wizard-preview-row" key={`${redId}-${blueId}`}>
                  <span>
                    {fighter(redId)?.name || 'Por definir'} vs{' '}
                    {fighter(blueId)?.name || 'Por definir'}
                  </span>
                  <strong>M{index + 1}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="wizard-footer">
        <button className="button secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <div>
          {step > 0 && (
            <button className="button secondary" type="button" onClick={back}>
              <ArrowLeft size={14} /> Atrás
            </button>
          )}
          {step < 3 ? (
            <button
              className="button primary"
              type="button"
              onClick={next}
              disabled={step === 1 && !valid}
            >
              Siguiente <ArrowRight size={14} />
            </button>
          ) : (
            <button
              className="button primary"
              type="button"
              onClick={submit}
              disabled={!valid || !eventName.trim()}
            >
              <Check size={14} /> Crear llave
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
