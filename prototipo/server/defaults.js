export const defaultSettings = {
  durations: { Blanca: 5, Azul: 6, Púrpura: 7, Marrón: 8, Negra: 10 },
  scoring: [
    ['Derribo', 2],
    ['Barrido', 2],
    ['Rodilla al vientre', 2],
    ['Pase de guardia', 3],
    ['Montada', 4],
    ['Control de espalda', 4],
  ],
  autoSaveStreams: true,
}

export const defaultOperator = {
  name: 'Alex López',
  role: 'Árbitro principal',
}

export const blankScore = () => ({
  points: 0,
  advantages: 0,
  penalties: 0,
})

export function mergeSettings(settings = {}) {
  return {
    ...defaultSettings,
    ...settings,
    durations: { ...defaultSettings.durations, ...(settings.durations || {}) },
    scoring:
      Array.isArray(settings.scoring) && settings.scoring.length
        ? settings.scoring
        : defaultSettings.scoring,
  }
}
