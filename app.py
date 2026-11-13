import json
import os
import re
import uuid
from werkzeug.utils import secure_filename
import bcrypt
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file, send_from_directory, abort
from flask_cors import CORS
from psycopg import connect, errors
import traceback

load_dotenv() 
UPLOAD_FOLDER = os.path.abspath(os.getenv('UPLOAD_FOLDER', './uploads'))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_VIDEO = {'mp4', 'webm', 'mov'}
ALLOWED_IMAGE = {'jpg', 'jpeg', 'png', 'webp'}
MAX_VIDEO_MB  = 500
MAX_IMAGE_MB  = 10

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:1234@localhost:54869/luta_danca')


def get_connection():
    return connect(DATABASE_URL)


def ensure_users_table():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS usuarios (
                    id BIGSERIAL PRIMARY KEY,
                    nombre VARCHAR(120) NOT NULL,
                    email VARCHAR(180) NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    rol VARCHAR(20) NOT NULL DEFAULT 'alumno',
                    rango VARCHAR(40),
                    metodo_pago VARCHAR(30) NOT NULL DEFAULT 'tarjeta',
                    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
                    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol)')
        conn.commit()
    finally:
        conn.close()


def ensure_forum_tables():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS foro_publicaciones (
                    id BIGSERIAL PRIMARY KEY,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    mensaje TEXT NOT NULL,
                    hashtags TEXT[] NOT NULL DEFAULT '{}',
                    imagen_url TEXT,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
                    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                "ALTER TABLE foro_publicaciones ADD COLUMN IF NOT EXISTS imagen_url TEXT"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS foro_likes (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES foro_publicaciones(id) ON DELETE CASCADE,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(post_id, usuario_id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS foro_respuestas (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES foro_publicaciones(id) ON DELETE CASCADE,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    mensaje TEXT NOT NULL,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS notificaciones (
                    id BIGSERIAL PRIMARY KEY,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo TEXT NOT NULL,
                    mensaje TEXT NOT NULL,
                    tipo TEXT NOT NULL DEFAULT 'info',
                    prioridad TEXT NOT NULL DEFAULT 'normal',
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    leida BOOLEAN NOT NULL DEFAULT FALSE,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute('CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_usuario_id ON foro_publicaciones(usuario_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_creado_en ON foro_publicaciones(creado_en)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_foro_likes_post_id ON foro_likes(post_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_foro_likes_usuario_id ON foro_likes(usuario_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_foro_respuestas_post_id ON foro_respuestas(post_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_id ON notificaciones(usuario_id, creado_en DESC)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida, creado_en DESC)')
        conn.commit()
    finally:
        conn.close()


ensure_users_table()
ensure_forum_tables()
def ensure_profesor_tables():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Videos instruccionales
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prof_videos (
                    id          BIGSERIAL PRIMARY KEY,
                    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo      TEXT NOT NULL,
                    categoria   VARCHAR(60),
                    dificultad  VARCHAR(30) DEFAULT 'basico',
                    descripcion TEXT,
                    hashtags    TEXT[] NOT NULL DEFAULT '{}',
                    filename    TEXT NOT NULL,
                    filepath    TEXT NOT NULL,
                    vistas      BIGINT NOT NULL DEFAULT 0,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            # Imágenes técnicas
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prof_imagenes (
                    id          BIGSERIAL PRIMARY KEY,
                    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo      TEXT NOT NULL,
                    tipo        VARCHAR(40) DEFAULT 'diagrama',
                    descripcion TEXT,
                    hashtags    TEXT[] NOT NULL DEFAULT '{}',
                    filename    TEXT NOT NULL,
                    filepath    TEXT NOT NULL,
                    vistas      BIGINT NOT NULL DEFAULT 0,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            # Instruccionales (cursos empaquetados)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prof_instruccionales (
                    id          BIGSERIAL PRIMARY KEY,
                    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo      TEXT NOT NULL,
                    descripcion TEXT,
                    nivel       VARCHAR(40) DEFAULT 'principiante',
                    categoria   VARCHAR(60),
                    videos_ids  BIGINT[] NOT NULL DEFAULT '{}',
                    vistas      BIGINT NOT NULL DEFAULT 0,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            # Diagramas tácticos propios
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prof_diagramas (
                    id          BIGSERIAL PRIMARY KEY,
                    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo      TEXT NOT NULL,
                    descripcion TEXT,
                    nodos       TEXT NOT NULL,
                    tipo        VARCHAR(60) DEFAULT 'arbol_decision',
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            # Videos subidos por alumnos (revisión, práctica o consulta)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS student_videos (
                    id          BIGSERIAL PRIMARY KEY,
                    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    titulo      TEXT NOT NULL,
                    descripcion TEXT,
                    hashtags    TEXT[] NOT NULL DEFAULT '{}',
                    filename    TEXT NOT NULL,
                    filepath    TEXT NOT NULL,
                    vistas      BIGINT NOT NULL DEFAULT 0,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            cur.execute('CREATE INDEX IF NOT EXISTS idx_student_videos_usuario_id ON student_videos(usuario_id)')

            # Migración: agregar columna 'vistas' si las tablas ya existían sin ella
            for table in ('prof_videos', 'prof_imagenes', 'prof_instruccionales', 'prof_diagramas', 'student_videos'):
                cur.execute(
                    f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS vistas BIGINT NOT NULL DEFAULT 0'
                )

            # Columnas adicionales para diagramas interactivos
            for col, typedef in [
                ('publicado', 'BOOLEAN NOT NULL DEFAULT TRUE'),
                ('instruccional_id', 'BIGINT REFERENCES prof_instruccionales(id) ON DELETE SET NULL'),
                ('enciclopedia_ref', 'TEXT'),
            ]:
                cur.execute(f'ALTER TABLE prof_diagramas ADD COLUMN IF NOT EXISTS {col} {typedef}')

            # Log de visualizaciones (para series temporales / analítica)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prof_visualizaciones (
                    id             BIGSERIAL PRIMARY KEY,
                    contenido_tipo VARCHAR(20) NOT NULL,
                    contenido_id   BIGINT NOT NULL,
                    profesor_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    usuario_id     BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
                    creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute(
                'CREATE INDEX IF NOT EXISTS idx_prof_visualizaciones_profesor_fecha '
                'ON prof_visualizaciones(profesor_id, creado_en)'
            )
            cur.execute(
                'CREATE INDEX IF NOT EXISTS idx_prof_visualizaciones_contenido '
                'ON prof_visualizaciones(contenido_tipo, contenido_id)'
            )

            # Índices
            for table, col in [
                ('prof_videos',        'profesor_id'),
                ('prof_imagenes',      'profesor_id'),
                ('prof_instruccionales','profesor_id'),
                ('prof_diagramas',     'profesor_id'),
            ]:
                cur.execute(
                    f'CREATE INDEX IF NOT EXISTS idx_{table}_{col} ON {table}({col})'
                )
        conn.commit()
    finally:
        conn.close()

ensure_profesor_tables()


def ensure_social_tables():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS seguimientos (
                    id BIGSERIAL PRIMARY KEY,
                    seguidor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    seguido_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(seguidor_id, seguido_id)
                )
                """
            )
            cur.execute('CREATE INDEX IF NOT EXISTS idx_seguimientos_seguidor_id ON seguimientos(seguidor_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_seguimientos_seguido_id ON seguimientos(seguido_id)')

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS video_comentarios (
                    id BIGSERIAL PRIMARY KEY,
                    video_id BIGINT NOT NULL REFERENCES prof_videos(id) ON DELETE CASCADE,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    mensaje TEXT NOT NULL,
                    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute('CREATE INDEX IF NOT EXISTS idx_video_comentarios_video_id ON video_comentarios(video_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_video_comentarios_usuario_id ON video_comentarios(usuario_id)')

            # ── Comentarios unificados con replies anidadas ──
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS contenido_comentarios (
                    id           BIGSERIAL PRIMARY KEY,
                    tipo         VARCHAR(20) NOT NULL,
                    contenido_id BIGINT      NOT NULL,
                    profesor_id  BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    usuario_id   BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    parent_id    BIGINT      REFERENCES contenido_comentarios(id) ON DELETE CASCADE,
                    mensaje      TEXT        NOT NULL,
                    creado_en    TIMESTAMP   NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute('CREATE INDEX IF NOT EXISTS idx_cont_com_contenido ON contenido_comentarios(tipo, contenido_id, creado_en)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_cont_com_parent   ON contenido_comentarios(parent_id)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_cont_com_profesor  ON contenido_comentarios(profesor_id, creado_en DESC)')

            cur.execute("""
                CREATE TABLE IF NOT EXISTS diagrama_likes (
                    id          BIGSERIAL PRIMARY KEY,
                    diagrama_id BIGINT NOT NULL REFERENCES prof_diagramas(id) ON DELETE CASCADE,
                    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(diagrama_id, usuario_id)
                )
            """)
            cur.execute('CREATE INDEX IF NOT EXISTS idx_diagrama_likes_diagrama ON diagrama_likes(diagrama_id)')

            cur.execute("""
                CREATE TABLE IF NOT EXISTS contenido_reportes (
                    id           BIGSERIAL PRIMARY KEY,
                    tipo         VARCHAR(20) NOT NULL,
                    contenido_id BIGINT NOT NULL,
                    usuario_id   BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
                    motivo       TEXT NOT NULL,
                    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'revisado', 'descartado')),
                    creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute(
                'CREATE INDEX IF NOT EXISTS idx_cont_reportes_estado ON contenido_reportes(estado, creado_en DESC)'
            )
        conn.commit()
    finally:
        conn.close()

ensure_social_tables()


_CONTENIDO_TIPOS = ('video', 'imagen', 'instruccional', 'diagrama')
_CONTENIDO_TABLAS = {
    'video': 'prof_videos',
    'imagen': 'prof_imagenes',
    'instruccional': 'prof_instruccionales',
    'diagrama': 'prof_diagramas',
}


def _parse_diagrama_nodos(nodos_raw):
    """Convierte nodos almacenados (JSON o texto legado) en dict con nodes/edges."""
    if not nodos_raw:
        return {'nodes': [], 'edges': []}
    if isinstance(nodos_raw, dict):
        return nodos_raw
    try:
        parsed = json.loads(nodos_raw)
        if isinstance(parsed, dict) and ('nodes' in parsed or 'edges' in parsed):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return {'nodes': [], 'edges': [], 'legacy_text': str(nodos_raw)}


def _diagrama_row_to_dict(row, extra=None):
    """Serializa una fila de prof_diagramas."""
    item = {
        'id': row[0],
        'profesor_id': row[1],
        'titulo': row[2],
        'descripcion': row[3],
        'nodos': row[4],
        'grafo': _parse_diagrama_nodos(row[4]),
        'tipo': row[5],
        'creado_en': row[6].isoformat() if row[6] else None,
        'vistas': row[7] if len(row) > 7 else 0,
        'publicado': row[8] if len(row) > 8 else True,
        'instruccional_id': row[9] if len(row) > 9 else None,
        'enciclopedia_ref': row[10] if len(row) > 10 else None,
    }
    if extra:
        item.update(extra)
    return item


_DIAGRAMA_SELECT = """
    SELECT d.id, d.profesor_id, d.titulo, d.descripcion, d.nodos, d.tipo, d.creado_en,
           d.vistas, d.publicado, d.instruccional_id, d.enciclopedia_ref
    FROM prof_diagramas d
"""


# ── Helper: verificar que el usuario es profesor ─────────────────
def _get_profesor(profesor_id, require_activo=False):
    """Retorna la fila del usuario si existe y es profesor.
    Si require_activo es True, además exige estado = 'activo'."""
    if not profesor_id:
        return None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nombre, rol, estado FROM usuarios WHERE id = %s AND rol = 'profesor'",
                (profesor_id,)
            )
            row = cur.fetchone()
            if not row:
                return None
            if require_activo and row[3] != 'activo':
                return None
            return row
    finally:
        conn.close()


def _get_usuario(usuario_id, require_rol=None):
    """Retorna la fila del usuario si existe. Puede exigir rol específico."""
    if not usuario_id:
        return None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if require_rol:
                cur.execute(
                    "SELECT id, nombre, rol, estado FROM usuarios WHERE id = %s AND rol = %s",
                    (usuario_id, require_rol)
                )
            else:
                cur.execute(
                    "SELECT id, nombre, rol, estado FROM usuarios WHERE id = %s",
                    (usuario_id,)
                )
            return cur.fetchone()
    finally:
        conn.close()


# ════════════════════════════════════════════════
#  COMENTARIOS DE CONTENIDO (videos / imágenes / instruccionales / diagramas)
#  con soporte de respuestas anidadas (un nivel)
# ════════════════════════════════════════════════

def _comentarios_a_arbol(filas):
    """Convierte lista plana (id, parent_id, …) en árbol raíces + replies."""
    por_id = {}
    raices = []
    for r in filas:
        nodo = {
            'id': r[0], 'parent_id': r[1], 'usuario_id': r[2],
            'autor_nombre': r[3], 'autor_rol': r[4],
            'mensaje': r[5], 'creado_en': r[6].isoformat() if r[6] else None,
            'replies': [],
        }
        por_id[nodo['id']] = nodo
    for nodo in por_id.values():
        pid = nodo['parent_id']
        if pid and pid in por_id:
            por_id[pid]['replies'].append(nodo)
        else:
            raices.append(nodo)
    return raices


@app.route('/api/contenido/<string:tipo>/<int:contenido_id>/comentarios', methods=['GET'])
def get_comentarios(tipo, contenido_id):
    if tipo not in _CONTENIDO_TIPOS:
        return jsonify({'success': False, 'message': 'Tipo inválido'}), 400
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.parent_id, c.usuario_id, u.nombre, u.rol, c.mensaje, c.creado_en
                FROM contenido_comentarios c
                JOIN usuarios u ON u.id = c.usuario_id
                WHERE c.tipo = %s AND c.contenido_id = %s
                ORDER BY c.creado_en ASC
                """,
                (tipo, contenido_id)
            )
            filas = cur.fetchall()
        conn.close()
        return jsonify({'success': True, 'comentarios': _comentarios_a_arbol(filas), 'total': len(filas)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/contenido/<string:tipo>/<int:contenido_id>/comentarios', methods=['POST'])
def crear_comentario(tipo, contenido_id):
    if tipo not in _CONTENIDO_TIPOS:
        return jsonify({'success': False, 'message': 'Tipo inválido'}), 400
    data       = request.get_json(silent=True) or {}
    usuario_id = data.get('usuario_id')
    mensaje    = (data.get('mensaje') or '').strip()
    parent_id  = data.get('parent_id')
    if not usuario_id: return jsonify({'success': False, 'message': 'Falta usuario_id'}), 400
    if not mensaje:    return jsonify({'success': False, 'message': 'El comentario no puede estar vacío'}), 400
    if len(mensaje) > 2000: return jsonify({'success': False, 'message': 'Máximo 2000 caracteres'}), 400

    tabla_tipo = _CONTENIDO_TABLAS[tipo]
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(f'SELECT profesor_id FROM {tabla_tipo} WHERE id = %s', (contenido_id,))
            contenido = cur.fetchone()
            if not contenido:
                conn.close(); return jsonify({'success': False, 'message': 'Contenido no encontrado'}), 404
            profesor_id = contenido[0]

            cur.execute('SELECT id, nombre, rol FROM usuarios WHERE id = %s', (usuario_id,))
            usuario = cur.fetchone()
            if not usuario:
                conn.close(); return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
            autor_nombre, autor_rol = usuario[1], usuario[2]

            parent_autor_id = None
            if parent_id:
                cur.execute(
                    'SELECT id, usuario_id FROM contenido_comentarios WHERE id = %s AND tipo = %s AND contenido_id = %s',
                    (parent_id, tipo, contenido_id)
                )
                parent_row = cur.fetchone()
                if not parent_row:
                    conn.close(); return jsonify({'success': False, 'message': 'Comentario padre no encontrado'}), 404
                parent_autor_id = parent_row[1]

            cur.execute(
                """
                INSERT INTO contenido_comentarios
                    (tipo, contenido_id, profesor_id, usuario_id, parent_id, mensaje)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, creado_en
                """,
                (tipo, contenido_id, profesor_id, usuario_id, parent_id, mensaje)
            )
            nuevo = cur.fetchone()
            nuevo_id, creado_en = nuevo[0], nuevo[1]

            meta = json.dumps({'tipo': tipo, 'contenido_id': contenido_id, 'comentario_id': nuevo_id})
            if profesor_id != usuario_id:
                titulo_n  = 'Nueva respuesta en tu contenido' if parent_id else 'Nuevo comentario en tu contenido'
                mensaje_n = f'@{autor_nombre} respondió un comentario en tu {tipo}.' if parent_id else f'@{autor_nombre} comentó tu {tipo}.'
                cur.execute(
                    "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida) "
                    "VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                    (profesor_id, titulo_n, mensaje_n, 'comentario', 'normal', meta)
                )
            if parent_id and parent_autor_id and parent_autor_id != usuario_id and parent_autor_id != profesor_id:
                cur.execute(
                    "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida) "
                    "VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                    (parent_autor_id, 'Te respondieron', f'@{autor_nombre} respondió tu comentario.', 'comentario', 'normal', meta)
                )
            conn.commit()
        conn.close()
        return jsonify({'success': True, 'comentario': {
            'id': nuevo_id, 'parent_id': parent_id, 'usuario_id': usuario_id,
            'autor_nombre': autor_nombre, 'autor_rol': autor_rol,
            'mensaje': mensaje, 'creado_en': creado_en.isoformat() if creado_en else None, 'replies': [],
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/contenido/comentarios/<int:comentario_id>', methods=['DELETE'])
def eliminar_comentario(comentario_id):
    usuario_id = request.args.get('usuario_id', type=int)
    if not usuario_id: return jsonify({'success': False, 'message': 'Falta usuario_id'}), 400
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id, usuario_id, profesor_id FROM contenido_comentarios WHERE id = %s', (comentario_id,))
            com = cur.fetchone()
            if not com:
                conn.close(); return jsonify({'success': False, 'message': 'Comentario no encontrado'}), 404
            if usuario_id not in (com[1], com[2]):
                conn.close(); return jsonify({'success': False, 'message': 'Sin permiso'}), 403
            cur.execute('DELETE FROM contenido_comentarios WHERE id = %s', (comentario_id,))
            conn.commit()
        conn.close()
        return jsonify({'success': True, 'deleted_id': comentario_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/comentarios', methods=['GET'])
def mod_get_comentarios():
    """
    Para el moderador: lista todos los comentarios de un tipo+contenido,
    o todos los recientes si no se filtra.
    Query params: tipo (opcional), contenido_id (opcional), limit (default 100)
    """
    tipo         = request.args.get('tipo', '').strip()
    contenido_id = request.args.get('contenido_id', type=int)
    limit        = min(request.args.get('limit', 100, type=int), 500)
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            q = """
                SELECT c.id, c.parent_id, c.tipo, c.contenido_id,
                       c.usuario_id, u.nombre AS autor_nombre, u.rol AS autor_rol,
                       c.profesor_id, p.nombre AS profesor_nombre,
                       c.mensaje, c.creado_en
                FROM contenido_comentarios c
                JOIN usuarios u ON u.id = c.usuario_id
                JOIN usuarios p ON p.id = c.profesor_id
            """
            params = []
            wheres = []
            if tipo:         wheres.append('c.tipo = %s');         params.append(tipo)
            if contenido_id: wheres.append('c.contenido_id = %s'); params.append(contenido_id)
            if wheres: q += ' WHERE ' + ' AND '.join(wheres)
            q += ' ORDER BY c.creado_en DESC LIMIT %s'
            params.append(limit)
            cur.execute(q, params)
            rows = cur.fetchall()
        conn.close()
        comentarios = [{
            'id': r[0], 'parent_id': r[1], 'tipo': r[2], 'contenido_id': r[3],
            'usuario_id': r[4], 'autor_nombre': r[5], 'autor_rol': r[6],
            'profesor_id': r[7], 'profesor_nombre': r[8],
            'mensaje': r[9], 'creado_en': r[10].isoformat() if r[10] else None,
        } for r in rows]
        return jsonify({'success': True, 'comentarios': comentarios, 'total': len(comentarios)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/comentarios/<int:comentario_id>', methods=['DELETE'])
def mod_delete_comentario(comentario_id):
    """El moderador puede eliminar cualquier comentario sin restricción de autoría."""
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id') or request.args.get('mod_id', type=int)
    if not mod_id: return jsonify({'success': False, 'message': 'Falta mod_id'}), 400
    if not _get_mod(mod_id): return jsonify({'success': False, 'message': 'No autorizado'}), 403
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('DELETE FROM contenido_comentarios WHERE id = %s RETURNING id', (comentario_id,))
            deleted = cur.fetchone()
            conn.commit()
        conn.close()
        if not deleted: return jsonify({'success': False, 'message': 'Comentario no encontrado'}), 404
        return jsonify({'success': True, 'deleted_id': comentario_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  VISUALIZACIONES — registro y estadísticas
# ════════════════════════════════════════════════

# Mapea el tipo de contenido recibido desde el frontend a su tabla real.
_VISUALIZACION_TABLAS = {
    'video':          'prof_videos',
    'imagen':         'prof_imagenes',
    'instruccional':  'prof_instruccionales',
    'diagrama':       'prof_diagramas',
}


@app.route('/api/visualizaciones', methods=['POST'])
def registrar_visualizacion():
    """
    Registra una visualización de un video, imagen o instruccional.

    Body JSON esperado:
        {
            "tipo": "video" | "imagen" | "instruccional",
            "contenido_id": <int>,
            "usuario_id": <int>   (opcional; quién la generó)
        }

    Incrementa el contador 'vistas' del contenido y agrega una fila al
    log 'prof_visualizaciones' (usado para gráficos de evolución diaria).
    Es seguro llamarlo cada vez que un alumno abre/reproduce el contenido;
    no requiere autenticación de profesor.
    """
    data         = request.get_json(silent=True) or {}
    tipo         = (data.get('tipo') or '').strip().lower()
    contenido_id = data.get('contenido_id')
    usuario_id   = data.get('usuario_id')

    tabla = _VISUALIZACION_TABLAS.get(tipo)
    if not tabla:
        return jsonify({'success': False, 'message': 'Tipo de contenido inválido. Usa video, imagen, instruccional o diagrama.'}), 400
    if not isinstance(contenido_id, int) and not (isinstance(contenido_id, str) and contenido_id.isdigit()):
        return jsonify({'success': False, 'message': 'Falta contenido_id'}), 400
    contenido_id = int(contenido_id)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                f'SELECT profesor_id FROM {tabla} WHERE id = %s',
                (contenido_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Contenido no encontrado'}), 404
            profesor_id = row[0]

            cur.execute(
                f'UPDATE {tabla} SET vistas = vistas + 1 WHERE id = %s RETURNING vistas',
                (contenido_id,)
            )
            nuevas_vistas = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO prof_visualizaciones
                    (contenido_tipo, contenido_id, profesor_id, usuario_id)
                VALUES (%s, %s, %s, %s)
                """,
                (tipo, contenido_id, profesor_id, usuario_id)
            )
            conn.commit()
        conn.close()

        return jsonify({'success': True, 'vistas': nuevas_vistas})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/estadisticas', methods=['GET'])
def profesor_estadisticas():
    """
    Devuelve estadísticas de visualizaciones para el profesor:
      - totales de vistas por tipo de contenido y el gran total
      - top contenido más visto (videos, imágenes, instruccionales)
      - serie diaria de visualizaciones de los últimos N días (default 30)
      - seguidores totales

    Query params: profesor_id (requerido), dias (opcional, default 30, máx 90)
    """
    profesor_id = request.args.get('profesor_id', type=int)
    dias        = min(request.args.get('dias', 30, type=int), 90)
    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:

            # ── Top videos ──
            cur.execute(
                """
                SELECT id, titulo, categoria, dificultad, vistas, creado_en
                FROM prof_videos
                WHERE profesor_id = %s
                ORDER BY vistas DESC, creado_en DESC
                """,
                (profesor_id,)
            )
            videos = [
                {
                    'id': r[0], 'titulo': r[1], 'categoria': r[2], 'dificultad': r[3],
                    'vistas': r[4] or 0, 'creado_en': r[5].isoformat() if r[5] else None,
                }
                for r in cur.fetchall()
            ]

            # ── Top imágenes ──
            cur.execute(
                """
                SELECT id, titulo, tipo, vistas, creado_en
                FROM prof_imagenes
                WHERE profesor_id = %s
                ORDER BY vistas DESC, creado_en DESC
                """,
                (profesor_id,)
            )
            imagenes = [
                {
                    'id': r[0], 'titulo': r[1], 'tipo': r[2],
                    'vistas': r[3] or 0, 'creado_en': r[4].isoformat() if r[4] else None,
                }
                for r in cur.fetchall()
            ]

            # ── Top instruccionales ──
            cur.execute(
                """
                SELECT id, titulo, nivel, categoria, vistas, creado_en
                FROM prof_instruccionales
                WHERE profesor_id = %s
                ORDER BY vistas DESC, creado_en DESC
                """,
                (profesor_id,)
            )
            instruccionales = [
                {
                    'id': r[0], 'titulo': r[1], 'nivel': r[2], 'categoria': r[3],
                    'vistas': r[4] or 0, 'creado_en': r[5].isoformat() if r[5] else None,
                }
                for r in cur.fetchall()
            ]

            # ── Serie diaria de visualizaciones (todos los tipos) ──
            cur.execute(
                """
                SELECT date_trunc('day', creado_en)::date AS dia,
                       contenido_tipo,
                       COUNT(*) AS total
                FROM prof_visualizaciones
                WHERE profesor_id = %s
                  AND creado_en >= NOW() - (%s || ' days')::interval
                GROUP BY dia, contenido_tipo
                ORDER BY dia ASC
                """,
                (profesor_id, dias)
            )
            serie_rows = cur.fetchall()

            # ── Seguidores totales ──
            cur.execute('SELECT COUNT(*) FROM seguimientos WHERE seguido_id = %s', (profesor_id,))
            seguidores = cur.fetchone()[0]

        conn.close()

        total_vistas_videos = sum(v['vistas'] for v in videos)
        total_vistas_imagenes = sum(i['vistas'] for i in imagenes)
        total_vistas_instruccionales = sum(i['vistas'] for i in instruccionales)

        # Reconstruir serie diaria como { fecha: {video, imagen, instruccional, total} }
        serie_map = {}
        for dia, tipo, total in serie_rows:
            key = dia.isoformat()
            entry = serie_map.setdefault(key, {'fecha': key, 'video': 0, 'imagen': 0, 'instruccional': 0, 'total': 0})
            entry[tipo] = total
            entry['total'] += total
        serie = sorted(serie_map.values(), key=lambda e: e['fecha'])

        return jsonify({
            'success': True,
            'resumen': {
                'seguidores':            seguidores,
                'total_videos':          len(videos),
                'total_imagenes':        len(imagenes),
                'total_instruccionales': len(instruccionales),
                'vistas_videos':         total_vistas_videos,
                'vistas_imagenes':       total_vistas_imagenes,
                'vistas_instruccionales':total_vistas_instruccionales,
                'vistas_totales':        total_vistas_videos + total_vistas_imagenes + total_vistas_instruccionales,
            },
            'videos':          videos,
            'imagenes':        imagenes,
            'instruccionales': instruccionales,
            'serie_diaria':    serie,
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def _allowed_file(filename, allowed_set):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return ext in allowed_set


# ════════════════════════════════════════════════
#  VIDEOS
# ════════════════════════════════════════════════

@app.route('/api/profesor/videos', methods=['GET'])
def get_profesor_videos():
    """Lista los videos de un profesor."""
    profesor_id = request.args.get('profesor_id', type=int)
    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, titulo, categoria, dificultad, descripcion,
                       hashtags, filename, creado_en, vistas
                FROM prof_videos
                WHERE profesor_id = %s
                ORDER BY creado_en DESC
                """,
                (profesor_id,)
            )
            rows = cur.fetchall()
        conn.close()

        videos = [
            {
                'id':          r[0],
                'titulo':      r[1],
                'categoria':   r[2],
                'dificultad':  r[3],
                'descripcion': r[4],
                'hashtags':    r[5] or [],
                'filename':    r[6],
                'creado_en':   r[7].isoformat() if r[7] else None,
                'vistas':      r[8] or 0,
            }
            for r in rows
        ]
        return jsonify({'success': True, 'videos': videos})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/videos', methods=['POST'])
def upload_video():
    """
    Recibe un video vía multipart/form-data.
    Campos: profesor_id, titulo, categoria, dificultad, descripcion, hashtags
    Archivo: video (campo 'file')
    """
    profesor_id = request.form.get('profesor_id', type=int)
    titulo      = (request.form.get('titulo') or '').strip()
    categoria   = (request.form.get('categoria') or '').strip()
    dificultad  = (request.form.get('dificultad') or 'basico').strip()
    descripcion = (request.form.get('descripcion') or '').strip()
    raw_tags    = request.form.get('hashtags', '')
    hashtags    = [t.lower() for t in re.findall(r'#([A-Za-z0-9_]+)', raw_tags)]

    if not profesor_id or not titulo:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400

    if not _get_profesor(profesor_id):
        return jsonify({'success': False, 'message': 'Usuario no es profesor'}), 403

    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No se recibió ningún archivo'}), 400

    if not _allowed_file(file.filename, ALLOWED_VIDEO):
        return jsonify({'success': False, 'message': 'Formato de video no permitido'}), 400

    # Verificar tamaño leyendo los bytes (no confiar en Content-Length)
    file.stream.seek(0, 2)
    size_mb = file.stream.tell() / (1024 * 1024)
    file.stream.seek(0)
    if size_mb > MAX_VIDEO_MB:
        return jsonify({'success': False, 'message': f'El video supera los {MAX_VIDEO_MB} MB'}), 413

    ext      = file.filename.rsplit('.', 1)[-1].lower()
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    subfolder = os.path.join(UPLOAD_FOLDER, 'videos', str(profesor_id))
    os.makedirs(subfolder, exist_ok=True)
    filepath  = os.path.join(subfolder, safe_name)
    file.save(filepath)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prof_videos
                    (profesor_id, titulo, categoria, dificultad, descripcion, hashtags, filename, filepath)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, creado_en
                """,
                (profesor_id, titulo, categoria, dificultad,
                 descripcion, hashtags, secure_filename(file.filename), filepath)
            )
            row = cur.fetchone()

            cur.execute(
                'SELECT seguidor_id FROM seguimientos WHERE seguido_id = %s',
                (profesor_id,)
            )
            followers = cur.fetchall()
            if followers:
                for follower in followers:
                    cur.execute(
                        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida) "
                        "VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                        (
                            follower[0],
                            'Nuevo video disponible',
                            f'El profesor {profesor_id} subió un nuevo video: {titulo}',
                            'video',
                            'normal',
                            json.dumps({'video_id': row[0], 'profesor_id': profesor_id}),
                        )
                    )

            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'video': {
                'id':        row[0],
                'titulo':    titulo,
                'categoria': categoria,
                'creado_en': row[1].isoformat(),
            }
        }), 201

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/videos/<int:video_id>', methods=['DELETE'])
def delete_video(video_id):
    """Elimina un video del profesor."""
    data        = request.get_json(silent=True) or {}
    profesor_id = data.get('profesor_id')

    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT filepath FROM prof_videos WHERE id = %s AND profesor_id = %s',
                (video_id, profesor_id)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Video no encontrado'}), 404

            cur.execute(
                'DELETE FROM prof_videos WHERE id = %s AND profesor_id = %s',
                (video_id, profesor_id)
            )
            conn.commit()
        conn.close()

        # Borrar archivo físico
        if row[0] and os.path.exists(row[0]):
            os.remove(row[0])

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# Servir archivos de video almacenados
def _serve_upload_file(folder, filename):
    folder_abs = os.path.abspath(folder)
    if not folder_abs.startswith(UPLOAD_FOLDER + os.sep) and folder_abs != UPLOAD_FOLDER:
        abort(403)

    filepath = os.path.abspath(os.path.join(folder_abs, filename))
    if not filepath.startswith(folder_abs + os.sep) and filepath != folder_abs:
        abort(403)
    if not os.path.isfile(filepath):
        abort(404)
    return send_file(filepath)


@app.route('/uploads/videos/<int:profesor_id>/<path:filename>')
def serve_video(profesor_id, filename):
    folder = os.path.join(UPLOAD_FOLDER, 'videos', str(profesor_id))
    return _serve_upload_file(folder, filename)


@app.route('/uploads/videos/alumnos/<int:usuario_id>/<path:filename>')
def serve_student_video(usuario_id, filename):
    folder = os.path.join(UPLOAD_FOLDER, 'videos', 'alumnos', str(usuario_id))
    return _serve_upload_file(folder, filename)


@app.route('/api/alumno/videos', methods=['GET'])
def get_student_videos():
    usuario_id = request.args.get('usuario_id', type=int)
    if not usuario_id:
        return jsonify({'success': False, 'message': 'Falta usuario_id'}), 400
    if not _get_usuario(usuario_id, require_rol='alumno'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, titulo, descripcion, hashtags, filename, creado_en "
                "FROM student_videos WHERE usuario_id = %s ORDER BY creado_en DESC",
                (usuario_id,)
            )
            rows = cur.fetchall()
        conn.close()

        videos = [
            {
                'id': r[0],
                'titulo': r[1],
                'descripcion': r[2] or '',
                'hashtags': r[3] or [],
                'url': f'/uploads/videos/alumnos/{usuario_id}/{r[4]}',
                'creado_en': r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]
        return jsonify({'success': True, 'videos': videos})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alumno/videos', methods=['POST'])
def upload_student_video():
    usuario_id  = request.form.get('usuario_id', type=int)
    titulo       = (request.form.get('titulo') or '').strip()
    descripcion  = (request.form.get('descripcion') or '').strip()
    raw_tags     = request.form.get('hashtags', '')
    hashtags     = [t.lower() for t in re.findall(r'#([A-Za-z0-9_]+)', raw_tags)]

    if not usuario_id or not titulo:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400
    if not _get_usuario(usuario_id, require_rol='alumno'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No se recibió ningún archivo'}), 400
    if not _allowed_file(file.filename, ALLOWED_VIDEO):
        return jsonify({'success': False, 'message': 'Formato de video no permitido'}), 400

    file.stream.seek(0, 2)
    size_mb = file.stream.tell() / (1024 * 1024)
    file.stream.seek(0)
    if size_mb > MAX_VIDEO_MB:
        return jsonify({'success': False, 'message': f'El video supera los {MAX_VIDEO_MB} MB'}), 413

    ext = file.filename.rsplit('.', 1)[-1].lower()
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    subfolder = os.path.join(UPLOAD_FOLDER, 'videos', 'alumnos', str(usuario_id))
    os.makedirs(subfolder, exist_ok=True)
    filepath = os.path.join(subfolder, safe_name)
    file.save(filepath)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO student_videos (usuario_id, titulo, descripcion, hashtags, filename, filepath)"
                " VALUES (%s,%s,%s,%s,%s,%s) RETURNING id, creado_en",
                (usuario_id, titulo, descripcion, hashtags, safe_name, filepath)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'video': {
                'id': row[0],
                'titulo': titulo,
                'descripcion': descripcion,
                'hashtags': hashtags,
                'url': f'/uploads/videos/alumnos/{usuario_id}/{safe_name}',
                'creado_en': row[1].isoformat(),
            }
        }), 201
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  IMÁGENES
# ════════════════════════════════════════════════

@app.route('/api/profesor/imagenes', methods=['GET'])
def get_profesor_imagenes():
    profesor_id = request.args.get('profesor_id', type=int)
    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, titulo, tipo, descripcion, hashtags, filename, creado_en, vistas
                FROM prof_imagenes
                WHERE profesor_id = %s
                ORDER BY creado_en DESC
                """,
                (profesor_id,)
            )
            rows = cur.fetchall()
        conn.close()

        imagenes = [
            {
                'id':          r[0],
                'titulo':      r[1],
                'tipo':        r[2],
                'descripcion': r[3],
                'hashtags':    r[4] or [],
                'filename':    r[5],
                'creado_en':   r[6].isoformat() if r[6] else None,
                'url':         f'/uploads/imagenes/{profesor_id}/{r[5]}',
                'vistas':      r[7] or 0,
            }
            for r in rows
        ]
        return jsonify({'success': True, 'imagenes': imagenes})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/imagenes', methods=['POST'])
def upload_imagen():
    """
    Recibe una imagen vía multipart/form-data.
    Campos: profesor_id, titulo, tipo, descripcion, hashtags
    Archivo: imagen (campo 'file')
    """
    profesor_id = request.form.get('profesor_id', type=int)
    titulo      = (request.form.get('titulo') or '').strip()
    tipo        = (request.form.get('tipo') or 'diagrama').strip()
    descripcion = (request.form.get('descripcion') or '').strip()
    raw_tags    = request.form.get('hashtags', '')
    hashtags    = [t.lower() for t in re.findall(r'#([A-Za-z0-9_]+)', raw_tags)]

    if not profesor_id or not titulo:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400

    if not _get_profesor(profesor_id):
        return jsonify({'success': False, 'message': 'Usuario no es profesor'}), 403

    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No se recibió ningún archivo'}), 400

    if not _allowed_file(file.filename, ALLOWED_IMAGE):
        return jsonify({'success': False, 'message': 'Formato de imagen no permitido'}), 400

    file.stream.seek(0, 2)
    size_mb = file.stream.tell() / (1024 * 1024)
    file.stream.seek(0)
    if size_mb > MAX_IMAGE_MB:
        return jsonify({'success': False, 'message': f'La imagen supera los {MAX_IMAGE_MB} MB'}), 413

    ext       = file.filename.rsplit('.', 1)[-1].lower()
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    subfolder = os.path.join(UPLOAD_FOLDER, 'imagenes', str(profesor_id))
    os.makedirs(subfolder, exist_ok=True)
    filepath  = os.path.join(subfolder, safe_name)
    file.save(filepath)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prof_imagenes
                    (profesor_id, titulo, tipo, descripcion, hashtags, filename, filepath)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, creado_en
                """,
                (profesor_id, titulo, tipo, descripcion,
                 hashtags, safe_name, filepath)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'imagen': {
                'id':        row[0],
                'titulo':    titulo,
                'tipo':      tipo,
                'url':       f'/uploads/imagenes/{profesor_id}/{safe_name}',
                'creado_en': row[1].isoformat(),
            }
        }), 201

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/imagenes/<int:imagen_id>', methods=['DELETE'])
def delete_imagen(imagen_id):
    data        = request.get_json(silent=True) or {}
    profesor_id = data.get('profesor_id')

    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT filepath FROM prof_imagenes WHERE id = %s AND profesor_id = %s',
                (imagen_id, profesor_id)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Imagen no encontrada'}), 404

            cur.execute(
                'DELETE FROM prof_imagenes WHERE id = %s AND profesor_id = %s',
                (imagen_id, profesor_id)
            )
            conn.commit()
        conn.close()

        if row[0] and os.path.exists(row[0]):
            os.remove(row[0])

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/uploads/imagenes/<int:profesor_id>/<path:filename>')
def serve_imagen(profesor_id, filename):
    folder = os.path.join(UPLOAD_FOLDER, 'imagenes', str(profesor_id))
    return _serve_upload_file(folder, filename)


