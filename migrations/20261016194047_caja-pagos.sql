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
CREATE FUNCTION public.registrar_cobro(
  p_pedido_id uuid, p_metodo text, p_recibido numeric,
  p_idempotencia uuid, p_total_esperado numeric, p_referencia text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pedido public.pedidos%ROWTYPE;
  pago public.pagos%ROWTYPE;
  mesa bigint;
  numero_mesa text;
  recibo jsonb;
  referencia text := NULLIF(btrim(p_referencia), '');
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(), '') NOT IN ('caja', 'admin') THEN
    RAISE EXCEPTION 'Solo caja o un administrador pueden registrar cobros' USING ERRCODE = '42501';
  END IF;
  IF p_idempotencia IS NULL OR p_metodo IS NULL OR p_metodo NOT IN ('efectivo','tarjeta','yape','plin')
     OR p_recibido IS NULL OR p_recibido::text IN ('NaN','Infinity','-Infinity')
     OR p_recibido <= 0 OR p_recibido >= 10000000000 OR p_recibido <> round(p_recibido, 2)
     OR p_total_esperado IS NULL OR p_total_esperado::text IN ('NaN','Infinity','-Infinity')
     OR p_total_esperado <= 0 OR p_total_esperado <> round(p_total_esperado, 2)
     OR char_length(COALESCE(referencia, '')) > 120 THEN
    RAISE EXCEPTION 'Método, importe o referencia de pago inválidos' USING ERRCODE = '22023';
  END IF;

  -- El orden mesa → pedido coincide con apertura y liberación de mesas.
  SELECT mesa_id INTO mesa FROM public.pedidos WHERE id = p_pedido_id;
  IF mesa IS NOT NULL THEN
    SELECT numero INTO numero_mesa FROM public.mesas WHERE id = mesa FOR UPDATE;
  END IF;
  SELECT * INTO pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF pedido.id IS NULL THEN
    RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO pago FROM public.pagos WHERE pedido_id = p_pedido_id;
  IF pago.id IS NOT NULL THEN
    IF pago.idempotencia = p_idempotencia AND pago.metodo = p_metodo
       AND pago.recibido = p_recibido AND pago.monto = p_total_esperado
       AND pago.referencia IS NOT DISTINCT FROM referencia AND pago.comprobante IS NOT NULL THEN
      RETURN pago.comprobante;
    END IF;
    RAISE EXCEPTION 'El pedido ya fue cobrado; actualiza la lista' USING ERRCODE = '23505';
  END IF;
  IF pedido.estado = 'cancelado' OR pedido.estado_pago = 'pagado' THEN
    RAISE EXCEPTION 'Este pedido no admite un cobro' USING ERRCODE = '22023';
  END IF;
  IF pedido.total <= 0 OR NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = pedido.id) THEN
    RAISE EXCEPTION 'No se puede cobrar un pedido sin productos' USING ERRCODE = '22023';
  END IF;
  IF pedido.total <> p_total_esperado THEN
    RAISE EXCEPTION 'El total cambió; actualiza el pedido antes de cobrar' USING ERRCODE = '40001';
  END IF;
  IF p_recibido < pedido.total OR (p_metodo <> 'efectivo' AND p_recibido <> pedido.total) THEN
    RAISE EXCEPTION 'El monto recibido no corresponde al total del pedido' USING ERRCODE = '22023';
  END IF;
  IF pedido.tipo = 'salon' AND (mesa IS NULL OR EXISTS (
    SELECT 1 FROM public.pedidos WHERE mesa_id = mesa AND tipo = 'salon' AND id <> pedido.id
      AND estado NOT IN ('entregado','cancelado')
  )) THEN
    RAISE EXCEPTION 'La mesa tiene otra atención activa; revisa el pedido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos(pedido_id, registrado_por, monto, metodo, referencia, recibido, vuelto, idempotencia)
  VALUES (pedido.id, auth.uid(), pedido.total, p_metodo, referencia, p_recibido,
    CASE WHEN p_metodo = 'efectivo' THEN p_recibido - pedido.total ELSE 0 END, p_idempotencia)
  RETURNING * INTO pago;

  UPDATE public.pedidos SET estado_pago = 'pagado', cuenta_solicitada = false,
    estado = CASE WHEN tipo = 'salon' THEN 'entregado' ELSE estado END WHERE id = pedido.id;
  IF pedido.tipo = 'salon' THEN
    UPDATE public.mesas SET estado = 'libre' WHERE id = mesa;
  END IF;

  recibo := jsonb_build_object(
    'id', pedido.id, 'codigo', pedido.id::text, 'mesa', numero_mesa, 'tipo', pedido.tipo,
    'cliente', COALESCE(NULLIF(pedido.destinatario->>'name', ''), 'Mesa ' || numero_mesa, 'Cliente'),
    'subtotal', pedido.subtotal, 'envio', pedido.envio, 'total', pago.monto,
    'estado', 'pagado', 'estadoPedido', CASE WHEN pedido.tipo = 'salon' THEN 'entregado' ELSE pedido.estado END,
    'createdAt', pedido.creado_en, 'pagadoAt', pago.creado_en,
    'items', (SELECT jsonb_agg(jsonb_build_object('id', producto_id, 'nombre', nombre_producto,
      'cantidad', cantidad, 'precio', precio_unitario) ORDER BY id) FROM public.detalles_pedido WHERE pedido_id = pedido.id),
    'pago', jsonb_build_object('id', pago.id, 'metodo', pago.metodo, 'monto', pago.recibido,
      'importe', pago.monto, 'vuelto', pago.vuelto, 'referencia', pago.referencia, 'registradoPor', pago.registrado_por)
  );
  UPDATE public.pagos SET comprobante = recibo WHERE id = pago.id;
  RETURN recibo;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_cobro(uuid,text,numeric,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_cobro(uuid,text,numeric,uuid,numeric,text) TO authenticated;
-- Bloquear cambios de comanda después del pago, incluso mediante escrituras directas.
CREATE FUNCTION public.proteger_detalle_cobrado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido_id uuid;
BEGIN
  FOR v_pedido_id IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.pedido_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.pedido_id END
  ]) AS pedidos(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM 1 FROM public.pedidos WHERE id = v_pedido_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = v_pedido_id) THEN
      RAISE EXCEPTION 'No se puede modificar la comanda de un pedido cobrado' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER detalle_cobrado BEFORE INSERT OR UPDATE OR DELETE ON public.detalles_pedido
