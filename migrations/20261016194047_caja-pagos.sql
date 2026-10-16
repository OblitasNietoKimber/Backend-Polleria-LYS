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
