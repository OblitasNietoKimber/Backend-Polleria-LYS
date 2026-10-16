-- Requiere la base de Login, Catálogo, Pedidos de Cliente y Meseras (001–012).
-- InsForge ejecuta este archivo completo en una transacción.
DO $$ BEGIN
  IF to_regprocedure('public.abrir_pedido_salon(uuid,bigint,integer,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero las migraciones de Meseras hasta 012_pedidos_salon.sql';
  END IF;
END; $$;
LOCK TABLE public.mesas, public.pedidos, public.detalles_pedido, public.pagos IN SHARE ROW EXCLUSIVE MODE;

-- Detener una instalación incompatible antes de modificar su esquema o sus datos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pagos GROUP BY pedido_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay pagos múltiples por pedido. Concílialos antes de habilitar caja.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos pago JOIN public.pedidos pedido ON pedido.id = pago.pedido_id
    WHERE pago.monto IS DISTINCT FROM pedido.total OR pedido.estado = 'cancelado') THEN
    RAISE EXCEPTION 'Hay pagos que no corresponden al total o al estado del pedido. Revisa las cuentas anteriores.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos pedido WHERE tipo = 'salon' AND estado = 'entregado'
    AND NOT EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = pedido.id)) THEN
    RAISE EXCEPTION 'Hay mesas cerradas sin un pago registrado. Concilia esas cuentas antes de habilitar caja.';
  END IF;
END;
$$;
-- Un cobro completo por pedido; las migraciones anteriores se conservan intactas.
ALTER TABLE public.pedidos ADD COLUMN estado_pago text NOT NULL DEFAULT 'pendiente'
  CHECK (estado_pago IN ('pendiente', 'pagado'));
ALTER TABLE public.pagos
  ALTER COLUMN monto TYPE numeric(12,2),
  ADD COLUMN recibido numeric(12,2),
  ADD COLUMN vuelto numeric(12,2),
  ADD COLUMN idempotencia uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN comprobante jsonb;
UPDATE public.pagos SET recibido = monto, vuelto = 0;
ALTER TABLE public.pagos
  ALTER COLUMN recibido SET NOT NULL,
  ALTER COLUMN vuelto SET NOT NULL,
  ADD CONSTRAINT pagos_recibido_valido CHECK (recibido >= monto AND recibido = monto + vuelto),
  ADD CONSTRAINT pagos_vuelto_valido CHECK (vuelto >= 0 AND (metodo = 'efectivo' OR vuelto = 0)),
  ADD CONSTRAINT pagos_pedido_unico UNIQUE (pedido_id),
  ADD CONSTRAINT pagos_idempotencia_unica UNIQUE (idempotencia);
UPDATE public.pedidos SET estado_pago = 'pagado'
WHERE EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = pedidos.id);
CREATE INDEX pedidos_pago_pendiente_idx ON public.pedidos(creado_en, id)
WHERE estado_pago = 'pendiente' AND estado <> 'cancelado';

-- El navegador no registra pagos ni modifica su información financiera.
REVOKE INSERT, UPDATE, DELETE ON public.pagos FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS pagos_crear ON public.pagos;

-- Sello ligero para detectar cambios sin volver a descargar todas las cuentas.
ALTER TABLE public.pedidos ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE FUNCTION public.actualizar_fecha_pedido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.actualizado_en := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER pedido_actualizado BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha_pedido();
REVOKE ALL ON FUNCTION public.actualizar_fecha_pedido() FROM PUBLIC, anon, authenticated;
CREATE INDEX pedidos_actualizado_idx ON public.pedidos(actualizado_en DESC);
