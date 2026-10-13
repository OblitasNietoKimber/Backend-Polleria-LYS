BEGIN;
CREATE TABLE public.categorias (id text PRIMARY KEY, nombre text NOT NULL, descripcion text NOT NULL DEFAULT '', imagen text);
CREATE TABLE public.productos (
  id bigint PRIMARY KEY, categoria_id text NOT NULL REFERENCES public.categorias(id),
  nombre text NOT NULL, descripcion text NOT NULL DEFAULT '', imagen text,
  precio numeric(10,2) NOT NULL CHECK(precio >= 0), disponible boolean NOT NULL DEFAULT true
);
CREATE TABLE public.mesas (
  id bigint PRIMARY KEY, numero text NOT NULL UNIQUE, capacidad integer NOT NULL CHECK(capacidad > 0),
  forma text NOT NULL CHECK(forma IN ('redonda','cuadrada','rectangular','redonda_grande','banquete')),
  zona text NOT NULL, estado text NOT NULL DEFAULT 'libre' CHECK(estado IN ('libre','ocupada','reservada'))
);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.categorias, public.productos, public.mesas FROM PUBLIC, anon, authenticated;
COMMIT;
