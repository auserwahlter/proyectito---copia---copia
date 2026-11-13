-- ============================================================
--  LUTA E DANÇA — FASE 0 · Migración de arquitectura
--
--  De jerarquía alumno/profesor  →  Plataforma abierta:
--    * Todos son 'miembro' (aprenden/consumen). Cualquiera sube
--      contenido; si quiere MONETIZAR activa su 'modo_creador'.
--    * Moderador pasa a ser rol de plataforma obtenido por
--      solicitud + votación de otros moderadores.
--    * Monetización: suscripción al creador y/o compra única por
--      contenido (pagos simulados con referencia 'SIM-####').
--    * Comisión de plataforma configurable (global y por usuario).
--    * Miniaturas de video: primer fotograma + portada editable.
--
--  Idempotente: puede ejecutarse varias veces sin error.
--  Ejecutar:  psql "$DATABASE_URL" -f migraciones.sql
-- ============================================================

BEGIN;

-- ╔═══════════════════════════════════════════════╗
-- ║ 1. USUARIOS — aplanar roles a plataforma       ║
-- ╚═══════════════════════════════════════════════╝

-- Asegurar la generación automática de IDs también en tablas creadas
-- con el esquema legado (que declaraba id sin DEFAULT).
CREATE SEQUENCE IF NOT EXISTS usuarios_id_seq;
ALTER SEQUENCE usuarios_id_seq OWNED BY usuarios.id;
ALTER TABLE usuarios ALTER COLUMN id SET DEFAULT nextval('usuarios_id_seq');
SELECT setval(
    'usuarios_id_seq',
    COALESCE(MAX(id), 1),
    MAX(id) IS NOT NULL
)
FROM usuarios;

-- 1.1 Nuevas columnas (antes de migrar datos)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS modo_creador           BOOLEAN          NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creador_desde          TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio_creador            TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS datos_cobro            JSONB            NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_personalizada NUMERIC(9,4);

CREATE INDEX IF NOT EXISTS idx_usuarios_modo_creador
    ON usuarios(modo_creador) WHERE modo_creador = TRUE;

-- 1.1b Soltar CHECKs legados de rol/estado ANTES de migrar datos
--      (el esquema viejo solo permitía alumno/profesor/moderador y
--       activo/pendiente/rechazado; 'miembro'/'suspendido' los violarían).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_estado_check;

-- 1.2 Migrar datos existentes
--     'profesor'  → 'miembro' pero conserva la capacidad de monetizar.
--     'alumno'    → 'miembro'.
--     'moderador' se conserva tal cual.
UPDATE usuarios
   SET rol = 'miembro',
       modo_creador = TRUE,
       creador_desde = COALESCE(creador_desde, creado_en)
 WHERE rol = 'profesor';

UPDATE usuarios
   SET rol = 'miembro'
 WHERE rol = 'alumno';

-- 1.3 Re-crear CHECK de rol por los roles de plataforma (ya no existe)
DO $do$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'usuarios_rol_check' AND conrelid = 'usuarios'::regclass
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_rol_check
            CHECK (rol IN ('miembro','moderador','admin'));
    END IF;
END $do$;

-- 1.4 Estado: permitir 'suspendido' (el moderador lo usa)
DO $do$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'usuarios_estado_check' AND conrelid = 'usuarios'::regclass
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_estado_check
            CHECK (estado IN ('activo','pendiente','rechazado','suspendido'));
    END IF;
END $do$;

-- ╔═══════════════════════════════════════════════╗
-- ║ 2. CONTENIDO — dueño genérico (autor_id)       ║
-- ╚═══════════════════════════════════════════════╝

-- 2.1 Renombrar columna dueño en las 4 tablas de contenido
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'prof_videos' AND column_name = 'profesor_id') THEN
        ALTER TABLE prof_videos RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'prof_imagenes' AND column_name = 'profesor_id') THEN
        ALTER TABLE prof_imagenes RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'prof_instruccionales' AND column_name = 'profesor_id') THEN
        ALTER TABLE prof_instruccionales RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'prof_diagramas' AND column_name = 'profesor_id') THEN
        ALTER TABLE prof_diagramas RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

