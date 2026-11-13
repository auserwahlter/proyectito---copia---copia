const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const pool = require('./db');
const { requireAuth } = require('./acceso');
const { uploadVideo, uploadImage, uploadCover } = require('./upload');
const { generarMiniatura } = require('./thumbs');
const { leerUsuarioAutenticado } = require('./jwt');
const { tieneAcceso } = require('./monetizacion');
const { crearNotificacion } = require('./notificaciones');
const { mapaColumnas } = require('./columnas');

const router = express.Router();
const noneParser = multer().none();

const TIPOS_IMAGEN = ['diagrama', 'foto_posicion', 'captura', 'infografia', 'otro'];
const TIPOS_DIAGRAMA = ['arbol_decision', 'flujo_posiciones', 'sistema_juego', 'cadena_sumision'];
const NIVELES_INSTRUCCIONAL = ['principiante', 'intermedio', 'avanzado'];

const TIPOS = {
  video: {
    tabla: 'prof_videos',
    campos: ['titulo', 'categoria', 'dificultad', 'descripcion'],
    updateCols: ['titulo', 'categoria', 'dificultad', 'descripcion', 'hashtags', 'monetizado', 'precio', 'tipo_venta'],
    uploadField: 'video',
    coverField: 'portada',
    needsFile: true,
  },
  imagen: {
    tabla: 'prof_imagenes',
    campos: ['titulo', 'tipo', 'descripcion'],
    updateCols: ['titulo', 'tipo', 'descripcion', 'hashtags', 'monetizado', 'precio', 'tipo_venta'],
    uploadField: 'imagen',
    needsFile: true,
  },
  instruccional: {
    tabla: 'prof_instruccionales',
    campos: ['titulo', 'descripcion', 'nivel', 'categoria', 'secciones', 'videos_ids', 'imagenes_ids', 'diagrama_ids'],
    updateCols: ['titulo', 'descripcion', 'nivel', 'categoria', 'secciones', 'videos_ids', 'imagenes_ids', 'diagrama_ids', 'monetizado', 'precio', 'tipo_venta'],
    portadaField: 'portada',
    needsFile: false,
  },
  diagrama: {
    tabla: 'prof_diagramas',
    campos: ['titulo', 'descripcion', 'nodos', 'tipo', 'instruccional_id', 'enciclopedia_ref'],
    updateCols: ['titulo', 'descripcion', 'nodos', 'tipo', 'instruccional_id', 'enciclopedia_ref', 'monetizado', 'precio', 'tipo_venta'],
    needsFile: false,
  },
};

const ALLOWED_TIPOS = Object.keys(TIPOS);

function parseHashtags(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function parseIds(val) {
  if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n));
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.map(Number).filter(n => !isNaN(n));
    } catch (_e) { /* no es JSON, seguir */ }
    return t.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  return [];
}

