export const MATCTRL_BASE_PATH = '/matctrl'

export function matctrlPath(path = '') {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${MATCTRL_BASE_PATH}${suffix === '/' ? '/' : suffix}`
}

export function matctrlRoutePath() {
  const pathname = window.location.pathname
  if (!pathname.startsWith(MATCTRL_BASE_PATH)) return '/'
  return pathname.slice(MATCTRL_BASE_PATH.length) || '/'
}