-- 2.2 Renombrar índices que referenciaban al dueño
ALTER INDEX IF EXISTS idx_prof_videos_profesor_id           RENAME TO idx_prof_videos_autor_id;
ALTER INDEX IF EXISTS idx_prof_imagenes_profesor_id         RENAME TO idx_prof_imagenes_autor_id;
ALTER INDEX IF EXISTS idx_prof_instruccionales_profesor_id  RENAME TO idx_prof_instruccionales_autor_id;
ALTER INDEX IF EXISTS idx_prof_diagramas_profesor_id        RENAME TO idx_prof_diagramas_autor_id;

-- 2.3 Re-crear FKs con nombre limpio (la columna ahora es autor_id)
DO $do$
BEGIN
    ALTER TABLE prof_videos          DROP CONSTRAINT IF EXISTS prof_videos_profesor_id_fkey;
    ALTER TABLE prof_imagenes        DROP CONSTRAINT IF EXISTS prof_imagenes_profesor_id_fkey;
    ALTER TABLE prof_instruccionales DROP CONSTRAINT IF EXISTS prof_instruccionales_profesor_id_fkey;
    ALTER TABLE prof_diagramas       DROP CONSTRAINT IF EXISTS prof_diagramas_profesor_id_fkey;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prof_videos_autor_id_fkey' AND conrelid = 'prof_videos'::regclass
    ) THEN
        ALTER TABLE prof_videos
            ADD CONSTRAINT prof_videos_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prof_imagenes_autor_id_fkey' AND conrelid = 'prof_imagenes'::regclass
    ) THEN
        ALTER TABLE prof_imagenes
            ADD CONSTRAINT prof_imagenes_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prof_instruccionales_autor_id_fkey' AND conrelid = 'prof_instruccionales'::regclass
    ) THEN
        ALTER TABLE prof_instruccionales
            ADD CONSTRAINT prof_instruccionales_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prof_diagramas_autor_id_fkey' AND conrelid = 'prof_diagramas'::regclass
    ) THEN
        ALTER TABLE prof_diagramas
            ADD CONSTRAINT prof_diagramas_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;
END $do$;

-- 2.4 Comentarios y visualizaciones también usan dueño genérico
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'contenido_comentarios' AND column_name = 'profesor_id') THEN
        ALTER TABLE contenido_comentarios RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'prof_visualizaciones' AND column_name = 'profesor_id') THEN
        ALTER TABLE prof_visualizaciones RENAME COLUMN profesor_id TO autor_id;
    END IF;
END $do$;

ALTER INDEX IF EXISTS idx_cont_com_profesor                RENAME TO idx_cont_com_autor;
ALTER INDEX IF EXISTS idx_prof_visualizaciones_profesor_fecha RENAME TO idx_prof_visualizaciones_autor_fecha;

-- 2.5 Renombrar FKs de comentarios/visualizaciones por limpieza
DO $do$
BEGIN
    ALTER TABLE contenido_comentarios DROP CONSTRAINT IF EXISTS contenido_comentarios_profesor_id_fkey;
    ALTER TABLE prof_visualizaciones  DROP CONSTRAINT IF EXISTS prof_visualizaciones_profesor_id_fkey;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contenido_comentarios_autor_id_fkey' AND conrelid = 'contenido_comentarios'::regclass
    ) THEN
        ALTER TABLE contenido_comentarios
            ADD CONSTRAINT contenido_comentarios_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prof_visualizaciones_autor_id_fkey' AND conrelid = 'prof_visualizaciones'::regclass
    ) THEN
        ALTER TABLE prof_visualizaciones
            ADD CONSTRAINT prof_visualizaciones_autor_id_fkey
            FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE;
    END IF;
END $do$;

-- ╔═══════════════════════════════════════════════╗
-- ║ 3. MONETIZACIÓN del contenido                  ║
-- ╚═══════════════════════════════════════════════╝

-- 3.1 Videos: columnas de venta + miniaturas
ALTER TABLE prof_videos
    ADD COLUMN IF NOT EXISTS monetizado           BOOLEAN          NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio               NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tipo_venta           VARCHAR(20)      NOT NULL DEFAULT 'gratis',
    ADD COLUMN IF NOT EXISTS portada_path         TEXT,
    ADD COLUMN IF NOT EXISTS portada_personalizada BOOLEAN         NOT NULL DEFAULT FALSE;