# ════════════════════════════════════════════════
#  INSTRUCCIONALES
# ════════════════════════════════════════════════

@app.route('/api/profesor/instruccionales', methods=['GET'])
def get_instruccionales():
    profesor_id = request.args.get('profesor_id', type=int)
    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, titulo, descripcion, nivel, categoria, videos_ids, creado_en, vistas
                FROM prof_instruccionales
                WHERE profesor_id = %s
                ORDER BY creado_en DESC
                """,
                (profesor_id,)
            )
            rows = cur.fetchall()
        conn.close()

        items = [
            {
                'id':          r[0],
                'titulo':      r[1],
                'descripcion': r[2],
                'nivel':       r[3],
                'categoria':   r[4],
                'videos_ids':  r[5] or [],
                'creado_en':   r[6].isoformat() if r[6] else None,
                'vistas':      r[7] or 0,
            }
            for r in rows
        ]
        return jsonify({'success': True, 'instruccionales': items})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/instruccionales', methods=['POST'])
def create_instruccional():
    data        = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'JSON inválido'}), 400

    profesor_id = data.get('profesor_id')
    titulo      = (data.get('titulo') or '').strip()
    descripcion = (data.get('descripcion') or '').strip()
    nivel       = (data.get('nivel') or 'principiante').strip()
    categoria   = (data.get('categoria') or '').strip()
    videos_ids  = [int(v) for v in (data.get('videos_ids') or []) if str(v).isdigit()]

    if not profesor_id or not titulo:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400

    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prof_instruccionales
                    (profesor_id, titulo, descripcion, nivel, categoria, videos_ids)
                VALUES (%s,%s,%s,%s,%s,%s)
                RETURNING id, creado_en
                """,
                (profesor_id, titulo, descripcion, nivel, categoria, videos_ids)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'instruccional': {
                'id':        row[0],
                'titulo':    titulo,
                'nivel':     nivel,
                'creado_en': row[1].isoformat(),
            }
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/instruccionales/<int:inst_id>', methods=['DELETE'])
def delete_instruccional(inst_id):
    data        = request.get_json(silent=True) or {}
    profesor_id = data.get('profesor_id')

    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM prof_instruccionales WHERE id = %s AND profesor_id = %s RETURNING id',
                (inst_id, profesor_id)
            )
            deleted = cur.fetchone()
            conn.commit()
        conn.close()

        if not deleted:
            return jsonify({'success': False, 'message': 'Instruccional no encontrado'}), 404

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  DIAGRAMAS INTERACTIVOS
# ════════════════════════════════════════════════

