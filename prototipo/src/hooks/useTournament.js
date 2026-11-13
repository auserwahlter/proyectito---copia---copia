import { useEffect, useRef, useState } from 'react'
import { getTournament, saveTournament } from '../lib/api.js'

export const DEFAULT_DURATIONS = {
  Blanca: 5,
  Azul: 6,
  Púrpura: 7,
  Marrón: 8,
  Negra: 10,
}

export function emptyTournament(operatorName = '') {
  return {
    id: null,
    eventName: '',
    date: '',
    location: '',
    matCount: 1,
    status: 'active',
    playbackUrl: '',
    operator: {
      name: operatorName,
      role: 'Árbitro principal',
    },
    settings: { durations: DEFAULT_DURATIONS },
    fighters: [],
    bouts: [],
  }
}

export function useTournament(operatorName = '') {
  const [tournament, setTournament] = useState(() => emptyTournament(operatorName))
  const [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('connecting')
  const tournamentVersion = useRef(0)

  useEffect(() => {
    getTournament()
      .then((data) => {
        if (tournamentVersion.current === 0) setTournament(data)
        setSaveStatus('saved')
      })
      .catch((error) => {
        if (error?.status === 404) {
          if (tournamentVersion.current === 0) {
            setTournament(emptyTournament(operatorName))
          }
          setSaveStatus('saved')
        } else {
          setSaveStatus('offline')
        }
      })
      .finally(() => setLoaded(true))
  }, [operatorName])

  useEffect(() => {
    if (!loaded || (!tournament.id && !tournament.eventName.trim())) return undefined
    const timer = window.setTimeout(async () => {
      const version = tournamentVersion.current
      setSaveStatus('saving')
      try {
        const saved = await saveTournament(tournament)
        if (tournamentVersion.current === version) {
          tournamentVersion.current += 1
          setTournament(saved)
        }
        setSaveStatus('saved')
      } catch {
        setSaveStatus('offline')
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [loaded, tournament])

  function updateTournament(next) {
    tournamentVersion.current += 1
    setTournament(next)
  }

  return [tournament, updateTournament, loaded, saveStatus]
}
