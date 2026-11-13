const express = require('express');
const pool = require('./db');

const { requireAuth } = require('./acceso');
const { mapaColumnas } = require('./columnas');

const router = express.Router();

const FEED_LIMIT_MAX = 50;

const COLS_IMAGEN = ["'imagen' AS tipo", 'id', 'autor_id', 'titulo', 'tipo AS subtipo', 'descripcion', 'hashtags', 'filepath', 'vistas', 'creado_en', 'monetizado', 'precio', 'tipo_venta'];
const COLS_INST = ["'instruccional' AS tipo", 'id', 'autor_id', 'titulo', 'descripcion', 'nivel', 'categoria', 'videos_ids', 'vistas', 'creado_en', 'monetizado', 'precio', 'tipo_venta'];

function clampLimit(val, def = 20) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return def;
  return Math.min(n, FEED_LIMIT_MAX);
}

function buildWhere(tipo, q, cat, tag, porTipo) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (q && q.trim()) {
    conditions.push(`titulo ILIKE $${idx++}`);
    values.push(`%${q.trim()}%`);
  }

  if (cat && cat.trim() && porTipo[tipo].categoria) {
    conditions.push(`categoria = $${idx++}`);
    values.push(cat.trim());
  }

  if (tag && tag.trim() && porTipo[tipo].hashtags) {
    conditions.push(`$${idx++} = ANY(hashtags)`);
    values.push(tag.trim());
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

function colImagen(m) {
  const cols = [...COLS_IMAGEN];
  const t = m.get('prof_imagenes');
  if (t && t.get('categoria')) cols.splice(6, 0, 'categoria');
  return cols.join(', ');
}

function colInst(m) {
  const cols = [...COLS_INST];
  const t = m.get('prof_instruccionales');
  if (t && t.get('portada_path')) cols.splice(8, 0, 'portada_path');
  return cols.join(', ');
}

async function columnas() {
  const m = await mapaColumnas();
  const porTipo = {
    video: { categoria: false, hashtags: !!(m.get('prof_videos') || new Map()).get('hashtags') },
    imagen: { categoria: false, hashtags: !!(m.get('prof_imagenes') || new Map()).get('hashtags') },
    instruccional: { categoria: false, hashtags: false },
    diagrama: { categoria: false, hashtags: false },
  };
  return { m, porTipo };
}

function mediaDe(filepath) {
  if (!filepath) return null;
  let p = String(filepath).replace(/\\/g, '/');
  const m = p.match(/(?:^|.*?\/)uploads\/(.*)$/i);
  if (m) p = m[1];
  return '/media/' + p.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '');
}

function decorarMedia(items) {
  for (const item of items) {
    const origen = item.portada_path || item.filepath;
    item.mediaPath = origen ? mediaDe(origen) : null;
    if (item.tipo === 'video') {
      const base = (item.mediaPath || '').split('/').pop().replace(/\.[^.]+$/, '');
      item.thumbPath = base ? `/media/thumbs/${base}.jpg` : null;
    }
    if (process.env.LOG_FEED === '1') console.log(`[feed] #${item.id} ${item.tipo} filepath='${item.filepath || item.portada_path || ''}' -> mediaPath=${item.mediaPath} thumbPath=${item.thumbPath || '-'}`);
  }
  return items;
}