@app.route('/api/profesor/diagramas', methods=['GET'])
def get_diagramas():
    profesor_id = request.args.get('profesor_id', type=int)
    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                _DIAGRAMA_SELECT + """
                WHERE d.profesor_id = %s
                ORDER BY d.creado_en DESC
                """,
                (profesor_id,)
            )
            rows = cur.fetchall()
            items = []
            for r in rows:
                cur.execute(
                    'SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = %s', (r[0],)
                )
                likes = cur.fetchone()[0]
                cur.execute(
                    'SELECT COUNT(*) FROM contenido_comentarios WHERE tipo = %s AND contenido_id = %s',
                    ('diagrama', r[0])
                )
                comentarios = cur.fetchone()[0]
                items.append(_diagrama_row_to_dict(r, {'likes': likes, 'comentarios_count': comentarios}))
        conn.close()
        return jsonify({'success': True, 'diagramas': items})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/diagramas', methods=['POST'])
def create_diagrama():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'JSON inválido'}), 400

    profesor_id       = data.get('profesor_id')
    titulo            = (data.get('titulo') or '').strip()
    descripcion       = (data.get('descripcion') or '').strip()
    nodos             = data.get('nodos')
    tipo              = (data.get('tipo') or 'arbol_decision').strip()
    publicado         = data.get('publicado', True)
    instruccional_id  = data.get('instruccional_id')
    enciclopedia_ref  = (data.get('enciclopedia_ref') or '').strip() or None

    if isinstance(nodos, dict):
        nodos = json.dumps(nodos)
    nodos = (nodos or '').strip()

    if not profesor_id or not titulo or not nodos:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios (titulo, nodos)'}), 400

    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prof_diagramas
                    (profesor_id, titulo, descripcion, nodos, tipo, publicado,
                     instruccional_id, enciclopedia_ref)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, creado_en
                """,
                (profesor_id, titulo, descripcion, nodos, tipo, bool(publicado),
                 instruccional_id, enciclopedia_ref)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'diagrama': {
                'id': row[0],
                'titulo': titulo,
                'tipo': tipo,
                'creado_en': row[1].isoformat(),
            }
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/diagramas/<int:diag_id>', methods=['PUT'])
def update_diagrama(diag_id):
    data = request.get_json(silent=True) or {}
    profesor_id = data.get('profesor_id')
    if not profesor_id or not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    fields, params = [], []
    for key, col in [
        ('titulo', 'titulo'), ('descripcion', 'descripcion'), ('tipo', 'tipo'),
        ('publicado', 'publicado'), ('instruccional_id', 'instruccional_id'),
        ('enciclopedia_ref', 'enciclopedia_ref'),
    ]:
        if key in data:
            fields.append(f'{col} = %s')
            params.append(data[key])

    if 'nodos' in data:
        nodos = data['nodos']
        if isinstance(nodos, dict):
            nodos = json.dumps(nodos)
        fields.append('nodos = %s')
        params.append(nodos)

    if not fields:
        return jsonify({'success': False, 'message': 'Nada que actualizar'}), 400

    params.extend([diag_id, profesor_id])
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                f'UPDATE prof_diagramas SET {", ".join(fields)} '
                f'WHERE id = %s AND profesor_id = %s RETURNING id',
                params
            )
            updated = cur.fetchone()
            conn.commit()
        conn.close()
        if not updated:
            return jsonify({'success': False, 'message': 'Diagrama no encontrado'}), 404
        return jsonify({'success': True, 'id': updated[0]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/profesor/diagramas/<int:diag_id>', methods=['DELETE'])
def delete_diagrama(diag_id):
    data        = request.get_json(silent=True) or {}
    profesor_id = data.get('profesor_id')

    if not profesor_id:
        return jsonify({'success': False, 'message': 'Falta profesor_id'}), 400
    if not _get_profesor(profesor_id, require_activo=True):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM prof_diagramas WHERE id = %s AND profesor_id = %s RETURNING id',
                (diag_id, profesor_id)
            )
            deleted = cur.fetchone()
            conn.commit()
        conn.close()

        if not deleted:
            return jsonify({'success': False, 'message': 'Diagrama no encontrado'}), 404

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/public/diagramas', methods=['GET'])
def public_diagramas():
    """Lista diagramas publicados para estudiantes."""
    tipo = request.args.get('tipo', '').strip()
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            where = 'WHERE d.publicado = TRUE'
            params = []
            if tipo:
                where += ' AND d.tipo = %s'
                params.append(tipo)

            cur.execute(
                f"""
                SELECT d.id, d.profesor_id, d.titulo, d.descripcion, d.nodos, d.tipo,
                       d.creado_en, d.vistas, d.publicado, d.instruccional_id,
                       d.enciclopedia_ref, u.nombre AS profesor_nombre
                FROM prof_diagramas d
                JOIN usuarios u ON u.id = d.profesor_id
                {where}
                ORDER BY d.creado_en DESC
                """,
                params
            )
            rows = cur.fetchall()
            items = []
            for r in rows:
                base = _diagrama_row_to_dict(r[:11])
                cur.execute('SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = %s', (r[0],))
                likes = cur.fetchone()[0]
                cur.execute(
                    'SELECT COUNT(*) FROM contenido_comentarios WHERE tipo = %s AND contenido_id = %s',
                    ('diagrama', r[0])
                )
                comentarios = cur.fetchone()[0]
                base['profesor_nombre'] = r[11]
                base['likes'] = likes
                base['comentarios_count'] = comentarios
                items.append(base)
        conn.close()
        return jsonify({'success': True, 'diagramas': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/public/diagramas/<int:diag_id>', methods=['GET'])
def public_diagrama_detalle(diag_id):
    usuario_id = request.args.get('usuario_id', type=int)
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                _DIAGRAMA_SELECT + """
                JOIN usuarios u ON u.id = d.profesor_id
                WHERE d.id = %s AND d.publicado = TRUE
                """,
                (diag_id,)
            )
            r = cur.fetchone()
            if not r:
                conn.close()
                return jsonify({'success': False, 'message': 'Diagrama no encontrado'}), 404

            cur.execute('SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = %s', (diag_id,))
            likes = cur.fetchone()[0]
            liked = False
            if usuario_id:
                cur.execute(
                    'SELECT 1 FROM diagrama_likes WHERE diagrama_id = %s AND usuario_id = %s',
                    (diag_id, usuario_id)
                )
                liked = cur.fetchone() is not None

            cur.execute(
                'SELECT COUNT(*) FROM contenido_comentarios WHERE tipo = %s AND contenido_id = %s',
                ('diagrama', diag_id)
            )
            comentarios = cur.fetchone()[0]

            cur.execute('SELECT nombre FROM usuarios WHERE id = %s', (r[1],))
            prof_row = cur.fetchone()
        conn.close()

        item = _diagrama_row_to_dict(r, {
            'profesor_nombre': prof_row[0] if prof_row else 'Profesor',
            'likes': likes,
            'liked': liked,
            'comentarios_count': comentarios,
        })
        return jsonify({'success': True, 'diagrama': item})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/diagramas/<int:diag_id>/like', methods=['POST'])
def toggle_diagrama_like(diag_id):
    data = request.get_json(silent=True) or {}
    usuario_id = data.get('usuario_id')
    if not usuario_id:
        return jsonify({'success': False, 'message': 'Falta usuario_id'}), 400
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM prof_diagramas WHERE id = %s', (diag_id,))
            if not cur.fetchone():
                conn.close()
                return jsonify({'success': False, 'message': 'Diagrama no encontrado'}), 404

            cur.execute(
                'SELECT 1 FROM diagrama_likes WHERE diagrama_id = %s AND usuario_id = %s',
                (diag_id, usuario_id)
            )
            if cur.fetchone():
                cur.execute(
                    'DELETE FROM diagrama_likes WHERE diagrama_id = %s AND usuario_id = %s',
                    (diag_id, usuario_id)
                )
                liked = False
            else:
                cur.execute(
                    'INSERT INTO diagrama_likes (diagrama_id, usuario_id) VALUES (%s, %s)',
                    (diag_id, usuario_id)
                )
                liked = True

            cur.execute('SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = %s', (diag_id,))
            likes_count = cur.fetchone()[0]
            conn.commit()
        conn.close()
        return jsonify({'success': True, 'liked': liked, 'likes_count': likes_count})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/contenido/<string:tipo>/<int:contenido_id>/reportar', methods=['POST'])
def reportar_contenido(tipo, contenido_id):
    if tipo not in _CONTENIDO_TIPOS:
        return jsonify({'success': False, 'message': 'Tipo inválido'}), 400
    data = request.get_json(silent=True) or {}
    usuario_id = data.get('usuario_id')
    motivo = (data.get('motivo') or '').strip()
    if not motivo:
        return jsonify({'success': False, 'message': 'Indica el motivo del reporte'}), 400
    if len(motivo) > 1000:
        return jsonify({'success': False, 'message': 'Máximo 1000 caracteres'}), 400

    tabla = _CONTENIDO_TABLAS.get(tipo)
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(f'SELECT id FROM {tabla} WHERE id = %s', (contenido_id,))
            if not cur.fetchone():
                conn.close()
                return jsonify({'success': False, 'message': 'Contenido no encontrado'}), 404

            cur.execute(
                """
                INSERT INTO contenido_reportes (tipo, contenido_id, usuario_id, motivo)
                VALUES (%s, %s, %s, %s)
                RETURNING id, creado_en
                """,
                (tipo, contenido_id, usuario_id, motivo)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'reporte': {'id': row[0], 'creado_en': row[1].isoformat()}
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/')
def root():
    return send_from_directory('.', 'login.html')


@app.route('/health')
def health():
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT NOW()')
            now = cur.fetchone()[0]
        conn.close()
        return jsonify({"ok": True, "time": str(now)})
    except Exception as error:
        return jsonify({"ok": False, "error": str(error)}), 500


@app.route('/api/forum/posts', methods=['GET'])
def get_forum_posts():
    hashtag_filter = (request.args.get('hashtag') or '').strip().lower()
    user_id = request.args.get('user_id', type=int)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            query = """
                SELECT fp.id, fp.usuario_id, u.nombre AS autor_nombre,
                       fp.mensaje, fp.hashtags, fp.imagen_url, fp.creado_en
                FROM foro_publicaciones fp
                JOIN usuarios u ON u.id = fp.usuario_id
            """
            params = []

            if hashtag_filter:
                query += " WHERE %s = ANY(fp.hashtags)"
                params.append(hashtag_filter)

            query += " ORDER BY fp.creado_en DESC LIMIT 100"
            cur.execute(query, params)
            rows = cur.fetchall()

            posts = []
            for row in rows:
                post_id = row[0]
                cur.execute('SELECT COUNT(*) FROM foro_likes WHERE post_id = %s', (post_id,))
                likes_count = cur.fetchone()[0]
                cur.execute('SELECT COUNT(*) FROM foro_respuestas WHERE post_id = %s', (post_id,))
                replies_count = cur.fetchone()[0]

                liked = False
                if user_id is not None:
                    cur.execute('SELECT 1 FROM foro_likes WHERE post_id = %s AND usuario_id = %s', (post_id, user_id))
                    liked = cur.fetchone() is not None

                cur.execute(
                    """
                    SELECT fr.id, fr.usuario_id, u.nombre AS autor_nombre, fr.mensaje, fr.creado_en
                    FROM foro_respuestas fr
                    JOIN usuarios u ON u.id = fr.usuario_id
                    WHERE fr.post_id = %s
                    ORDER BY fr.creado_en ASC
                    """,
                    (post_id,),
                )
                replies_rows = cur.fetchall()

                replies = [
                    {
                        "id": reply_row[0],
                        "user_id": reply_row[1],
                        "author_name": reply_row[2],
                        "message": reply_row[3],
                        "created_at": reply_row[4].isoformat() if reply_row[4] else None,
                    }
                    for reply_row in replies_rows
                ]

                posts.append({
                    "id": row[0],
                    "user_id": row[1],
                    "author_name": row[2],
                    "message": row[3],
                    "hashtags": row[4] or [],
                    "image_url": row[5],
                    "created_at": row[6].isoformat() if row[6] else None,
                    "likes_count": likes_count,
                    "liked": liked,
                    "replies": replies,
                    "replies_count": replies_count,
                })

        conn.close()
        return jsonify({"posts": posts})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/forum/posts', methods=['POST'])
def create_forum_post():
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        user_id = request.form.get('user_id', type=int)
        message = (request.form.get('message') or '').strip()
    else:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"success": False, "message": "JSON inválido"}), 400
        user_id = data.get('user_id')
        message = (data.get('message') or '').strip()

    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400
    if not message:
        return jsonify({"success": False, "message": "La publicación no puede estar vacía"}), 400

    image_url = None
    image_file = request.files.get('image')
    if image_file and image_file.filename:
        if not _allowed_file(image_file.filename, ALLOWED_IMAGE):
            return jsonify({"success": False, "message": "Formato de imagen no permitido"}), 400
        safe_name = f"{uuid.uuid4().hex}.{image_file.filename.rsplit('.', 1)[-1].lower()}"
        subfolder = os.path.join(UPLOAD_FOLDER, 'forum')
        os.makedirs(subfolder, exist_ok=True)
        filepath = os.path.join(subfolder, safe_name)
        image_file.save(filepath)
        image_url = f"/uploads/forum/{safe_name}"

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id, nombre FROM usuarios WHERE id = %s', (user_id,))
            user = cur.fetchone()

            if not user:
                conn.close()
                return jsonify({"success": False, "message": "Usuario no encontrado"}), 404

            hashtags = [tag.lower() for tag in re.findall(r'#([A-Za-z0-9_]+)', message)]
            cur.execute(
                """
                INSERT INTO foro_publicaciones (usuario_id, mensaje, hashtags, imagen_url)
                VALUES (%s, %s, %s, %s)
                RETURNING id, usuario_id, mensaje, hashtags, imagen_url, creado_en
                """,
                (user_id, message, hashtags, image_url),
            )
            row = cur.fetchone()
        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "post": {
                "id": row[0],
                "user_id": row[1],
                "message": row[2],
                "hashtags": row[3] or [],
                "image_url": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "author_name": user[1],
                "likes_count": 0,
                "liked": False,
                "replies": [],
                "replies_count": 0,
            }
        })
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/forum/posts/<int:post_id>/like', methods=['POST'])
def toggle_like(post_id):
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"success": False, "message": "JSON inválido"}), 400

    user_id = data.get('user_id')
    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM foro_publicaciones WHERE id = %s', (post_id,))
            post = cur.fetchone()

            if not post:
                conn.close()
                return jsonify({"success": False, "message": "Publicación no encontrada"}), 404

            cur.execute('SELECT 1 FROM foro_likes WHERE post_id = %s AND usuario_id = %s', (post_id, user_id))
            existing = cur.fetchone()

            if existing:
                cur.execute('DELETE FROM foro_likes WHERE post_id = %s AND usuario_id = %s', (post_id, user_id))
                liked = False
            else:
                cur.execute('INSERT INTO foro_likes (post_id, usuario_id) VALUES (%s, %s)', (post_id, user_id))
                liked = True

            cur.execute('SELECT COUNT(*) FROM foro_likes WHERE post_id = %s', (post_id,))
            likes_count = cur.fetchone()[0]

        conn.commit()
        conn.close()

        return jsonify({"success": True, "liked": liked, "likes_count": likes_count})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/forum/posts/<int:post_id>/replies', methods=['POST'])
def create_reply(post_id):
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"success": False, "message": "JSON inválido"}), 400

    user_id = data.get('user_id')
    message = (data.get('message') or '').strip()

    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400

    if not message:
        return jsonify({"success": False, "message": "La respuesta no puede estar vacía"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT usuario_id FROM foro_publicaciones WHERE id = %s', (post_id,))
            post = cur.fetchone()

            if not post:
                conn.close()
                return jsonify({"success": False, "message": "Publicación no encontrada"}), 404

            post_owner_id = post[0]
            cur.execute('SELECT id, nombre FROM usuarios WHERE id = %s', (user_id,))
            user = cur.fetchone()

            if not user:
                conn.close()
                return jsonify({"success": False, "message": "Usuario no encontrado"}), 404

            cur.execute(
                """
                INSERT INTO foro_respuestas (post_id, usuario_id, mensaje)
                VALUES (%s, %s, %s)
                RETURNING id, post_id, usuario_id, mensaje, creado_en
                """,
                (post_id, user_id, message),
            )
            row = cur.fetchone()

            if post_owner_id != user_id:
                cur.execute(
                    "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida)"
                    " VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                    (
                        post_owner_id,
                        'Respuesta en tu foro',
                        f'@{user[1]} respondió tu publicación en el foro.',
                        'forum',
                        'normal',
                        json.dumps({'post_id': post_id, 'reply_id': row[0]}),
                    ),
                )

        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "reply": {
                "id": row[0],
                "post_id": row[1],
                "user_id": row[2],
                "author_name": user[1],
                "message": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
            }
        })
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = request.args.get('user_id', type=int)

    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM notificaciones WHERE usuario_id = %s', (user_id,))
            notification_count = cur.fetchone()[0]

            if notification_count == 0:
                sample_notifications = [
                    (
                        user_id,
                        'Nuevo comentario',
                        'Tu publicación recibió una respuesta nueva en el foro.',
                        'forum',
                        'normal',
                        {'pill': 'Comunidad'},
                        False,
                    ),
                    (
                        user_id,
                        'Sugerencia de entrenamiento',
                        'Revisa tus ejercicios de movilidad para esta semana.',
                        'training',
                        'normal',
                        {'pill': 'Entrenamiento'},
                        False,
                    ),
                ]
                for notification in sample_notifications:
                    serialized_notification = (
                        notification[0],
                        notification[1],
                        notification[2],
                        notification[3],
                        notification[4],
                        json.dumps(notification[5]),
                        notification[6],
                    )
                    cur.execute(
                        """
                        INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                        """,
                        serialized_notification,
                    )
                conn.commit()

            cur.execute(
                """
                SELECT id, titulo, mensaje, tipo, prioridad, metadata, leida, creado_en
                FROM notificaciones
                WHERE usuario_id = %s
                ORDER BY creado_en DESC
                LIMIT 40
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        conn.close()

        notifications = []
        for row in rows:
            notifications.append({
                "id": row[0],
                "title": row[1],
                "message": row[2],
                "type": row[3],
                "priority": row[4],
                "metadata": row[5] or {},
                "read": row[6],
                "created_at": row[7].isoformat() if row[7] else None,
            })

        return jsonify({"notifications": notifications})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
