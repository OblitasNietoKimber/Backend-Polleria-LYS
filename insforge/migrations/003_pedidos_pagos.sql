BEGIN;
CREATE TABLE public.estados_pedido (codigo text PRIMARY KEY, nombre text NOT NULL);
INSERT INTO public.estados_pedido VALUES ('pendiente','Pendiente'),('en_preparacion','En preparación'),('listo','Listo'),('entregado','Entregado'),('cancelado','Cancelado');
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid REFERENCES public.perfiles(id),
  creado_por uuid NOT NULL REFERENCES public.perfiles(id), mesa_id bigint REFERENCES public.mesas(id),
  tipo text NOT NULL CHECK(tipo IN ('salon','delivery','recojo')),
  estado text NOT NULL DEFAULT 'pendiente' REFERENCES public.estados_pedido(codigo),
  direccion text, notas text, total numeric(10,2) NOT NULL CHECK(total >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'salon' AND mesa_id IS NOT NULL) OR (tipo <> 'salon' AND mesa_id IS NULL))
);
CREATE INDEX pedidos_cliente_idx ON public.pedidos(cliente_id);
CREATE INDEX pedidos_estado_idx ON public.pedidos(estado);
CREATE TABLE public.detalles_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id bigint NOT NULL REFERENCES public.productos(id), cantidad integer NOT NULL CHECK(cantidad > 0),
  precio_unitario numeric(10,2) NOT NULL CHECK(precio_unitario >= 0)
);
CREATE INDEX detalles_pedido_idx ON public.detalles_pedido(pedido_id);
CREATE TABLE public.pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
  registrado_por uuid NOT NULL REFERENCES public.perfiles(id), metodo text NOT NULL CHECK(metodo IN ('efectivo','tarjeta','yape','plin')),
  monto numeric(10,2) NOT NULL CHECK(monto > 0), referencia text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pagos_pedido_idx ON public.pagos(pedido_id);
ALTER TABLE public.estados_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estados_pedido, public.pedidos, public.detalles_pedido, public.pagos FROM PUBLIC, anon, authenticated;
COMMIT;