router.get('/', async (req, res, next) => {
  try {
    const { q, cat, tag } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = clampLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const { m, porTipo } = await columnas();
    const qVideo = buildWhere('video', q, cat, tag, porTipo);
    const qImagen = buildWhere('imagen', q, cat, tag, porTipo);
    const qInst = buildWhere('instruccional', q, cat, tag, porTipo);
    const qDiag = buildWhere('diagrama', q, cat, tag, porTipo);

    const [vRes, iRes, insRes, dRes] = await Promise.all([
      pool.query(
        `SELECT 'video' AS tipo, id, autor_id, titulo, categoria, dificultad, descripcion,
                hashtags, filepath, portada_path, vistas, creado_en, monetizado, precio, tipo_venta
           FROM prof_videos ${qVideo.sql} ORDER BY creado_en DESC`,
        qVideo.values
      ),
      pool.query(
        `SELECT ${colImagen(m)}
           FROM prof_imagenes ${qImagen.sql} ORDER BY creado_en DESC`,
        qImagen.values
      ),
      pool.query(
        `SELECT ${colInst(m)}
           FROM prof_instruccionales ${qInst.sql} ORDER BY creado_en DESC`,
        qInst.values
      ),
      pool.query(
        `SELECT 'diagrama' AS tipo, id, autor_id, titulo, descripcion, tipo AS subtipo,
                vistas, creado_en, monetizado, precio, tipo_venta
           FROM prof_diagramas ${qDiag.sql} ORDER BY creado_en DESC`,
        qDiag.values
      ),
    ]);

    let streamItems = [];
    if (!tag) {
      const { rows: streamTable } = await pool.query(
        "SELECT to_regclass('public.streams') AS table_name"
      );
      if (streamTable[0]?.table_name) {
        const streamValues = [];
        const streamConditions = [
          "((status = 'live') OR (status = 'saved' AND visibility = 'public' AND is_saved = true))",
        ];
        if (q && String(q).trim()) {
          streamValues.push(`%${String(q).trim()}%`);
          streamConditions.push(`title ILIKE $${streamValues.length}`);
        }
        const { rows } = await pool.query(
          `SELECT 'directo' AS tipo, id, creator_id AS autor_id, title AS titulo,
                  creator_name AS autor_nombre, started_at AS creado_en,
                  peak_viewers AS vistas, description AS descripcion,
                  status AS stream_status, visibility,
                  '/matctrl/api/streams/' || id || '/thumbnail' AS thumbnail_url
             FROM streams
            WHERE ${streamConditions.join(' AND ')}
            ORDER BY started_at DESC
            LIMIT 200`,
          streamValues
        );
        streamItems = rows.map((item) => ({
          ...item,
          id: String(item.id),
          monetizado: false,
          tipo_venta: 'gratis',
        }));
      }
    }

    let items = [...vRes.rows, ...iRes.rows, ...insRes.rows, ...dRes.rows, ...streamItems];
    items.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    const total = items.length;
    items = items.slice(offset, offset + limit);

    if (items.length) {
      const uniqueIds = [...new Set(items.filter(i => i.tipo !== 'directo').map(i => i.autor_id))];
      if (uniqueIds.length) {
      const autoresRes = await pool.query(
        `SELECT id, nombre FROM usuarios WHERE id = ANY($1)`,
        [uniqueIds]
      );
      const autoresMap = Object.fromEntries(autoresRes.rows.map(u => [u.id, u.nombre]));
      items.forEach(item => {
        if (item.tipo !== 'directo') item.autor_nombre = autoresMap[item.autor_id] || null;
      });
      }
    }

    decorarMedia(items);

    res.json({
      success: true,
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/feed/siguiendo — contenido de los creadores que sigo
router.get('/siguiendo', requireAuth, async (req, res, next) => {
  try {
    const { q, cat, tag } = req.query;
    const limit = clampLimit(req.query.limit);
    const seguidorId = req.usuario.id;

    const { m, porTipo } = await columnas();
    const qVideo = buildWhere('video', q, cat, tag, porTipo);
    const qImagen = buildWhere('imagen', q, cat, tag, porTipo);
    const qInst = buildWhere('instruccional', q, cat, tag, porTipo);

    const andSeguidor = (filtro) =>
      `${filtro ? filtro + ' AND ' : 'WHERE '}autor_id IN (SELECT seguido_id FROM seguimientos WHERE seguidor_id = '${seguidorId}')`;

    const [vRes, iRes, insRes] = await Promise.all([
      pool.query(
        `SELECT 'video' AS tipo, id, autor_id, titulo, categoria, dificultad, descripcion,
                hashtags, filepath, portada_path, vistas, creado_en, monetizado, precio, tipo_venta
           FROM prof_videos ${andSeguidor(qVideo.sql)} ORDER BY creado_en DESC LIMIT ${limit}`,
        qVideo.values
      ),
      pool.query(
        `SELECT ${colImagen(m)}
           FROM prof_imagenes ${andSeguidor(qImagen.sql)} ORDER BY creado_en DESC LIMIT ${limit}`,
        qImagen.values
      ),
      pool.query(
        `SELECT ${colInst(m)}
           FROM prof_instruccionales ${andSeguidor(qInst.sql)} ORDER BY creado_en DESC LIMIT ${limit}`,
        qInst.values
      ),
    ]);

    let items = [...vRes.rows, ...iRes.rows, ...insRes.rows];
    items.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    items = items.slice(0, limit);

    if (items.length) {
      const uniqueIds = [...new Set(items.map(i => i.autor_id))];
      const autoresRes = await pool.query('SELECT id, nombre FROM usuarios WHERE id = ANY($1)', [uniqueIds]);
      const autoresMap = Object.fromEntries(autoresRes.rows.map(u => [u.id, u.nombre]));
      items.forEach(item => { item.autor_nombre = autoresMap[item.autor_id] || null; });
    }

    decorarMedia(items);

    res.json({ success: true, items, total: items.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/feed/relacionados — videos relacionados (misma categoría, excluye el actual)
router.get('/relacionados', async (req, res, next) => {
  try {
    const cat = (req.query.cat || '').trim();
    const excluir = parseInt(req.query.id, 10) || null;
    const limit = clampLimit(req.query.limit, 8, 12);

    const where = [];
    const values = [];
    if (cat) { where.push('categoria = $' + (values.length + 1)); values.push(cat); }
    if (excluir) { where.push('id <> $' + (values.length + 1)); values.push(excluir); }
    values.push(limit);

    const sql =
      `SELECT 'video' AS tipo, id, autor_id, titulo, categoria, dificultad, descripcion,
              hashtags, filepath, portada_path, vistas, creado_en, monetizado, precio, tipo_venta
         FROM prof_videos
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY vistas DESC, creado_en DESC
        LIMIT $${values.length}`;

    const { rows } = await pool.query(sql, values);
    if (rows.length) {
      const uniqueIds = [...new Set(rows.map(r => r.autor_id))];
      const autoresRes = await pool.query('SELECT id, nombre FROM usuarios WHERE id = ANY($1)', [uniqueIds]);
      const autoresMap = Object.fromEntries(autoresRes.rows.map(u => [u.id, u.nombre]));
      rows.forEach(r => { r.autor_nombre = autoresMap[r.autor_id] || null; });
    }

    decorarMedia(rows);

    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;