def mark_notification_read(notification_id):
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')

    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notificaciones SET leida = TRUE WHERE id = %s AND usuario_id = %s RETURNING id",
                (notification_id, user_id),
            )
            updated = cur.fetchone()
        conn.commit()
        conn.close()

        if not updated:
            return jsonify({"success": False, "message": "Notificación no encontrada"}), 404

        return jsonify({"success": True})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/notifications/read-all', methods=['POST'])
def mark_all_notifications_read():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')

    if user_id is None:
        return jsonify({"success": False, "message": "Falta el usuario"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notificaciones SET leida = TRUE WHERE usuario_id = %s",
                (user_id,),
            )
        conn.commit()
        conn.close()

        return jsonify({"success": True})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json(silent=True)
    print('REGISTER PAYLOAD:', data)
    try:
        with open('register_payload.log', 'a', encoding='utf-8') as f:
            f.write(repr(data) + "\n")
    except Exception:
        pass

    if not data:
        return jsonify({"success": False, "message": "JSON inválido"}), 400

    nombre = (data.get('nombre') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password')
    rol = (data.get('rol') or '').strip()
    rango = (data.get('rango') or '').strip() or None
    metodo_pago = 'tarjeta'

    if not nombre or not email or not password or not rol:
        return jsonify({"success": False, "message": "Faltan campos obligatorios"}), 400

    allowed_roles = {'alumno'}

    if rol not in allowed_roles:
        return jsonify({"success": False, "message": "Rol inválido"}), 400

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    estado = 'activo'
    rango_final = rango if rol == 'alumno' else None

    try:
        # marker: start db insert
        try:
            with open('register_steps.log','a',encoding='utf-8') as f:
                f.write('start_insert\n')
        except Exception:
            pass

        conn = get_connection()
        with conn.cursor() as cur:
            try:
                with open('register_steps.log','a',encoding='utf-8') as f:
                    f.write('about_to_execute\n')
            except Exception:
                pass

            cur.execute(
                """
                INSERT INTO usuarios (nombre, email, password_hash, rol, rango, metodo_pago, estado)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, nombre, email, rol, rango, metodo_pago, estado, creado_en
                """,
                (nombre, email, password_hash, rol, rango_final, metodo_pago, estado),
            )
            row = cur.fetchone()

        try:
            with open('register_steps.log','a',encoding='utf-8') as f:
                f.write('fetched_row\n')
        except Exception:
            pass

        conn.commit()
        conn.close()

        try:
            with open('register_steps.log','a',encoding='utf-8') as f:
                f.write('committed\n')
        except Exception:
            pass

        return jsonify({"success": True, "user": {
            "id": row[0],
            "nombre": row[1],
            "email": row[2],
            "rol": row[3],
            "rango": row[4],
            "metodo_pago": row[5],
            "estado": row[6],
            "creado_en": row[7].isoformat(),
        }})
    except errors.UniqueViolation:
        return jsonify({"success": False, "message": "Ese correo ya está registrado"}), 409
    except Exception as error:
        # Imprimir traza en la salida para diagnóstico en desarrollo y escribirla en archivo
        tb = traceback.format_exc()
        print(tb)
        try:
            with open('register_error.log', 'a', encoding='utf-8') as f:
                f.write(tb + "\n")
        except Exception:
            pass
        return jsonify({"success": False, "message": str(error)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"success": False, "message": "JSON inválido"}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password')

    if not email or not password:
        return jsonify({"success": False, "message": "Correo y contraseña son obligatorios"}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, nombre, email, password_hash, rol, rango, metodo_pago, estado, creado_en
                FROM usuarios
                WHERE email = %s
                """,
                (email,),
            )
            row = cur.fetchone()

            if not row:
                nombre = email.split('@')[0].replace('.', ' ').replace('_', ' ').strip().title() or 'Usuario'
                password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cur.execute(
                    """
                    INSERT INTO usuarios (nombre, email, password_hash, rol, rango, metodo_pago, estado)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, nombre, email, password_hash, rol, rango, metodo_pago, estado, creado_en
                    """,
                    (nombre, email, password_hash, 'alumno', None, 'tarjeta', 'activo'),
                )
                row = cur.fetchone()
                conn.commit()
            else:
                stored_hash = row[3]
                is_valid = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))

                if not is_valid:
                    conn.close()
                    return jsonify({"success": False, "message": "Credenciales inválidas"}), 401

        conn.close()

        return jsonify({"success": True, "user": {
            "id": row[0],
            "nombre": row[1],
            "email": row[2],
            "rol": row[4],
            "rango": row[5],
            "metodo_pago": row[6],
            "estado": row[7],
            "creado_en": row[8].isoformat(),
        }})
    except Exception as error:
        return jsonify({"success": False, "message": "Error interno del servidor"}), 500
def _get_mod(mod_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM usuarios WHERE id = %s AND rol = 'moderador'",
                (mod_id,)
            )
            return cur.fetchone()
    finally:
        conn.close()


# ════════════════════════════════════════════════
#  USUARIOS — CRUD completo para moderador
# ════════════════════════════════════════════════

@app.route('/api/mod/usuarios', methods=['GET'])
def mod_get_usuarios():
    """Lista todos los usuarios de la plataforma."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, nombre, email, rol, rango, metodo_pago, estado, creado_en
                FROM usuarios
                ORDER BY creado_en DESC
                """
            )
            rows = cur.fetchall()
        conn.close()

        usuarios = [
            {
                'id':          r[0],
                'nombre':      r[1],
                'email':       r[2],
                'rol':         r[3],
                'rango':       r[4],
                'metodo_pago': r[5],
                'estado':      r[6],
                'creado_en':   r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
        return jsonify({'success': True, 'usuarios': usuarios})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/usuarios/<int:user_id>', methods=['PUT'])
def mod_update_usuario(user_id):
    """Actualiza nombre, email, rol, estado y/o rango de un usuario."""
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')

    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    nombre = (data.get('nombre') or '').strip()
    email  = (data.get('email')  or '').strip()
    rol    = (data.get('rol')    or '').strip()
    estado = (data.get('estado') or '').strip()
    rango  = data.get('rango')

    allowed_roles   = {'alumno', 'profesor', 'moderador'}
    allowed_estados = {'activo', 'pendiente', 'suspendido'}

    if rol    and rol    not in allowed_roles:
        return jsonify({'success': False, 'message': 'Rol inválido'}), 400
    if estado and estado not in allowed_estados:
        return jsonify({'success': False, 'message': 'Estado inválido'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            # Construir SET dinámico solo con campos enviados
            fields, values = [], []
            if nombre: fields.append('nombre = %s');      values.append(nombre)
            if email:  fields.append('email = %s');       values.append(email)
            if rol:    fields.append('rol = %s');         values.append(rol)
            if estado: fields.append('estado = %s');      values.append(estado)
            if rango is not None:
                fields.append('rango = %s');              values.append(rango)

            if not fields:
                conn.close()
                return jsonify({'success': False, 'message': 'Nada que actualizar'}), 400

            values.append(user_id)
            cur.execute(
                f"UPDATE usuarios SET {', '.join(fields)} WHERE id = %s RETURNING id",
                values
            )
            updated = cur.fetchone()
            conn.commit()
        conn.close()

        if not updated:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/usuarios/<int:user_id>', methods=['DELETE'])
def mod_delete_usuario(user_id):
    """Elimina un usuario (en cascada también su contenido)."""
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')

    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    # No permitir autoeliminarse
    if user_id == int(mod_id):
        return jsonify({'success': False, 'message': 'No puedes eliminarte a ti mismo'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('DELETE FROM usuarios WHERE id = %s RETURNING id', (user_id,))
            deleted = cur.fetchone()
            conn.commit()
        conn.close()

        if not deleted:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  CONTENIDO — lectura y borrado para moderador
# ════════════════════════════════════════════════

@app.route('/api/mod/videos', methods=['GET'])
def mod_get_videos():
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.id, v.profesor_id, u.nombre AS profesor_nombre,
                       v.titulo, v.categoria, v.dificultad,
                       v.hashtags, v.filename, v.creado_en
                FROM prof_videos v
                JOIN usuarios u ON u.id = v.profesor_id
                ORDER BY v.creado_en DESC
                """
            )
            rows = cur.fetchall()
        conn.close()
        return jsonify({'success': True, 'videos': [
            {
                'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                'titulo': r[3], 'categoria': r[4], 'dificultad': r[5],
                'hashtags': r[6] or [], 'filename': r[7],
                'creado_en': r[8].isoformat() if r[8] else None,
            } for r in rows
        ]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ── Endpoint público: últimos videos, imágenes e instruccionales ──────────────
# Usado por el dashboard del alumno en la pantalla de Inicio y Novedades.
# No requiere autenticación de moderador.
@app.route('/api/public/recientes', methods=['GET'])
def public_recientes():
    """
    Devuelve los últimos N videos, imágenes e instruccionales de todos los
    profesores. Acepta ?limit=N (default 12) y ?hashtag=TAG para filtrar.
    """
    limit   = min(request.args.get('limit', 12, type=int), 50)
    hashtag = (request.args.get('hashtag', '') or '').strip().lower().lstrip('#')

    try:
        conn = get_connection()
        with conn.cursor() as cur:

            # ── Videos ──
            if hashtag:
                cur.execute(
                    """
                    SELECT v.id, v.profesor_id, u.nombre,
                           v.titulo, v.categoria, v.dificultad,
                           v.hashtags, v.filename, v.creado_en, v.descripcion
                    FROM prof_videos v
                    JOIN usuarios u ON u.id = v.profesor_id
                    WHERE %s = ANY(v.hashtags)
                    ORDER BY v.creado_en DESC LIMIT %s
                    """,
                    (hashtag, limit)
                )
            else:
                cur.execute(
                    """
                    SELECT v.id, v.profesor_id, u.nombre,
                           v.titulo, v.categoria, v.dificultad,
                           v.hashtags, v.filename, v.creado_en, v.descripcion
                    FROM prof_videos v
                    JOIN usuarios u ON u.id = v.profesor_id
                    ORDER BY v.creado_en DESC LIMIT %s
                    """,
                    (limit,)
                )
            video_rows = cur.fetchall()

            # ── Imágenes ──
            if hashtag:
                cur.execute(
                    """
                    SELECT i.id, i.profesor_id, u.nombre,
                           i.titulo, i.tipo, i.hashtags, i.filename, i.creado_en, i.descripcion
                    FROM prof_imagenes i
                    JOIN usuarios u ON u.id = i.profesor_id
                    WHERE %s = ANY(i.hashtags)
                    ORDER BY i.creado_en DESC LIMIT %s
                    """,
                    (hashtag, limit)
                )
            else:
                cur.execute(
                    """
                    SELECT i.id, i.profesor_id, u.nombre,
                           i.titulo, i.tipo, i.hashtags, i.filename, i.creado_en, i.descripcion
                    FROM prof_imagenes i
                    JOIN usuarios u ON u.id = i.profesor_id
                    ORDER BY i.creado_en DESC LIMIT %s
                    """,
                    (limit,)
                )
            imagen_rows = cur.fetchall()

            # ── Instruccionales ──
            if hashtag:
                # instruccionales no tienen hashtags propios; buscar en título/descripción
                cur.execute(
                    """
                    SELECT i.id, i.profesor_id, u.nombre,
                           i.titulo, i.nivel, i.categoria,
                           i.videos_ids, i.creado_en, i.descripcion
                    FROM prof_instruccionales i
                    JOIN usuarios u ON u.id = i.profesor_id
                    WHERE lower(i.titulo) LIKE %s OR lower(i.descripcion) LIKE %s
                    ORDER BY i.creado_en DESC LIMIT %s
                    """,
                    (f'%{hashtag}%', f'%{hashtag}%', limit)
                )
            else:
                cur.execute(
                    """
                    SELECT i.id, i.profesor_id, u.nombre,
                           i.titulo, i.nivel, i.categoria,
                           i.videos_ids, i.creado_en, i.descripcion
                    FROM prof_instruccionales i
                    JOIN usuarios u ON u.id = i.profesor_id
                    ORDER BY i.creado_en DESC LIMIT %s
                    """,
                    (limit,)
                )
            inst_rows = cur.fetchall()

        conn.close()

        videos = [
            {
                'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                'titulo': r[3], 'categoria': r[4], 'dificultad': r[5],
                'hashtags': r[6] or [],
                'url': f'/uploads/videos/{r[1]}/{r[7]}',
                'creado_en': r[8].isoformat() if r[8] else None,
                'descripcion': r[9] or '',
            } for r in video_rows
        ]
        imagenes = [
            {
                'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                'titulo': r[3], 'tipo': r[4], 'hashtags': r[5] or [],
                'url': f'/uploads/imagenes/{r[1]}/{r[6]}',
                'creado_en': r[7].isoformat() if r[7] else None,
                'descripcion': r[8] or '',
            } for r in imagen_rows
        ]
        instruccionales = [
            {
                'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                'titulo': r[3], 'nivel': r[4], 'categoria': r[5],
                'videos_ids': r[6] or [],
                'creado_en': r[7].isoformat() if r[7] else None,
                'descripcion': r[8] or '',
            } for r in inst_rows
        ]

        return jsonify({
            'success': True,
            'videos': videos,
            'imagenes': imagenes,
            'instruccionales': instruccionales,
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ── Endpoint público: instruccionales con videos expandidos ───────────────────
# Usado por la sección Instruccionales del alumno. Devuelve cada instruccional
# con los datos completos de sus videos (título, url, dificultad).
@app.route('/api/public/instruccionales', methods=['GET'])
def public_instruccionales():
    """
    Devuelve todos los instruccionales con sus videos expandidos.
    Acepta ?nivel=basico|intermedio|avanzado y ?categoria=X para filtrar.
    """
    nivel     = request.args.get('nivel', '').strip()
    categoria = request.args.get('categoria', '').strip()

    try:
        conn = get_connection()
        with conn.cursor() as cur:

            where_clauses = []
            params = []
            if nivel:
                where_clauses.append('i.nivel = %s')
                params.append(nivel)
            if categoria:
                where_clauses.append('i.categoria = %s')
                params.append(categoria)

            where_sql = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''

            cur.execute(
                f"""
                SELECT i.id, i.profesor_id, u.nombre AS profesor_nombre,
                       i.titulo, i.descripcion, i.nivel, i.categoria,
                       i.videos_ids, i.creado_en
                FROM prof_instruccionales i
                JOIN usuarios u ON u.id = i.profesor_id
                {where_sql}
                ORDER BY i.creado_en DESC
                """,
                params
            )
            inst_rows = cur.fetchall()

            # Para cada instruccional expandir los videos
            result = []
            for r in inst_rows:
                videos_ids = r[7] or []
                videos_data = []
                if videos_ids:
                    cur.execute(
                        """
                        SELECT id, titulo, dificultad, categoria,
                               filename, profesor_id, descripcion
                        FROM prof_videos
                        WHERE id = ANY(%s)
                        ORDER BY id
                        """,
                        (videos_ids,)
                    )
                    for vr in cur.fetchall():
                        videos_data.append({
                            'id': vr[0], 'titulo': vr[1], 'dificultad': vr[2],
                            'categoria': vr[3],
                            'url': f'/uploads/videos/{vr[5]}/{vr[4]}',
                            'descripcion': vr[6] or '',
                        })

                result.append({
                    'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                    'titulo': r[3], 'descripcion': r[4] or '',
                    'nivel': r[5], 'categoria': r[6],
                    'videos': videos_data,
                    'creado_en': r[8].isoformat() if r[8] else None,
                })

        conn.close()
        return jsonify({'success': True, 'instruccionales': result})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/videos/<int:video_id>', methods=['GET'])
def get_video_detail(video_id):
    """
    Detalle de un video. Si se llama con ?registrar_vista=1 (y opcionalmente
    &usuario_id=<id>), incrementa el contador de visualizaciones del video
    y agrega una entrada al log de visualizaciones. Esto permite que el
    reproductor del alumno cuente una vista al abrir el video, sin afectar
    otras pantallas (moderador, edición del profesor) que solo consultan el
    detalle sin pasar ese parámetro.
    """
    registrar_vista = request.args.get('registrar_vista', '') in ('1', 'true', 'True')
    usuario_id      = request.args.get('usuario_id', type=int)

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.id, v.profesor_id, u.nombre AS profesor_nombre,
                       v.titulo, v.categoria, v.dificultad, v.descripcion,
                       v.hashtags, v.filename, v.creado_en, v.vistas
                FROM prof_videos v
                JOIN usuarios u ON u.id = v.profesor_id
                WHERE v.id = %s
                """,
                (video_id,)
            )
            row = cur.fetchone()

            if row and registrar_vista:
                cur.execute(
                    'UPDATE prof_videos SET vistas = vistas + 1 WHERE id = %s RETURNING vistas',
                    (video_id,)
                )
                nuevas_vistas = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO prof_visualizaciones
                        (contenido_tipo, contenido_id, profesor_id, usuario_id)
                    VALUES ('video', %s, %s, %s)
                    """,
                    (video_id, row[1], usuario_id)
                )
                conn.commit()
                row = row[:10] + (nuevas_vistas,)
        conn.close()

        if not row:
            return jsonify({'success': False, 'message': 'Video no encontrado'}), 404

        return jsonify({'success': True, 'video': {
            'id': row[0],
            'profesor_id': row[1],
            'profesor_nombre': row[2],
            'titulo': row[3],
            'categoria': row[4],
            'dificultad': row[5],
            'descripcion': row[6],
            'hashtags': row[7] or [],
            'video_url': f'/uploads/videos/{row[1]}/{row[8]}',
            'filename': row[8],
            'created_at': row[9].isoformat() if row[9] else None,
            'vistas': row[10] or 0,
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/videos/<int:video_id>/comments', methods=['GET', 'POST'])
def video_comments(video_id):
    if request.method == 'GET':
        try:
            conn = get_connection()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT vc.id, vc.usuario_id, u.nombre AS autor_nombre,
                           vc.mensaje, vc.creado_en
                    FROM video_comentarios vc
                    JOIN usuarios u ON u.id = vc.usuario_id
                    WHERE vc.video_id = %s
                    ORDER BY vc.creado_en ASC
                    """,
                    (video_id,)
                )
                rows = cur.fetchall()
            conn.close()
            return jsonify({'success': True, 'comments': [
                {
                    'id': r[0], 'user_id': r[1], 'author_name': r[2],
                    'message': r[3], 'created_at': r[4].isoformat() if r[4] else None,
                } for r in rows
            ]})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'JSON inválido'}), 400

    user_id = data.get('user_id')
    message = (data.get('message') or '').strip()
    if user_id is None:
        return jsonify({'success': False, 'message': 'Falta el usuario'}), 400
    if not message:
        return jsonify({'success': False, 'message': 'El comentario no puede estar vacío'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM prof_videos WHERE id = %s', (video_id,))
            if not cur.fetchone():
                conn.close()
                return jsonify({'success': False, 'message': 'Video no encontrado'}), 404

            cur.execute('SELECT id, nombre FROM usuarios WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

            cur.execute('SELECT profesor_id FROM prof_videos WHERE id = %s', (video_id,))
            owner = cur.fetchone()
            owner_id = owner[0] if owner else None

            cur.execute(
                """
                INSERT INTO video_comentarios (video_id, usuario_id, mensaje)
                VALUES (%s, %s, %s)
                RETURNING id, creado_en
                """,
                (video_id, user_id, message)
            )
            comment = cur.fetchone()

            if owner_id and owner_id != user_id:
                cur.execute(
                    "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida) "
                    "VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                    (
                        owner_id,
                        'Nuevo comentario',
                        f'@{user[1]} comentó tu video.',
                        'video',
                        'normal',
                        json.dumps({'video_id': video_id, 'comment_id': comment[0]}),
                    )
                )

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'comment': {
            'id': comment[0], 'user_id': user_id, 'author_name': user[1],
            'message': message, 'created_at': comment[1].isoformat() if comment[1] else None,
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    viewer_id = request.args.get('viewer_id', type=int)
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, nombre, email, rol, rango, metodo_pago, estado, creado_en
                FROM usuarios
                WHERE id = %s
                """,
                (user_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

            cur.execute('SELECT COUNT(*) FROM seguimientos WHERE seguido_id = %s', (user_id,))
            followers = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM seguimientos WHERE seguidor_id = %s', (user_id,))
            following = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM prof_videos WHERE profesor_id = %s', (user_id,))
            videos = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM prof_imagenes WHERE profesor_id = %s', (user_id,))
            imagenes = cur.fetchone()[0]

            is_following = False
            if viewer_id is not None:
                cur.execute(
                    'SELECT 1 FROM seguimientos WHERE seguidor_id = %s AND seguido_id = %s',
                    (viewer_id, user_id)
                )
                is_following = cur.fetchone() is not None
        conn.close()

        return jsonify({'success': True, 'profile': {
            'id': row[0], 'nombre': row[1], 'email': row[2], 'rol': row[3],
            'rango': row[4], 'metodo_pago': row[5], 'estado': row[6], 'created_at': row[7].isoformat() if row[7] else None,
            'followers_count': followers, 'following_count': following,
            'video_count': videos, 'imagen_count': imagenes,
            'is_following': is_following,
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user_profile(user_id):
    data = request.get_json(silent=True) or {}
    current_password = (data.get('current_password') or '').strip()
    if not current_password:
        return jsonify({'success': False, 'message': 'Contraseña actual requerida'}), 400

    nombre = (data.get('nombre') or '').strip()
    email = (data.get('email') or '').strip().lower()
    metodo_pago = (data.get('metodo_pago') or '').strip() or None
    rol = (data.get('rol') or '').strip()
    estado = (data.get('estado') or '').strip()
    new_password = (data.get('new_password') or '').strip()

    allowed_roles = {'alumno', 'profesor', 'moderador'}
    allowed_payment = {'tarjeta', 'paypal', 'transferencia'}

    if metodo_pago and metodo_pago not in allowed_payment:
        return jsonify({'success': False, 'message': 'Método de pago inválido'}), 400
    if rol and rol not in allowed_roles:
        return jsonify({'success': False, 'message': 'Rol inválido'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, password_hash, rol FROM usuarios WHERE id = %s',
                (user_id,)
            )
            user_row = cur.fetchone()
            if not user_row:
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

            if not bcrypt.checkpw(current_password.encode('utf-8'), user_row[1].encode('utf-8')):
                conn.close()
                return jsonify({'success': False, 'message': 'Contraseña incorrecta'}), 403

            fields = []
            values = []

            if nombre:
                fields.append('nombre = %s')
                values.append(nombre)
            if email:
                fields.append('email = %s')
                values.append(email)
            if metodo_pago:
                fields.append('metodo_pago = %s')
                values.append(metodo_pago)
            if new_password:
                new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                fields.append('password_hash = %s')
                values.append(new_hash)

            current_role = user_row[2]
            if rol == 'profesor' and current_role == 'alumno':
                fields.append('rol = %s')
                values.append('profesor')
                fields.append('estado = %s')
                values.append('pendiente')
                fields.append('rango = %s')
                values.append(None)
            elif rol == 'profesor' and current_role == 'profesor' and estado:
                # Un profesor activo o pendiente puede cambiar su estado si se solicita expresamente.
                fields.append('estado = %s')
                values.append(estado)
            elif rol and rol != current_role:
                # No permitir que un alumno baje a moderador ni haga cambios de rol arbitrarios.
                return jsonify({'success': False, 'message': 'No autorizado para cambiar este rol'}), 403

            if fields:
                fields.append('actualizado_en = NOW()')
                query = f"UPDATE usuarios SET {', '.join(fields)} WHERE id = %s RETURNING id, nombre, email, rol, rango, metodo_pago, estado, creado_en"
                values.append(user_id)
                cur.execute(query, tuple(values))
                updated = cur.fetchone()
                conn.commit()
            else:
                conn.close()
                return jsonify({'success': False, 'message': 'Nada que actualizar'}), 400

        conn.close()

        if not updated:
            return jsonify({'success': False, 'message': 'No se pudo actualizar el usuario'}), 500

        return jsonify({'success': True, 'user': {
            'id': updated[0], 'nombre': updated[1], 'email': updated[2],
            'rol': updated[3], 'rango': updated[4], 'metodo_pago': updated[5], 'estado': updated[6],
            'created_at': updated[7].isoformat() if updated[7] else None,
        }})
    except errors.UniqueViolation:
        return jsonify({'success': False, 'message': 'Ese correo ya está en uso'}), 409
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<int:target_id>/follow', methods=['POST', 'DELETE'])
def follow_user(target_id):
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if user_id is None:
        return jsonify({'success': False, 'message': 'Falta el usuario'}), 400
    if user_id == target_id:
        return jsonify({'success': False, 'message': 'No puedes seguirte a ti mismo'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM usuarios WHERE id = %s', (user_id,))
            if not cur.fetchone():
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
            cur.execute('SELECT id FROM usuarios WHERE id = %s', (target_id,))
            if not cur.fetchone():
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario objetivo no encontrado'}), 404

            if request.method == 'POST':
                cur.execute(
                    'INSERT INTO seguimientos (seguidor_id, seguido_id) VALUES (%s, %s) ON CONFLICT DO NOTHING',
                    (user_id, target_id)
                )
                cur.execute(
                    "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata, leida) "
                    "VALUES (%s, %s, %s, %s, %s, %s::jsonb, FALSE)",
                    (
                        target_id,
                        'Nuevo seguidor',
                        f'@{user_id} ahora te sigue.',
                        'social',
                        'normal',
                        json.dumps({'follower_id': user_id}),
                    )
                )
                conn.commit()
                conn.close()
                return jsonify({'success': True, 'following': True})

            cur.execute('DELETE FROM seguimientos WHERE seguidor_id = %s AND seguido_id = %s', (user_id, target_id))
            conn.commit()
        conn.close()
        return jsonify({'success': True, 'following': False})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/videos/<int:video_id>', methods=['DELETE'])
def mod_delete_video(video_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT filepath FROM prof_videos WHERE id = %s', (video_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Video no encontrado'}), 404
            cur.execute('DELETE FROM prof_videos WHERE id = %s', (video_id,))
            conn.commit()
        conn.close()
        if row[0] and os.path.exists(row[0]):
            os.remove(row[0])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/imagenes', methods=['GET'])
def mod_get_imagenes():
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT i.id, i.profesor_id, u.nombre AS profesor_nombre,
                       i.titulo, i.tipo, i.hashtags, i.filename, i.creado_en
                FROM prof_imagenes i
                JOIN usuarios u ON u.id = i.profesor_id
                ORDER BY i.creado_en DESC
                """
            )
            rows = cur.fetchall()
        conn.close()
        return jsonify({'success': True, 'imagenes': [
            {
                'id': r[0], 'profesor_id': r[1], 'profesor_nombre': r[2],
                'titulo': r[3], 'tipo': r[4], 'hashtags': r[5] or [],
                'filename': r[6],
                'creado_en': r[7].isoformat() if r[7] else None,
            } for r in rows
        ]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/imagenes/<int:imagen_id>', methods=['DELETE'])
def mod_delete_imagen(imagen_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT filepath FROM prof_imagenes WHERE id = %s', (imagen_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Imagen no encontrada'}), 404
            cur.execute('DELETE FROM prof_imagenes WHERE id = %s', (imagen_id,))
            conn.commit()
        conn.close()
        if row[0] and os.path.exists(row[0]):
            os.remove(row[0])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/instruccionales', methods=['GET'])
def mod_get_instruccionales():
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, profesor_id, titulo, nivel, categoria, videos_ids, creado_en
                FROM prof_instruccionales ORDER BY creado_en DESC
                """
            )
            rows = cur.fetchall()
        conn.close()
        return jsonify({'success': True, 'instruccionales': [
            {
                'id': r[0], 'profesor_id': r[1], 'titulo': r[2],
                'nivel': r[3], 'categoria': r[4],
                'videos_ids': r[5] or [],
                'creado_en': r[6].isoformat() if r[6] else None,
            } for r in rows
        ]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/instruccionales/<int:inst_id>', methods=['DELETE'])
def mod_delete_instruccional(inst_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM prof_instruccionales WHERE id = %s RETURNING id', (inst_id,)
            )
            deleted = cur.fetchone()
            conn.commit()
        conn.close()
        if not deleted:
            return jsonify({'success': False, 'message': 'No encontrado'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/foro/<int:post_id>', methods=['DELETE'])
def mod_delete_post(post_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            # Borrar likes y respuestas primero
            cur.execute('DELETE FROM foro_likes     WHERE post_id = %s', (post_id,))
            cur.execute('DELETE FROM foro_respuestas WHERE post_id = %s', (post_id,))
            cur.execute(
                'DELETE FROM foro_publicaciones WHERE id = %s RETURNING id', (post_id,)
            )
            deleted = cur.fetchone()
            conn.commit()
        conn.close()
        if not deleted:
            return jsonify({'success': False, 'message': 'Post no encontrado'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  PERFIL PROPIO — edición para cualquier rol
# ════════════════════════════════════════════════

@app.route('/api/mod/perfil', methods=['PUT'])
def mod_update_perfil():
    """
    Permite a cualquier usuario editar su propio perfil.
    Requiere contraseña actual para confirmar identidad.
    """
    data             = request.get_json(silent=True) or {}
    user_id          = data.get('user_id')
    nombre           = (data.get('nombre')          or '').strip()
    email            = (data.get('email')           or '').strip()
    password_actual  = data.get('password_actual',  '')
    password_nueva   = data.get('password_nueva',   None)

    if not user_id or not nombre or not email or not password_actual:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT password_hash FROM usuarios WHERE id = %s', (user_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

            # Verificar contraseña actual
            if not bcrypt.checkpw(password_actual.encode(), row[0].encode()):
                conn.close()
                return jsonify({'success': False, 'message': 'Contraseña actual incorrecta'}), 401

            # Actualizar
            if password_nueva:
                new_hash = bcrypt.hashpw(password_nueva.encode(), bcrypt.gensalt()).decode()
                cur.execute(
                    """
                    UPDATE usuarios SET nombre=%s, email=%s, password_hash=%s
                    WHERE id=%s
                    RETURNING id, nombre, email, rol, estado, creado_en
                    """,
                    (nombre, email, new_hash, user_id)
                )
            else:
                cur.execute(
                    """
                    UPDATE usuarios SET nombre=%s, email=%s
                    WHERE id=%s
                    RETURNING id, nombre, email, rol, estado, creado_en
                    """,
                    (nombre, email, user_id)
                )

            updated = cur.fetchone()
            conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'user': {
                'id':        updated[0],
                'nombre':    updated[1],
                'email':     updated[2],
                'rol':       updated[3],
                'estado':    updated[4],
                'creado_en': updated[5].isoformat() if updated[5] else None,
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  REGISTRO COMO MODERADOR (desde dashboard profesor)
#
#  Agrega esta variable de entorno a tu .env:
#  MOD_SECRET_CODE=tu_codigo_secreto
# ════════════════════════════════════════════════

MOD_SECRET_CODE = os.getenv('MOD_SECRET_CODE', 'luta2025mod')

@app.route('/api/register-moderador', methods=['POST'])
def register_moderador():
    """
    Convierte un usuario existente (profesor) en moderador
    si provee el código secreto correcto.
    """
    data    = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    codigo  = (data.get('codigo') or '').strip()

    if not user_id or not codigo:
        return jsonify({'success': False, 'message': 'Faltan campos obligatorios'}), 400

    if codigo != MOD_SECRET_CODE:
        return jsonify({'success': False, 'message': 'Código de autorización incorrecto'}), 403

    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE usuarios SET rol = 'moderador', estado = 'activo'
                WHERE id = %s
                RETURNING id, nombre, email, rol, estado
                """,
                (user_id,)
            )
            row = cur.fetchone()
            conn.commit()
        conn.close()

        if not row:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

        return jsonify({
            'success': True,
            'user': {
                'id':     row[0],
                'nombre': row[1],
                'email':  row[2],
                'rol':    row[3],
                'estado': row[4],
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ════════════════════════════════════════════════
#  DIAGRAMAS — moderación y estadísticas
# ════════════════════════════════════════════════

@app.route('/api/mod/diagramas', methods=['GET'])
def mod_get_diagramas():
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                _DIAGRAMA_SELECT + """
                JOIN usuarios u ON u.id = d.profesor_id
                ORDER BY d.creado_en DESC
                """
            )
            rows = cur.fetchall()
            items = []
            for r in rows:
                cur.execute('SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = %s', (r[0],))
                likes = cur.fetchone()[0]
                cur.execute(
                    'SELECT COUNT(*) FROM contenido_comentarios WHERE tipo = %s AND contenido_id = %s',
                    ('diagrama', r[0])
                )
                comentarios = cur.fetchone()[0]
                item = _diagrama_row_to_dict(r)
                item['profesor_nombre'] = None
                cur.execute('SELECT nombre FROM usuarios WHERE id = %s', (r[1],))
                pn = cur.fetchone()
                if pn:
                    item['profesor_nombre'] = pn[0]
                item['likes'] = likes
                item['comentarios_count'] = comentarios
                items.append(item)
        conn.close()
        return jsonify({'success': True, 'diagramas': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/diagramas/<int:diag_id>', methods=['DELETE'])
def mod_delete_diagrama(diag_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('DELETE FROM prof_diagramas WHERE id=%s RETURNING id', (diag_id,))
            deleted = cur.fetchone()
            conn.commit()
        conn.close()
        if not deleted:
            return jsonify({'success': False, 'message': 'No encontrado'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/estadisticas/diagramas', methods=['GET'])
def mod_estadisticas_diagramas():
    """Estadísticas agregadas de diagramas para el moderador."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM prof_diagramas')
            total = cur.fetchone()[0]

            cur.execute('SELECT COUNT(*) FROM prof_diagramas WHERE publicado = TRUE')
            publicados = cur.fetchone()[0]

            cur.execute('SELECT COALESCE(SUM(vistas), 0) FROM prof_diagramas')
            total_vistas = cur.fetchone()[0]

            cur.execute('SELECT COUNT(*) FROM diagrama_likes')
            total_likes = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM contenido_comentarios WHERE tipo = 'diagrama'"
            )
            total_comentarios = cur.fetchone()[0]

            cur.execute(
                """
                SELECT u.nombre, COUNT(d.id) AS cnt
                FROM prof_diagramas d
                JOIN usuarios u ON u.id = d.profesor_id
                GROUP BY u.nombre
                ORDER BY cnt DESC
                LIMIT 10
                """
            )
            top_autores = [{'autor': r[0], 'diagramas': r[1]} for r in cur.fetchall()]

            cur.execute(
                """
                SELECT d.titulo, d.vistas,
                       (SELECT COUNT(*) FROM diagrama_likes WHERE diagrama_id = d.id) AS likes
                FROM prof_diagramas d
                ORDER BY d.vistas DESC
                LIMIT 10
                """
            )
            top_vistas = [
                {'titulo': r[0], 'vistas': r[1], 'likes': r[2]} for r in cur.fetchall()
            ]

            cur.execute(
                """
                SELECT estado, COUNT(*) FROM contenido_reportes
                WHERE tipo = 'diagrama'
                GROUP BY estado
                """
            )
            reportes_por_estado = {r[0]: r[1] for r in cur.fetchall()}
        conn.close()

        return jsonify({
            'success': True,
            'estadisticas': {
                'total_diagramas': total,
                'publicados': publicados,
                'total_vistas': int(total_vistas),
                'total_likes': total_likes,
                'total_comentarios': total_comentarios,
                'top_autores': top_autores,
                'top_vistas': top_vistas,
                'reportes_por_estado': reportes_por_estado,
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/reportes-contenido', methods=['GET'])
def mod_get_reportes_contenido():
    estado = request.args.get('estado', '').strip()
    tipo   = request.args.get('tipo', '').strip()
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            where, params = [], []
            if estado:
                where.append('r.estado = %s')
                params.append(estado)
            if tipo:
                where.append('r.tipo = %s')
                params.append(tipo)
            where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

            cur.execute(
                f"""
                SELECT r.id, r.tipo, r.contenido_id, r.usuario_id, u.nombre,
                       r.motivo, r.estado, r.creado_en
                FROM contenido_reportes r
                LEFT JOIN usuarios u ON u.id = r.usuario_id
                {where_sql}
                ORDER BY r.creado_en DESC
                LIMIT 200
                """,
                params
            )
            rows = cur.fetchall()
        conn.close()
        return jsonify({
            'success': True,
            'reportes': [{
                'id': r[0], 'tipo': r[1], 'contenido_id': r[2],
                'usuario_id': r[3], 'usuario_nombre': r[4] or 'Anónimo',
                'motivo': r[5], 'estado': r[6],
                'creado_en': r[7].isoformat() if r[7] else None,
            } for r in rows]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/mod/reportes-contenido/<int:reporte_id>', methods=['PUT'])
def mod_update_reporte(reporte_id):
    data   = request.get_json(silent=True) or {}
    mod_id = data.get('mod_id')
    estado = (data.get('estado') or '').strip()
    if not mod_id or not _get_mod(mod_id):
        return jsonify({'success': False, 'message': 'No autorizado'}), 403
    if estado not in ('pendiente', 'revisado', 'descartado'):
        return jsonify({'success': False, 'message': 'Estado inválido'}), 400
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE contenido_reportes SET estado = %s WHERE id = %s RETURNING id',
                (estado, reporte_id)
            )
            updated = cur.fetchone()
            conn.commit()
        conn.close()
        if not updated:
            return jsonify({'success': False, 'message': 'Reporte no encontrado'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


if __name__ == '__main__':
    # DEBUG mode enabled temporarily to show full tracebacks in responses
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)), debug=True)