function normSinAcentos(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ── Lecciones de instruccionales (secciones JSONB) ───────────────────────
   Cada lección: { tipo: 'video'|'imagen'|'diagrama', id, titulo, descripcion, nota }.
   Los arrays *_ids se derivan de aquí en el servidor (autoritativo). */
function procesarSecciones(body) {
  const raw = body.secciones;
  if (raw === undefined || raw === null || raw === '') return null;

  let arr;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try { arr = JSON.parse(raw); }
    catch (_e) { return { error: 'Secciones: JSON inválido' }; }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return { error: 'Secciones: debe ser una lista de lecciones' };

  const VALIDO = { video: 1, imagen: 1, diagrama: 1 };
  const out = [];
  for (const s of arr) {
    const tipo = normSinAcentos(s.tipo).replace(/s$/, '');
    if (!VALIDO[tipo]) return { error: 'Secciones: tipo de elemento no válido (usa video, imagen o diagrama)' };
    const id = parseInt(s.id, 10);
    if (!id || isNaN(id)) return { error: 'Secciones: cada lección necesita el id de un elemento válido' };
    out.push({
      tipo,
      id,
      titulo: String(s.titulo || '').slice(0, 200),
      descripcion: String(s.descripcion || '').slice(0, 2000),
      nota: String(s.nota || '').slice(0, 1000),
    });
  }
  return { secciones: out };
}

function derivarIds(secciones) {
  return {
    videos_ids: secciones.filter(s => s.tipo === 'video').map(s => s.id),
    imagenes_ids: secciones.filter(s => s.tipo === 'imagen').map(s => s.id),
    diagrama_ids: secciones.filter(s => s.tipo === 'diagrama').map(s => s.id),
  };
}

/* ── Resolución de elementos referenciados por un instruccional ──────────
   Devuelve {id,titulo} (+filepath/portada/nodos solo si hay acceso). */
async function resolverMeta(ids, tipo, accesible, m) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const tabla = TIPOS[tipo].tabla;
  const set = m.get(tabla) || new Map();
  const cols = new Set(['id', 'titulo']);
  if (tipo === 'imagen' && set.has('tipo')) cols.add('tipo');
  if (tipo === 'diagrama' && set.has('tipo')) cols.add('tipo');
  if (accesible) {
    if (set.has('filepath')) cols.add('filepath');
    if (tipo === 'video' && set.has('portada_path')) cols.add('portada_path');
    if (tipo === 'diagrama' && set.has('nodos')) cols.add('nodos');
  }
  const { rows } = await pool.query(
    `SELECT ${[...cols].join(', ')} FROM ${tabla} WHERE id = ANY($1)`,
    [ids]
  );
  return rows;
}

function clampLimit(val, def = 20, max = 100) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return def;
  return Math.min(n, max);
}

