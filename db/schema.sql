-- Ojo al Tren: reportes compartidos. Lo crea solo la API la primera vez (o: npm run db:init).
-- No se guarda la ubicación de nadie: solo el tramo, el estado y si el GPS lo puso sobre la vía.
CREATE TABLE IF NOT EXISTS reportes (
  id        bigserial PRIMARY KEY,
  tramo     text        NOT NULL,
  estado    text        NOT NULL CHECK (estado IN ('normal', 'lento', 'detenido', 'sin_servicio')),
  motivo    text        CHECK (motivo IN ('afluencia', 'puertas', 'estacion', 'falla')),   -- opcional: por qué pasa
  ubicado   boolean     NOT NULL DEFAULT false,
  autor     text        NOT NULL,   -- hash del id anónimo del navegador (no se puede revertir)
  red_hash  text        NOT NULL,   -- hash de la IP con una sal que cambia cada día: solo para frenar abusos
  creado    timestamptz NOT NULL DEFAULT now()
);
-- para las tablas creadas antes de que existiera el motivo
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS motivo text CHECK (motivo IN ('afluencia', 'puertas', 'estacion', 'falla'));
CREATE INDEX IF NOT EXISTS reportes_creado ON reportes (creado);
CREATE INDEX IF NOT EXISTS reportes_red ON reportes (red_hash, creado);

-- Estaciones cerradas (el tren pasa pero no para), reportadas por los usuarios. Aparte de los tramos:
-- un cierre dura horas, así que cada reporte cuenta 60 min (ver estadoEstacion en lib/estado.js).
CREATE TABLE IF NOT EXISTS reportes_estacion (
  id        bigserial PRIMARY KEY,
  estacion  text        NOT NULL,
  estado    text        NOT NULL CHECK (estado IN ('cerrada', 'abierta')),
  ubicado   boolean     NOT NULL DEFAULT false,
  autor     text        NOT NULL,
  red_hash  text        NOT NULL,
  creado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reportes_estacion_creado ON reportes_estacion (creado);