-- 3.2 Imágenes
ALTER TABLE prof_imagenes
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(60),
    ADD COLUMN IF NOT EXISTS monetizado BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tipo_venta VARCHAR(20)  NOT NULL DEFAULT 'gratis';

-- 3.3 Instruccionales
ALTER TABLE prof_instruccionales
    ADD COLUMN IF NOT EXISTS monetizado BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tipo_venta VARCHAR(20)  NOT NULL DEFAULT 'gratis';

-- 3.3b Instruccionales: elementos asociados (video + imagen + diagrama)
ALTER TABLE prof_instruccionales
    ADD COLUMN IF NOT EXISTS imagenes_ids BIGINT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS diagrama_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE prof_instruccionales
    ADD COLUMN IF NOT EXISTS portada_path TEXT;

-- 3.3c Instruccionales: lecciones (secciones) con detalle por elemento
ALTER TABLE prof_instruccionales
    ADD COLUMN IF NOT EXISTS secciones JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3.4 Diagramas
ALTER TABLE prof_diagramas
    ADD COLUMN IF NOT EXISTS monetizado BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tipo_venta VARCHAR(20)  NOT NULL DEFAULT 'gratis';

DO $do$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'prof_videos'::regclass
          AND pg_get_constraintdef(oid) LIKE '%''gratis''%'
    ) THEN
        EXECUTE 'ALTER TABLE prof_videos ADD CONSTRAINT prof_videos_tipo_venta_check
                 CHECK (tipo_venta IN (''gratis'',''pago_unico'',''suscripcion''))';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'prof_imagenes'::regclass
          AND pg_get_constraintdef(oid) LIKE '%''gratis''%'
    ) THEN
        EXECUTE 'ALTER TABLE prof_imagenes ADD CONSTRAINT prof_imagenes_tipo_venta_check
                 CHECK (tipo_venta IN (''gratis'',''pago_unico'',''suscripcion''))';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'prof_instruccionales'::regclass
          AND pg_get_constraintdef(oid) LIKE '%''gratis''%'
    ) THEN
        EXECUTE 'ALTER TABLE prof_instruccionales ADD CONSTRAINT prof_instruccionales_tipo_venta_check
                 CHECK (tipo_venta IN (''gratis'',''pago_unico'',''suscripcion''))';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'prof_diagramas'::regclass
          AND pg_get_constraintdef(oid) LIKE '%''gratis''%'
    ) THEN
        EXECUTE 'ALTER TABLE prof_diagramas ADD CONSTRAINT prof_diagramas_tipo_venta_check
                 CHECK (tipo_venta IN (''gratis'',''pago_unico'',''suscripcion''))';
    END IF;
END $do$;

-- 3.4b Asegurar columnas que el backend heredado creaba al arrancar
--      (protege el caso de migrar un esquema creado solo con tablaslogin.sql)
ALTER TABLE prof_videos          ADD COLUMN IF NOT EXISTS vistas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE prof_imagenes        ADD COLUMN IF NOT EXISTS vistas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE prof_instruccionales ADD COLUMN IF NOT EXISTS vistas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE prof_diagramas
    ADD COLUMN IF NOT EXISTS vistas            BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS publicado         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS instruccional_id  BIGINT REFERENCES prof_instruccionales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enciclopedia_ref  TEXT;

-- 3.5 Unificar subidas de alumnos dentro de prof_videos (todos suben igual)
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'student_videos') THEN
        EXECUTE $q$
            INSERT INTO prof_videos
                (autor_id, titulo, categoria, dificultad, descripcion, hashtags,
                 filename, filepath, vistas, creado_en, monetizado, precio, tipo_venta)
            SELECT usuario_id, titulo, NULL, 'basico', descripcion, hashtags,
                   filename, filepath, vistas, creado_en, FALSE, NULL, 'gratis'
            FROM student_videos sv
            WHERE NOT EXISTS (
                SELECT 1 FROM prof_videos pv WHERE pv.filepath = sv.filepath
            )
        $q$;
        EXECUTE 'DROP TABLE IF EXISTS student_videos';
    END IF;
END $do$;

-- ╔═══════════════════════════════════════════════╗
-- ║ 4. MONETIZACIÓN — nuevas tablas                ║
-- ╚═══════════════════════════════════════════════╝