FOR EACH ROW EXECUTE FUNCTION public.proteger_detalle_cobrado();

CREATE FUNCTION public.proteger_pedido_cobrado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.estado_pago = 'pagado' AND (
    NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.envio IS DISTINCT FROM OLD.envio
    OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.mesa_id IS DISTINCT FROM OLD.mesa_id
    OR NEW.estado_pago IS DISTINCT FROM OLD.estado_pago OR NEW.cuenta_solicitada IS DISTINCT FROM OLD.cuenta_solicitada
    OR NEW.destinatario IS DISTINCT FROM OLD.destinatario OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.estado = 'cancelado'
    OR (OLD.tipo = 'salon' AND NEW.estado IS DISTINCT FROM OLD.estado)
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar los importes ni reabrir un pedido cobrado' USING ERRCODE = '22023';
  END IF;
  IF (NEW.estado_pago = 'pagado' OR (NEW.tipo = 'salon' AND NEW.estado = 'entregado'))
     AND NOT EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = NEW.id) THEN
    RAISE EXCEPTION 'Confirma el pago en caja antes de cerrar la atención' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedido_cobrado BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.proteger_pedido_cobrado();

CREATE FUNCTION public.proteger_mesa_sin_pago() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'libre' AND EXISTS (
    SELECT 1 FROM public.pedidos WHERE mesa_id = NEW.id AND tipo = 'salon'
      AND estado NOT IN ('entregado','cancelado') AND estado_pago = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'La mesa tiene un pedido pendiente de pago' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mesa_sin_pago BEFORE UPDATE ON public.mesas
FOR EACH ROW EXECUTE FUNCTION public.proteger_mesa_sin_pago();
REVOKE ALL ON FUNCTION public.proteger_detalle_cobrado(), public.proteger_pedido_cobrado(), public.proteger_mesa_sin_pago() FROM PUBLIC;
