import { createHmac, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

export async function authenticateToken(token) {
  if (!token || !process.env.JWT_SECRET) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  let header
  let payload
  try {
    header = decodeSegment(parts[0])
    payload = decodeSegment(parts[1])
  } catch {
    return null
  }
  if (header.alg !== 'HS256' || !payload.uid) return null
  if (payload.exp && Date.now() >= Number(payload.exp) * 1000) return null

  const expected = createHmac('sha256', process.env.JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest()
  const actual = Buffer.from(parts[2], 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null
  }

  const result = await query(
    `SELECT id, nombre, email, rol, estado
       FROM usuarios
      WHERE id = $1 AND estado = 'activo'`,
    [payload.uid],
  )
  return result.rows[0] || null
}

export async function requireAuth(request, response, next) {
  try {
    const header = request.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const user = await authenticateToken(token)
    if (!user) {
      return response.status(401).json({ error: 'Inicia sesión para continuar.' })
    }
    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}