-- 4.1 Planes de suscripción por creador
CREATE TABLE IF NOT EXISTS planes_suscripcion (
    id             BIGSERIAL PRIMARY KEY,
    creador_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre         TEXT NOT NULL,
    descripcion    TEXT,
    precio         NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
    periodicidad   VARCHAR(10) NOT NULL DEFAULT 'mensual'
                       CHECK (periodicidad IN ('mensual','anual')),
    moneda         VARCHAR(3) NOT NULL DEFAULT 'USD',
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planes_suscripcion_creador
    ON planes_suscripcion(creador_id, activo);

-- 4.2 Suscripciones de usuarios a creadores
CREATE TABLE IF NOT EXISTS suscripciones (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creador_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plan_id     BIGINT REFERENCES planes_suscripcion(id) ON DELETE SET NULL,
    estado      VARCHAR(20) NOT NULL DEFAULT 'activa'
                    CHECK (estado IN ('activa','cancelada','vencida')),
    desde       TIMESTAMP NOT NULL DEFAULT NOW(),
    hasta       TIMESTAMP,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Solo una suscripción ACTIVA por (usuario, creador, plan) a la vez.
DROP INDEX IF EXISTS suscripciones_usuario_creador_plan_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_suscripcion_activa
    ON suscripciones(usuario_id, creador_id, plan_id) WHERE estado = 'activa';

CREATE INDEX IF NOT EXISTS idx_suscripciones_creador ON suscripciones(creador_id, estado);
CREATE INDEX IF NOT EXISTS idx_suscripciones_usuario ON suscripciones(usuario_id, estado);

-- 4.3 Compras únicas (checkout simulado → estado 'completada', ref 'SIM-####')
CREATE TABLE IF NOT EXISTS compras (
    id             BIGSERIAL PRIMARY KEY,
    comprador_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    contenido_tipo VARCHAR(20) NOT NULL
                       CHECK (contenido_tipo IN ('video','imagen','instruccional','diagrama')),
    contenido_id   BIGINT NOT NULL,
    monto          NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
    moneda         VARCHAR(3) NOT NULL DEFAULT 'USD',
    estado         VARCHAR(20) NOT NULL DEFAULT 'completada'
                       CHECK (estado IN ('pendiente','completada','reembolsada')),
    referencia     VARCHAR(32) NOT NULL UNIQUE,
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_comprador ON compras(comprador_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_compras_contenido ON compras(contenido_tipo, contenido_id);

-- 4.4 Ledger de ingresos del creador (con comisión efectiva por registro)
CREATE TABLE IF NOT EXISTS libro_pagos_creador (
    id                BIGSERIAL PRIMARY KEY,
    creador_id        BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    concepto          VARCHAR(40) NOT NULL CHECK (concepto IN ('compra','suscripcion')),
    compra_id         BIGINT REFERENCES compras(id) ON DELETE SET NULL,
    suscripcion_id    BIGINT REFERENCES suscripciones(id) ON DELETE SET NULL,
    monto_bruto       NUMERIC(12,2) NOT NULL,
    comision_efectiva NUMERIC(9,4) NOT NULL,
    monto_neto        NUMERIC(12,2) NOT NULL,
    estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','disponible','pagado')),
    creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_libro_pagos_creador_creador
    ON libro_pagos_creador(creador_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_libro_pagos_creador_estado
    ON libro_pagos_creador(estado, creado_en);

-- 4.5 Registro de accesos otorgados (auditoría + "mis cursos")
CREATE TABLE IF NOT EXISTS accesos (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    contenido_tipo  VARCHAR(20) NOT NULL
                        CHECK (contenido_tipo IN ('video','imagen','instruccional','diagrama')),
    contenido_id    BIGINT NOT NULL,
    via             VARCHAR(20) NOT NULL
                        CHECK (via IN ('gratis','compra','suscripcion','autor','plataforma')),
    ref_id          BIGINT,
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(usuario_id, contenido_tipo, contenido_id, via, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_accesos_usuario   ON accesos(usuario_id, contenido_tipo, contenido_id);
CREATE INDEX IF NOT EXISTS idx_accesos_contenido ON accesos(contenido_tipo, contenido_id);

-- ╔═══════════════════════════════════════════════╗
-- ║ 5. MODERACIÓN — solicitudes de rol + votos     ║
-- ╚═══════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS solicitudes_rol (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo        VARCHAR(20) NOT NULL DEFAULT 'moderador'
                    CHECK (tipo IN ('moderador')),
    motivo      TEXT,
    estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobada','rechazada')),
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
    resuelto_en TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_rol_estado ON solicitudes_rol(estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_solicitudes_rol_usuario ON solicitudes_rol(usuario_id);

CREATE TABLE IF NOT EXISTS votos_solicitud (
    id           BIGSERIAL PRIMARY KEY,
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes_rol(id) ON DELETE CASCADE,
    moderador_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    decision     VARCHAR(10) NOT NULL CHECK (decision IN ('aprobar','rechazar')),
    motivo       TEXT,
    creado_en    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(solicitud_id, moderador_id)
);

CREATE INDEX IF NOT EXISTS idx_votos_solicitud_solicitud ON votos_solicitud(solicitud_id);

-- ╔═══════════════════════════════════════════════╗
-- ║ 6. CONFIGURACIÓN DE PLATAFORMA (clave-valor)    ║
-- ╚═══════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS config_plataforma (
    clave VARCHAR(64) PRIMARY KEY,
    valor JSONB NOT NULL
);

-- Valores iniciales (solo se insertan si no existen):
INSERT INTO config_plataforma (clave, valor)
VALUES ('comision_global', '0.30'::jsonb)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO config_plataforma (clave, valor)
VALUES ('moneda_default', '"USD"'::jsonb)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO config_plataforma (clave, valor)
VALUES ('votos_moderador', '2'::jsonb)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO config_plataforma (clave, valor)
VALUES ('reglas_monetizacion', '{}'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ╔═══════════════════════════════════════════════╗
-- ║ 7. NORMALIZAR RUTAS DE ARCHIVO LEGADAS          ║
-- ╚═══════════════════════════════════════════════╝

-- El backend Flask guardaba filepath como "./uploads\videos\5\file.mp4".
-- El backend Node espera rutas relativas: "videos/5/file.mp4".
-- Esta normalización es idempotente (no altera rutas ya relativas).
UPDATE prof_videos
   SET filepath = regexp_replace(
                     regexp_replace(filepath, E'[\\\\/]+', '/', 'g'),
                     E'^(\\./)?uploads/',
                     '',
                     'i'
                  )
 WHERE filepath LIKE E'%uploads%' OR filepath LIKE E'.%';

UPDATE prof_imagenes
   SET filepath = regexp_replace(
                     regexp_replace(filepath, E'[\\\\/]+', '/', 'g'),
                     E'^(\\./)?uploads/',
                     '',
                     'i'
                  )
 WHERE filepath LIKE E'%uploads%' OR filepath LIKE E'.%';

-- ╔═══════════════════════════════════════════════╗
-- ║ 8. COMUNIDAD — foro, comentarios, likes,        ║
-- ║    reportes, notificaciones y seguimientos      ║
-- ╚═══════════════════════════════════════════════╝

-- Nota: si las tablas ya fueron creadas por el backend heredado,
-- este bloque es un no-op (CREATE TABLE IF NOT EXISTS) y solo
-- garantiza que existan con su FK hacia usuarios(id).

-- 8.1 Foro de la comunidad
CREATE TABLE IF NOT EXISTS foro_publicaciones (
    id             BIGSERIAL PRIMARY KEY,
    usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje        TEXT NOT NULL,
    hashtags       TEXT[] NOT NULL DEFAULT '{}',
    imagen_url     TEXT,
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_creado_en ON foro_publicaciones(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_usuario ON foro_publicaciones(usuario_id);

CREATE TABLE IF NOT EXISTS foro_likes (
    id         BIGSERIAL PRIMARY KEY,
    post_id    BIGINT NOT NULL REFERENCES foro_publicaciones(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_foro_likes_post ON foro_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_foro_likes_usuario ON foro_likes(usuario_id);

CREATE TABLE IF NOT EXISTS foro_respuestas (
    id         BIGSERIAL PRIMARY KEY,
    post_id    BIGINT NOT NULL REFERENCES foro_publicaciones(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje    TEXT NOT NULL,
    creado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foro_respuestas_post ON foro_respuestas(post_id);

-- 8.2 Notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    mensaje     TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'info',
    prioridad   TEXT NOT NULL DEFAULT 'normal',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    leida       BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida, creado_en DESC);

-- 8.3 Seguimientos entre usuarios
CREATE TABLE IF NOT EXISTS seguimientos (
    id          BIGSERIAL PRIMARY KEY,
    seguidor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    seguido_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(seguidor_id, seguido_id)
);

CREATE INDEX IF NOT EXISTS idx_seguimientos_seguidor ON seguimientos(seguidor_id);
CREATE INDEX IF NOT EXISTS idx_seguimientos_seguido ON seguimientos(seguido_id);

-- 8.4 Comentarios unificados de contenido (video/imagen/instruccional/diagrama)
CREATE TABLE IF NOT EXISTS contenido_comentarios (
    id           BIGSERIAL PRIMARY KEY,
    tipo         VARCHAR(20) NOT NULL,
    contenido_id BIGINT NOT NULL,
    autor_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    usuario_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    parent_id    BIGINT REFERENCES contenido_comentarios(id) ON DELETE CASCADE,
    mensaje      TEXT NOT NULL,
    creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cont_com_contenido ON contenido_comentarios(tipo, contenido_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_cont_com_parent ON contenido_comentarios(parent_id);
CREATE INDEX IF NOT EXISTS idx_cont_com_autor ON contenido_comentarios(autor_id, creado_en DESC);

-- 8.5 Likes unificados de contenido
CREATE TABLE IF NOT EXISTS contenido_likes (
    id           BIGSERIAL PRIMARY KEY,
    tipo         VARCHAR(20) NOT NULL
                   CHECK (tipo IN ('video','imagen','instruccional','diagrama')),
    contenido_id BIGINT NOT NULL,
    usuario_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tipo, contenido_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_contenido_likes_contenido ON contenido_likes(tipo, contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_likes_usuario ON contenido_likes(usuario_id);

-- 8.6 Reportes de contenido (cola de moderación)
CREATE TABLE IF NOT EXISTS contenido_reportes (
    id           BIGSERIAL PRIMARY KEY,
    tipo         VARCHAR(20) NOT NULL,
    contenido_id BIGINT NOT NULL,
    usuario_id   BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo       TEXT NOT NULL,
    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','revisado','descartado')),
    creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cont_reportes_estado ON contenido_reportes(estado, creado_en DESC);

-- 8.7 Compatibilidad con tablas heredadas: si las tablas de comunidad ya
-- existían con un esquema distinto (era Flask), añadimos aquí las columnas
-- nuevas que el backend Node necesita, de forma idempotente.
DO $do$
BEGIN
    -- notificaciones (tabular heredada puede no tener titulo/metadata/etc.)
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS titulo TEXT';
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT ''info''';
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT ''normal''';
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''::jsonb';
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS leida BOOLEAN DEFAULT FALSE';
    EXECUTE 'ALTER TABLE IF EXISTS notificaciones ADD COLUMN IF NOT EXISTS usuario_id BIGINT';

    -- contenido_comentarios (heredada con profesor_id -> autor_id)
    EXECUTE 'ALTER TABLE IF EXISTS contenido_comentarios ADD COLUMN IF NOT EXISTS tipo VARCHAR(20)';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_comentarios ADD COLUMN IF NOT EXISTS contenido_id BIGINT';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_comentarios ADD COLUMN IF NOT EXISTS usuario_id BIGINT';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_comentarios ADD COLUMN IF NOT EXISTS parent_id BIGINT';
    UPDATE contenido_comentarios SET usuario_id = autor_id WHERE usuario_id IS NULL;

    -- contenido_reportes
    EXECUTE 'ALTER TABLE IF EXISTS contenido_reportes ADD COLUMN IF NOT EXISTS tipo VARCHAR(20)';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_reportes ADD COLUMN IF NOT EXISTS contenido_id BIGINT';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_reportes ADD COLUMN IF NOT EXISTS usuario_id BIGINT';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_reportes ADD COLUMN IF NOT EXISTS motivo TEXT';
    EXECUTE 'ALTER TABLE IF EXISTS contenido_reportes ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT ''pendiente''';
END $do$;

COMMIT;