// ── GET /api/contenido/mio — contenido propio ─────────────────────────────
// (registrado ANTES de /:tipo para que no lo capture ese catchall)
router.get('/mio', requireAuth, async (req, res, next) => {
  try {
    const allowed = req.query.tipo && TIPOS[req.query.tipo] ? [req.query.tipo] : ALLOWED_TIPOS;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = clampLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const queries = allowed.map(t => {
      const cfg = TIPOS[t];
      return pool.query(
        `SELECT '${t}' AS tipo, id, titulo, vistas, creado_en, monetizado, tipo_venta
           FROM ${cfg.tabla}
          WHERE autor_id = $1
          ORDER BY creado_en DESC`,
        [req.usuario.id]
      );
    });

    const results = await Promise.all(queries);
    let items = results.flatMap(r => r.rows);
    items.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    const total = items.length;
    items = items.slice(offset, offset + limit);

    res.json({
      success: true,
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/contenido/comentarios-recibidos — actividad en mi contenido ─
router.get('/comentarios-recibidos', requireAuth, async (req, res, next) => {
  try {
    const uid = req.usuario.id;
    const cond = `( (c.tipo='video' AND v.autor_id=$1)
                 OR (c.tipo='imagen' AND i.autor_id=$1)
                 OR (c.tipo='instruccional' AND ins.autor_id=$1)
                 OR (c.tipo='diagrama' AND d.autor_id=$1) )`;

    const { rows } = await pool.query(
      `SELECT c.id, c.tipo AS contenido_tipo, c.contenido_id, c.mensaje, c.usuario_id,
              u.nombre AS autor_nombre, c.parent_id, c.creado_en,
              COALESCE(v.titulo, i.titulo, ins.titulo, d.titulo) AS titulo
         FROM contenido_comentarios c
         JOIN usuarios u ON u.id = c.usuario_id
         LEFT JOIN prof_videos v ON c.tipo='video' AND v.id=c.contenido_id
         LEFT JOIN prof_imagenes i ON c.tipo='imagen' AND i.id=c.contenido_id
         LEFT JOIN prof_instruccionales ins ON c.tipo='instruccional' AND ins.id=c.contenido_id
         LEFT JOIN prof_diagramas d ON c.tipo='diagrama' AND d.id=c.contenido_id
        WHERE ${cond}
        ORDER BY c.creado_en DESC
        LIMIT 50`,
      [uid]
    );

    const { rows: likesRes } = await pool.query(
      `SELECT l.tipo AS contenido_tipo, l.contenido_id, COUNT(*)::int AS cant,
              COALESCE(v.titulo, i.titulo, ins.titulo, d.titulo) AS titulo
         FROM contenido_likes l
         LEFT JOIN prof_videos v ON l.tipo='video' AND v.id=l.contenido_id
         LEFT JOIN prof_imagenes i ON l.tipo='imagen' AND i.id=l.contenido_id
         LEFT JOIN prof_instruccionales ins ON l.tipo='instruccional' AND ins.id=l.contenido_id
         LEFT JOIN prof_diagramas d ON l.tipo='diagrama' AND d.id=l.contenido_id
        WHERE ( (l.tipo='video' AND v.autor_id=$1)
             OR (l.tipo='imagen' AND i.autor_id=$1)
             OR (l.tipo='instruccional' AND ins.autor_id=$1)
             OR (l.tipo='diagrama' AND d.autor_id=$1) )
        GROUP BY l.tipo, l.contenido_id, v.titulo, i.titulo, ins.titulo, d.titulo
        ORDER BY cant DESC
        LIMIT 20`,
      [uid]
    );

    const totalLikes = likesRes.reduce((a, r) => a + r.cant, 0);
    res.json({
      success: true,
      comentarios: rows,
      total_comentarios: rows.length,
      likes: likesRes,
      total_likes: totalLikes,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/contenido/:tipo — listado paginado por autor ────────────────
router.get('/:tipo', async (req, res, next) => {
  try {
    const { tipo } = req.params;
    if (!TIPOS[tipo]) return res.status(400).json({ success: false, message: 'Tipo de contenido no válido' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = clampLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM ${TIPOS[tipo].tabla}
        ORDER BY creado_en DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countRows } = await pool.query(`SELECT count(*) AS total FROM ${TIPOS[tipo].tabla}`);
    const total = parseInt(countRows[0].total, 10);

    res.json({
      success: true,
      items: result.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/contenido/:tipo/:id — detalle ────────────────────────────────
router.get('/:tipo/:id', async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    if (!TIPOS[tipo]) return res.status(400).json({ success: false, message: 'Tipo no válido' });

    const result = await pool.query(
      `SELECT v.*, u.nombre AS autor_nombre
         FROM ${TIPOS[tipo].tabla} v
         JOIN usuarios u ON u.id = v.autor_id
        WHERE v.id = $1`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'No encontrado' });

    await pool.query(`UPDATE ${TIPOS[tipo].tabla} SET vistas = vistas + 1 WHERE id = $1`, [id]);
    result.rows[0].vistas = parseInt(result.rows[0].vistas, 10) + 1;

    const usuario = await leerUsuarioAutenticado(req);
    result.rows[0].tiene_acceso = await tieneAcceso(usuario, result.rows[0], tipo);
    result.rows[0].likes_count = await contarLikes(tipo, id);
    result.rows[0].liked = usuario ? await estaLiked(usuario.id, tipo, id) : false;
    result.rows[0].comentarios_count = await contarComentarios(tipo, id);

    if (tipo === 'instruccional') {
      const fila = result.rows[0];
      const accesible = !fila.monetizado || fila.tiene_acceso;
      const m2 = await mapaColumnas();

      fila.videos = await resolverMeta(fila.videos_ids, 'video', accesible, m2);
      fila.imagenes = await resolverMeta(fila.imagenes_ids, 'imagen', accesible, m2);
      fila.diagramas = await resolverMeta(fila.diagrama_ids, 'diagrama', accesible, m2);

      let secs = fila.secciones;
      if (typeof secs === 'string') {
        try { secs = JSON.parse(secs); } catch (_e) { secs = null; }
      }
      if (Array.isArray(secs) && secs.length) {
        fila.secciones = secs.map(s => {
          const poolArr = s.tipo === 'video' ? fila.videos
            : s.tipo === 'imagen' ? fila.imagenes
            : s.tipo === 'diagrama' ? fila.diagramas : [];
          const meta = (poolArr || []).find(x => Number(x.id) === Number(s.id)) || null;
          return {
            id: s.id != null ? s.id : null,
            tipo: s.tipo || '',
            titulo: s.titulo || '',
            descripcion: s.descripcion || '',
            nota: s.nota || '',
            item_meta: meta,
          };
        });
      } else {
        fila.secciones = [];
      }
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/contenido/:tipo — crear ─────────────────────────────────────
router.post('/:tipo', requireAuth, async (req, res, next) => {
  try {
    const { tipo } = req.params;
    const cfg = TIPOS[tipo];
    if (!cfg) return res.status(400).json({ success: false, message: 'Tipo no válido' });

    if (!req.usuario.modo_creador && tipo !== 'diagrama' &&
        !['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'Debes activar el modo creador para publicar contenido' });
    }

    const hashtags = parseHashtags(req.body.hashtags);

    if (cfg.needsFile) {
      const field = cfg.uploadField;
      const Upload = tipo === 'video' ? uploadVideo : uploadImage;
      return Upload.single(field)(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        if (!req.file) return res.status(400).json({ success: false, message: `Debes adjuntar un archivo en el campo "${field}"` });
        return await insertarContenido(tipo, cfg, req, res, next);
      });
    }

    if (cfg.portadaField) {
      return uploadCover.single(cfg.portadaField)(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        return await insertarContenido(tipo, cfg, req, res, next);
      });
    }

    return noneParser(req, res, async (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      return await insertarContenido(tipo, cfg, req, res, next);
    });
  } catch (error) {
    next(error);
  }
});

async function insertarContenido(tipo, cfg, req, res, next) {
  try {
    const values = [req.usuario.id];
    const placeholders = ['$1'];
    let idx = 2;

    const body = req.body || {};
    const hashtags = parseHashtags(body.hashtags);

    const m = await mapaColumnas();
    const setTabla = m.get(cfg.tabla) || new Map();
    const camPos = cfg.campos.filter(c => setTabla.has(c));
    if (camPos.length !== cfg.campos.length) {
      console.warn(`[contenido] columnas inexistentes omitidas en ${cfg.tabla}: ${cfg.campos.filter(c => !setTabla.has(c)).join(', ')}`);
    }
    const conHashtags = setTabla.has('hashtags');

    if (cfg.tabla === 'prof_instruccionales' && body.secciones !== undefined) {
      const out = procesarSecciones(body);
      if (out && out.error) return res.status(400).json({ success: false, message: out.error });
      if (out) {
        body.secciones = JSON.stringify(out.secciones);
        const ids = derivarIds(out.secciones);
        body.videos_ids = ids.videos_ids;
        body.imagenes_ids = ids.imagenes_ids;
        body.diagrama_ids = ids.diagrama_ids;
      }
    }

    for (const col of camPos) {
      let val = body[col] ?? null;
      if (col === 'titulo' && (val === null || !String(val).trim())) {
        return res.status(400).json({ success: false, message: 'El título es obligatorio' });
      }
      if (col === 'dificultad') {
        if (val == null) val = 'basico';
        else {
          val = normSinAcentos(val);
          if (!['basico', 'intermedio', 'avanzado'].includes(val)) {
            return res.status(400).json({ success: false, message: 'Dificultad no válida (usa básico, intermedio o avanzado)' });
          }
        }
      }
      if (col === 'nivel') {
        if (val == null) val = 'principiante';
        else {
          val = normSinAcentos(val);
          if (val === 'basico') val = 'principiante';
          if (!NIVELES_INSTRUCCIONAL.includes(val)) {
            return res.status(400).json({ success: false, message: 'Nivel no válido (usa principiante, intermedio o avanzado)' });
          }
        }
      }
      if (col === 'tipo' && cfg.tabla === 'prof_imagenes') {
        if (val == null) val = 'diagrama';
        else {
          val = normSinAcentos(val);
          if (!TIPOS_IMAGEN.includes(val)) {
            return res.status(400).json({ success: false, message: `Tipo de imagen no válido (usa: ${TIPOS_IMAGEN.join(', ')})` });
          }
        }
      }
      if (col === 'tipo' && cfg.tabla === 'prof_diagramas') {
        if (val == null) val = 'arbol_decision';
        else {
          val = normSinAcentos(val);
          if (!TIPOS_DIAGRAMA.includes(val)) {
            return res.status(400).json({ success: false, message: `Tipo de diagrama no válido (usa: ${TIPOS_DIAGRAMA.join(', ')})` });
          }
        }
      }
      if (/(?:^|_)ids$/.test(col)) val = parseIds(val);
      if (col === 'nodos' && typeof val !== 'string') val = JSON.stringify(val ?? {});
      if (col === 'secciones' && typeof val !== 'string') val = JSON.stringify(val ?? []);
      if (col === 'nodos' && typeof val === 'string') {
        try { JSON.parse(val); } catch (_e) {
          return res.status(400).json({ success: false, message: 'Nodos: JSON inválido' });
        }
      }
      if (val === '') val = null;
      values.push(val);
      placeholders.push(`$${idx++}`);
    }

    if (conHashtags) {
      values.push(hashtags);
      placeholders.push(`$${idx++}`);
    }

    if (req.file) {
      const filepath = req.file.path.replace(/\\/g, '/').replace(/.*uploads\//, '');
      if (cfg.portadaField) {
        if (setTabla.has('portada_path')) {
          values.push(filepath);
          placeholders.push(`$${idx++}`);
        } else {
          console.warn('[contenido] portada_path no existe en la BD; se omite la portada');
        }
      } else {
        if (setTabla.has('filename')) { values.push(req.file.filename); placeholders.push(`$${idx++}`); }
        if (setTabla.has('filepath')) { values.push(filepath); placeholders.push(`$${idx++}`); }
      }
    }

    const monetizado = body.monetizado === 'true' || body.monetizado === true;
    const precio = parseFloat(body.precio) || 0;
    const tipo_venta = body.tipo_venta || 'gratis';
    values.push(monetizado, precio, tipo_venta);
    placeholders.push(`$${idx++}`, `$${idx++}`, `$${idx++}`);

    const cols = [...camPos];
    if (conHashtags) { cols.push('hashtags'); }
    if (req.file) {
      if (cfg.portadaField) {
        if (setTabla.has('portada_path')) cols.push('portada_path');
      } else {
        if (setTabla.has('filename')) cols.push('filename');
        if (setTabla.has('filepath')) cols.push('filepath');
      }
    }
    cols.push('monetizado', 'precio', 'tipo_venta');

    const query = `INSERT INTO ${cfg.tabla} (autor_id, ${cols.join(', ')})
                   VALUES (${placeholders.join(', ')})
                   RETURNING *`;

    const result = await pool.query(query, values);

    if (tipo === 'video' && req.file) {
      generarMiniatura(req.file.path)
        .then(thumb => console.log('Miniatura generada:', thumb))
        .catch(err => console.error('Error generando miniatura:', err.message));
    }

    return res.status(201).json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

// ── PUT /api/contenido/:tipo/:id — actualizar ─────────────────────────────
router.put('/:tipo/:id', requireAuth, async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    const cfg = TIPOS[tipo];
    if (!cfg) return res.status(400).json({ success: false, message: 'Tipo no válido' });

    const { rows } = await pool.query(`SELECT autor_id FROM ${cfg.tabla} WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });

    const owner = parseInt(rows[0].autor_id, 10);
    const actorId = parseInt(req.usuario.id, 10);
    if (owner !== actorId && !['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'No puedes editar contenido de otro usuario' });
    }

    const body = req.body || {};
    const setClauses = [];
    const values = [];
    let idx = 1;

    const m = await mapaColumnas();
    const setTabla = m.get(cfg.tabla) || new Map();
    const colsUpd = cfg.updateCols.filter(c => setTabla.has(c));

    if (cfg.tabla === 'prof_instruccionales' && body.secciones !== undefined) {
      const out = procesarSecciones(body);
      if (out && out.error) return res.status(400).json({ success: false, message: out.error });
      if (out) {
        body.secciones = JSON.stringify(out.secciones);
        const ids = derivarIds(out.secciones);
        body.videos_ids = ids.videos_ids;
        body.imagenes_ids = ids.imagenes_ids;
        body.diagrama_ids = ids.diagrama_ids;
      }
    }

    for (const col of colsUpd) {
      if (body[col] === undefined) continue;
      let val = body[col];
      if (col === 'hashtags') val = parseHashtags(val);
      if (col === 'nivel' && val != null) {
        val = normSinAcentos(val);
        if (val === 'basico') val = 'principiante';
        if (!NIVELES_INSTRUCCIONAL.includes(val)) {
          return res.status(400).json({ success: false, message: 'Nivel no válido (usa principiante, intermedio o avanzado)' });
        }
      }
      if (col === 'tipo' && cfg.tabla === 'prof_imagenes' && val != null) {
        val = normSinAcentos(val);
        if (!TIPOS_IMAGEN.includes(val)) {
          return res.status(400).json({ success: false, message: `Tipo de imagen no válido (usa: ${TIPOS_IMAGEN.join(', ')})` });
        }
      }
      if (col === 'tipo' && cfg.tabla === 'prof_diagramas' && val != null) {
        val = normSinAcentos(val);
        if (!TIPOS_DIAGRAMA.includes(val)) {
          return res.status(400).json({ success: false, message: `Tipo de diagrama no válido (usa: ${TIPOS_DIAGRAMA.join(', ')})` });
        }
      }
      if (/(?:^|_)ids$/.test(col) && typeof val !== 'undefined') val = parseIds(val);
      if (col === 'nodos' && typeof val !== 'string') val = JSON.stringify(val ?? {});
      if (col === 'secciones' && typeof val !== 'string') val = JSON.stringify(val ?? []);
      if (col === 'nodos' && typeof val === 'string') {
        try { JSON.parse(val); } catch (_e) {
          return res.status(400).json({ success: false, message: 'Nodos: JSON inválido' });
        }
      }
      if (col === 'monetizado') val = val === 'true' || val === true;
      if (col === 'precio') val = parseFloat(val) || 0;
      if (val === '') val = null;
      values.push(val);
      setClauses.push(`${col} = $${idx++}`);
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, message: 'Sin cambios' });

    const result = await pool.query(
      `UPDATE ${cfg.tabla} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── DELETE /api/contenido/:tipo/:id — eliminar ────────────────────────────
router.delete('/:tipo/:id', requireAuth, async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    const cfg = TIPOS[tipo];
    if (!cfg) return res.status(400).json({ success: false, message: 'Tipo no válido' });

    const m = await mapaColumnas();
    const setDel = m.get(cfg.tabla) || new Map();
    const colsDel = [];
    if (setDel.has('filename')) colsDel.push('filename');
    if (setDel.has('filepath')) colsDel.push('filepath');
    const { rows } = await pool.query(`SELECT autor_id${colsDel.length ? ', ' + colsDel.join(', ') : ''} FROM ${cfg.tabla} WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });

    const owner = parseInt(rows[0].autor_id, 10);
    const actorId = parseInt(req.usuario.id, 10);
    if (owner !== actorId && !['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'No puedes eliminar contenido de otro usuario' });
    }

    await pool.query(`DELETE FROM ${cfg.tabla} WHERE id = $1`, [id]);

    if (rows[0].filepath) {
      const absPath = path.resolve(process.env.UPLOAD_FOLDER || path.join(__dirname, '..', 'uploads'), rows[0].filepath);
      fs.unlink(absPath, () => {});
    }

    res.json({ success: true, message: 'Eliminado' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/contenido/video/:id/portada — subir portada personalizada ──
router.post('/video/:id/portada', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query('SELECT autor_id FROM prof_videos WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Video no encontrado' });

    const owner = parseInt(rows[0].autor_id, 10);
    const actorId = parseInt(req.usuario.id, 10);
    if (owner !== actorId && !['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso' });
    }

    uploadCover.single('portada')(req, res, async (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      if (!req.file) return res.status(400).json({ success: false, message: 'Debes adjuntar una imagen' });

      const filepath = req.file.path.replace(/\\/g, '/').replace(/.*uploads\//, '');
      await pool.query(
        'UPDATE prof_videos SET portada_path = $1, portada_personalizada = TRUE WHERE id = $2',
        [filepath, id]
      );

      res.json({ success: true, portada: filepath });
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/contenido/instruccional/:id/portada — miniatura/portada opcional ─
router.post('/instruccional/:id/portada', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query('SELECT autor_id FROM prof_instruccionales WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Instruccional no encontrado' });

    const owner = parseInt(rows[0].autor_id, 10);
    const actorId = parseInt(req.usuario.id, 10);
    if (owner !== actorId && !['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso' });
    }

    uploadCover.single('portada')(req, res, async (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      if (!req.file) return res.status(400).json({ success: false, message: 'Debes adjuntar una imagen' });

      const filepath = req.file.path.replace(/\\/g, '/').replace(/.*uploads\//, '');
      await pool.query(
        'UPDATE prof_instruccionales SET portada_path = $1 WHERE id = $2',
        [filepath, id]
      );

      res.json({ success: true, portada: filepath });
    });
  } catch (error) {
    next(error);
  }
});

const TIPOS_VALIDOS = Object.keys(TIPOS);

function esModerador(user) {
  return user && ['moderador', 'admin'].includes(user.rol);
}

async function contarLikes(tipo, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM contenido_likes WHERE tipo = $1 AND contenido_id = $2',
    [tipo, id]
  );
  return rows[0].n;
}

async function estaLiked(usuarioId, tipo, id) {
  const { rows } = await pool.query(
    'SELECT 1 FROM contenido_likes WHERE tipo = $1 AND contenido_id = $2 AND usuario_id = $3',
    [tipo, id, usuarioId]
  );
  return rows.length > 0;
}

async function contarComentarios(tipo, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM contenido_comentarios WHERE tipo = $1 AND contenido_id = $2',
    [tipo, id]
  );
  return rows[0].n;
}

function comentariosArbol(filas) {
  const porId = new Map();
  const raices = [];
  for (const c of filas) {
    const nodo = {
      id: c.id,
      parent_id: c.parent_id,
      usuario_id: c.usuario_id,
      autor_nombre: c.autor_nombre,
      autor_rol: c.autor_rol,
      mensaje: c.mensaje,
      creado_en: c.creado_en,
      respuestas: [],
    };
    porId.set(nodo.id, nodo);
  }
  for (const nodo of porId.values()) {
    const padre = nodo.parent_id && porId.get(nodo.parent_id);
    if (padre) padre.respuestas.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

// GET /api/contenido/:tipo/:id/comentarios — listar (auth opcional)
router.get('/:tipo/:id/comentarios', async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo no válido' });
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.parent_id, c.usuario_id, u.nombre AS autor_nombre, u.rol AS autor_rol,
              c.mensaje, c.creado_en
         FROM contenido_comentarios c
         JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.tipo = $1 AND c.contenido_id = $2
        ORDER BY c.creado_en ASC`,
      [tipo, id]
    );
    res.json({ success: true, comentarios: comentariosArbol(rows), total: rows.length });
  } catch (error) {
    next(error);
  }
});

// POST /api/contenido/:tipo/:id/comentarios — crear
router.post('/:tipo/:id/comentarios', requireAuth, async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo no válido' });
    }

    const mensaje = ((req.body || {}).mensaje || '').toString().trim();
    const parent_id = (req.body || {}).parent_id || null;
    if (!mensaje) return res.status(400).json({ success: false, message: 'El comentario no puede estar vacío' });
    if (mensaje.length > 2000) return res.status(400).json({ success: false, message: 'Máximo 2000 caracteres' });

    const cfg = TIPOS[tipo];
    const { rows: contRows } = await pool.query(`SELECT autor_id FROM ${cfg.tabla} WHERE id = $1`, [id]);
    if (contRows.length === 0) return res.status(404).json({ success: false, message: 'Contenido no encontrado' });
    const autor_id = contRows[0].autor_id;

    await pool.query(
      `INSERT INTO contenido_comentarios (tipo, contenido_id, autor_id, usuario_id, parent_id, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, autor_id, usuario_id, mensaje, creado_en`,
      [tipo, id, autor_id, req.usuario.id, parent_id, mensaje]
    );

    if (Number(autor_id) !== Number(req.usuario.id)) {
      await crearNotificacion({
        usuario_id: autor_id,
        titulo: 'Nuevo comentario',
        mensaje: `@${req.usuario.nombre} comentó tu contenido.`,
        tipo: 'comentario',
        metadata: { tipo, contenido_id: parseInt(id, 10) },
      });
    }

    const total = await contarComentarios(tipo, id);
    res.status(201).json({
      success: true,
      total,
      comentario: {
        parent_id,
        usuario_id: req.usuario.id,
        autor_nombre: req.usuario.nombre,
        autor_rol: req.usuario.rol,
        mensaje,
        creado_en: new Date(),
        respuestas: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/contenido/comentarios/:id — autor del comentario, dueño del contenido o moderador
router.delete('/comentarios/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT usuario_id, autor_id FROM contenido_comentarios WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });

    const { usuario_id, autor_id } = rows[0];
    if (Number(usuario_id) !== Number(req.usuario.id) &&
        Number(autor_id) !== Number(req.usuario.id) &&
        !esModerador(req.usuario)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar este comentario' });
    }

    await pool.query('DELETE FROM contenido_comentarios WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/contenido/:tipo/:id/like — like/unlike
router.post('/:tipo/:id/like', requireAuth, async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo no válido' });
    }

    const cfg = TIPOS[tipo];
    const { rows: contRows } = await pool.query(`SELECT autor_id FROM ${cfg.tabla} WHERE id = $1`, [id]);
    if (contRows.length === 0) return res.status(404).json({ success: false, message: 'Contenido no encontrado' });
    const autor_id = contRows[0].autor_id;

    const existente = await pool.query(
      'SELECT 1 FROM contenido_likes WHERE tipo = $1 AND contenido_id = $2 AND usuario_id = $3',
      [tipo, id, req.usuario.id]
    );
    let liked;
    if (existente.rowCount > 0) {
      await pool.query(
        'DELETE FROM contenido_likes WHERE tipo = $1 AND contenido_id = $2 AND usuario_id = $3',
        [tipo, id, req.usuario.id]
      );
      liked = false;
    } else {
      await pool.query(
        'INSERT INTO contenido_likes (tipo, contenido_id, usuario_id) VALUES ($1, $2, $3)',
        [tipo, id, req.usuario.id]
      );
      liked = true;
      if (Number(autor_id) !== Number(req.usuario.id)) {
        await crearNotificacion({
          usuario_id: autor_id,
          titulo: 'Nuevo like',
          mensaje: `@${req.usuario.nombre} le gustó tu contenido.`,
          tipo: 'like',
          metadata: { tipo, contenido_id: parseInt(id, 10) },
        });
      }
    }

    res.json({ success: true, liked, likes_count: await contarLikes(tipo, id) });
  } catch (error) {
    next(error);
  }
});

// POST /api/contenido/:tipo/:id/reportar — reportar contenido
router.post('/:tipo/:id/reportar', requireAuth, async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo no válido' });
    }

    const motivo = ((req.body || {}).motivo || '').toString().trim();
    if (!motivo) return res.status(400).json({ success: false, message: 'Indica el motivo del reporte' });
    if (motivo.length > 1000) return res.status(400).json({ success: false, message: 'Máximo 1000 caracteres' });

    const cfg = TIPOS[tipo];
    const check = await pool.query(`SELECT 1 FROM ${cfg.tabla} WHERE id = $1`, [id]);
    if (check.rowCount === 0) return res.status(404).json({ success: false, message: 'Contenido no encontrado' });

    await pool.query(
      `INSERT INTO contenido_reportes (tipo, contenido_id, usuario_id, motivo)
       VALUES ($1, $2, $3, $4)`,
      [tipo, id, req.usuario.id, motivo]
    );

    res.status(201).json({ success: true, message: 'Reporte enviado. Gracias por ayudarnos a moderar.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;