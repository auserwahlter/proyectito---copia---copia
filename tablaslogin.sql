CREATE TABLE if not exists usuarios (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('miembro', 'moderador', 'admin')),
    rango VARCHAR(40),
    metodo_pago VARCHAR(30) NOT NULL DEFAULT 'tarjeta'
        CHECK (metodo_pago IN ('tarjeta', 'paypal', 'transferencia')),
    estado VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'pendiente', 'rechazado', 'suspendido')),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    modo_creador BOOLEAN NOT NULL DEFAULT FALSE,
    creador_desde TIMESTAMP,
    bio_creador TEXT,
    datos_cobro JSONB NOT NULL DEFAULT '{}'::jsonb,
    comision_personalizada NUMERIC(9,4)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);

CREATE TABLE IF NOT EXISTS foro_publicaciones (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_usuario_id ON foro_publicaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_foro_publicaciones_creado_en ON foro_publicaciones(creado_en DESC);


CREATE TABLE IF NOT EXISTS prof_videos (
    id          BIGSERIAL PRIMARY KEY,
    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    categoria   VARCHAR(60),
    dificultad  VARCHAR(30) NOT NULL DEFAULT 'basico'
                    CHECK (dificultad IN ('basico','intermedio','avanzado')),
    descripcion TEXT,
    hashtags    TEXT[] NOT NULL DEFAULT '{}',
    filename    TEXT NOT NULL,
    filepath    TEXT NOT NULL,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_videos_profesor_id
    ON prof_videos(profesor_id);
CREATE INDEX IF NOT EXISTS idx_prof_videos_categoria
    ON prof_videos(categoria);
CREATE INDEX IF NOT EXISTS idx_prof_videos_dificultad
    ON prof_videos(dificultad);

-- Imágenes técnicas del profesor
CREATE TABLE IF NOT EXISTS prof_imagenes (
    id          BIGSERIAL PRIMARY KEY,
    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    tipo        VARCHAR(40) NOT NULL DEFAULT 'diagrama'
                    CHECK (tipo IN ('diagrama','foto_posicion','captura','infografia','otro')),
    descripcion TEXT,
    hashtags    TEXT[] NOT NULL DEFAULT '{}',
    filename    TEXT NOT NULL,
    filepath    TEXT NOT NULL,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_imagenes_profesor_id
    ON prof_imagenes(profesor_id);

-- Instruccionales (cursos empaquetados)
CREATE TABLE IF NOT EXISTS prof_instruccionales (
    id          BIGSERIAL PRIMARY KEY,
    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    descripcion TEXT,
    nivel       VARCHAR(40) NOT NULL DEFAULT 'principiante'
                    CHECK (nivel IN ('principiante','intermedio','avanzado')),
    categoria   VARCHAR(60),
    videos_ids  BIGINT[] NOT NULL DEFAULT '{}',
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_instruccionales_profesor_id
    ON prof_instruccionales(profesor_id);

-- Diagramas interactivos (mapas de conocimiento BJJ)
CREATE TABLE IF NOT EXISTS prof_diagramas (
    id          BIGSERIAL PRIMARY KEY,
    profesor_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    descripcion TEXT,
    nodos       TEXT NOT NULL,
    tipo        VARCHAR(60) NOT NULL DEFAULT 'arbol_decision'
                    CHECK (tipo IN ('arbol_decision','flujo_posiciones',
                                    'sistema_juego','cadena_sumision')),
    vistas      BIGINT NOT NULL DEFAULT 0,
    publicado   BOOLEAN NOT NULL DEFAULT TRUE,
    instruccional_id BIGINT REFERENCES prof_instruccionales(id) ON DELETE SET NULL,
    enciclopedia_ref TEXT,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagrama_likes (
    id          BIGSERIAL PRIMARY KEY,
    diagrama_id BIGINT NOT NULL REFERENCES prof_diagramas(id) ON DELETE CASCADE,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(diagrama_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS contenido_reportes (
    id           BIGSERIAL PRIMARY KEY,
    tipo         VARCHAR(20) NOT NULL,
    contenido_id BIGINT NOT NULL,
    usuario_id   BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo       TEXT NOT NULL,
    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'revisado', 'descartado')),
    creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_diagramas_profesor_id
    ON prof_diagramas(profesor_id);