-- Entrega física independiente de cobro y cierre de atención.
-- Aplicar después de 20261115030000_servicio-directo-compatible.sql.
-- Bloque único: funciona tanto en el ejecutor como en el editor SQL.
DO $entrega_cocina$
BEGIN
LOCK TABLE public.mesas, public.pedidos, public.detalles_pedido, public.pagos IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.estados_pedido(codigo,nombre) VALUES ('en_camino','En camino') ON CONFLICT DO NOTHING;
ALTER TABLE public.pedidos
  ADD COLUMN cocina_entregado_en timestamptz,
  ADD COLUMN cocina_entregado_por uuid REFERENCES public.perfiles(id);
CREATE TABLE public.entregas_cocina (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  version_pedido timestamptz NOT NULL,
  entregado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  entregado_por uuid NOT NULL REFERENCES public.perfiles(id),
  preparado_en timestamptz,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  UNIQUE(pedido_id,version_pedido)
);
CREATE INDEX entregas_cocina_fecha_idx ON public.entregas_cocina(entregado_en DESC,id DESC);
ALTER TABLE public.entregas_cocina ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entregas_cocina FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.entregas_cocina TO authenticated;
CREATE POLICY entregas_cocina_personal ON public.entregas_cocina FOR SELECT TO authenticated
USING (public.rol_actual() IN ('cocina','admin'));
-- La tabla es un registro inmutable para el navegador. Incluye cada entrega de una comanda ampliada.
CREATE FUNCTION public.cantidades_entregadas_cocina(p_id uuid)
RETURNS TABLE(producto_id bigint,cantidad bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (item->>'producto_id')::bigint, sum((item->>'cantidad')::bigint)::bigint
  FROM public.entregas_cocina e CROSS JOIN LATERAL jsonb_array_elements(e.items) item
  WHERE e.pedido_id = p_id GROUP BY (item->>'producto_id')::bigint;
$$;
CREATE FUNCTION public.tiene_pendientes_cocina(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.detalles_pedido d
    LEFT JOIN public.cantidades_entregadas_cocina(p_id) e ON e.producto_id = d.producto_id
    WHERE d.pedido_id = p_id AND d.requiere_preparacion
    GROUP BY d.producto_id,e.cantidad HAVING sum(d.cantidad) > COALESCE(e.cantidad,0)
  );
$$;
REVOKE ALL ON FUNCTION public.cantidades_entregadas_cocina(uuid), public.tiene_pendientes_cocina(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cerrar_salon_si_completo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mesa bigint;
BEGIN
  -- El llamador bloquea siempre mesa → pedido antes de invocar esta función interna.
  UPDATE public.pedidos SET estado = 'entregado'
  WHERE id = p_id AND tipo = 'salon' AND estado = 'listo' AND estado_pago = 'pagado'
    AND NOT public.tiene_pendientes_cocina(p_id)
  RETURNING mesa_id INTO v_mesa;
  IF v_mesa IS NOT NULL THEN
    UPDATE public.mesas SET estado = 'libre', hora_reserva = NULL, cliente_reserva = NULL,
      telefono_reserva = NULL, comensales_reserva = NULL WHERE id = v_mesa;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cerrar_salon_si_completo(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.validar_transicion_cocina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol text := COALESCE(public.rol_actual(), '');
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  -- Las reparaciones administrativas sin sesión Auth mantienen su acceso previo.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (
    (OLD.estado = 'pendiente' AND NEW.estado = 'en_preparacion'
      AND (v_rol IN ('cocina','admin') OR (v_rol = 'mesera' AND NEW.tipo = 'salon')))
    OR (OLD.estado = 'en_preparacion' AND NEW.estado = 'listo' AND v_rol IN ('cocina','admin'))
    -- Los artículos de servicio directo nunca pasan por preparación.
    OR (OLD.estado IN ('pendiente','en_preparacion') AND NEW.estado = 'listo'
      AND v_rol IN ('cliente','mesera','cocina','admin')
      AND EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id)
      AND NOT public.tiene_pendientes_cocina(NEW.id))
    OR (OLD.estado = 'en_preparacion' AND NEW.estado = 'pendiente' AND NEW.tipo = 'salon'
      AND v_rol IN ('mesera','admin'))
    -- Una comanda lista que recibe platos nuevos vuelve al panel de cocina.
    OR (OLD.estado = 'listo' AND NEW.estado = 'pendiente' AND NEW.tipo = 'salon'
      AND v_rol IN ('mesera','admin'))
    -- La atención de salón termina cuando está cobrada y ya no quedan platos por entregar.
    OR (OLD.estado = 'listo' AND NEW.estado = 'entregado' AND NEW.tipo = 'salon'
      AND NEW.estado_pago = 'pagado' AND v_rol IN ('cocina','caja','mesera','admin')
      AND NOT public.tiene_pendientes_cocina(NEW.id))
    OR (OLD.estado = 'listo' AND NEW.estado = 'entregado' AND NEW.tipo = 'recojo'
      AND NEW.estado_pago = 'pagado' AND NEW.cocina_entregado_en IS NOT NULL
      AND v_rol IN ('cocina','admin'))
    OR (OLD.estado = 'listo' AND NEW.estado = 'en_camino' AND NEW.tipo = 'delivery'
      AND NEW.cocina_entregado_en IS NOT NULL AND v_rol IN ('cocina','admin')
      AND (NEW.estado_pago = 'pagado' OR NEW.metodo_solicitado = 'efectivo'))
    OR (OLD.estado = 'en_camino' AND NEW.estado = 'entregado' AND NEW.tipo = 'delivery'
      AND NEW.estado_pago = 'pagado' AND v_rol IN ('caja','admin'))
    OR (OLD.estado NOT IN ('entregado','cancelado') AND NEW.estado = 'cancelado' AND v_rol = 'admin')
    OR (OLD.estado = 'pendiente' AND NEW.estado = 'cancelado' AND v_rol = 'mesera'
      AND NEW.tipo = 'salon' AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id))
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Transición de estado no permitida: % → %', OLD.estado, NEW.estado USING ERRCODE = '22023';
  END IF;
  IF NEW.estado IN ('en_preparacion','listo') AND NOT EXISTS (
    SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id
  ) THEN RAISE EXCEPTION 'El pedido debe contener productos' USING ERRCODE = '22023'; END IF;
  IF NEW.estado = 'en_preparacion' AND NOT EXISTS (
    SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id AND requiere_preparacion
  ) THEN RAISE EXCEPTION 'El pedido no requiere preparación' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.proteger_pedido_cobrado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.estado_pago = 'pagado' AND (
    NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.envio IS DISTINCT FROM OLD.envio
    OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.mesa_id IS DISTINCT FROM OLD.mesa_id
    OR NEW.estado_pago IS DISTINCT FROM OLD.estado_pago OR NEW.cuenta_solicitada IS DISTINCT FROM OLD.cuenta_solicitada
    OR NEW.destinatario IS DISTINCT FROM OLD.destinatario OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.estado = 'cancelado'
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar los importes ni reabrir un pedido cobrado' USING ERRCODE = '22023';
  END IF;
  IF (NEW.estado_pago = 'pagado' OR (NEW.tipo = 'salon' AND NEW.estado = 'entregado'))
     AND NOT EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = NEW.id) THEN
    RAISE EXCEPTION 'Confirma el pago en caja antes de cerrar la atención' USING ERRCODE = '22023';
  END IF;
  IF OLD.estado_pago = 'pagado' AND OLD.tipo = 'salon' AND NEW.estado IS DISTINCT FROM OLD.estado
    AND NOT ((OLD.estado = 'pendiente' AND NEW.estado = 'en_preparacion')
      OR (OLD.estado = 'en_preparacion' AND NEW.estado = 'listo')
      OR (OLD.estado = 'listo' AND NEW.estado = 'entregado' AND NOT public.tiene_pendientes_cocina(NEW.id))) THEN
    RAISE EXCEPTION 'No se puede reabrir ni cerrar antes de entregar un pedido cobrado' USING ERRCODE = '22023';
  END IF;
  IF OLD.estado_pago = 'pagado' AND OLD.estado IN ('entregado','cancelado')
    AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'No se puede reabrir un pedido cobrado' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.proteger_mesa_sin_pago() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'libre' AND EXISTS (
    SELECT 1 FROM public.pedidos WHERE mesa_id = NEW.id AND tipo = 'salon'
      AND estado NOT IN ('entregado','cancelado')
  ) THEN
    RAISE EXCEPTION 'La mesa tiene un pedido pendiente de pago o de entrega' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.registrar_cobro(
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

  UPDATE public.pedidos SET estado_pago = 'pagado', cuenta_solicitada = false WHERE id = pedido.id;
  PERFORM public.cerrar_salon_si_completo(pedido.id);
  SELECT * INTO pedido FROM public.pedidos WHERE id = pedido.id;

  recibo := jsonb_build_object(
    'id', pedido.id, 'codigo', pedido.id::text, 'mesa', numero_mesa, 'tipo', pedido.tipo,
    'cliente', COALESCE(NULLIF(pedido.destinatario->>'name', ''), 'Mesa ' || numero_mesa, 'Cliente'),
    'subtotal', pedido.subtotal, 'envio', pedido.envio, 'total', pago.monto,
    'estado', 'pagado', 'estadoPedido', pedido.estado,
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
CREATE FUNCTION public.entregar_pedido_cocina(p_pedido_id uuid, p_actualizado_en timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE; v_mesa bigint; v_items jsonb; v_preparado timestamptz;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'') NOT IN ('cocina','admin') THEN
    RAISE EXCEPTION 'Solo cocina o administración pueden entregar pedidos' USING ERRCODE = '42501';
  END IF;
  SELECT mesa_id INTO v_mesa FROM public.pedidos WHERE id = p_pedido_id;
  IF v_mesa IS NOT NULL THEN PERFORM 1 FROM public.mesas WHERE id = v_mesa FOR UPDATE; END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = '22023'; END IF;
  -- Reintentar la misma versión no entrega dos veces ni toca una mesa reutilizada.
  IF EXISTS (SELECT 1 FROM public.entregas_cocina WHERE pedido_id = p_pedido_id AND version_pedido = p_actualizado_en) THEN
    RETURN p_pedido_id;
  END IF;
  IF p_actualizado_en IS DISTINCT FROM v_pedido.actualizado_en THEN
    RAISE EXCEPTION 'Otro usuario cambió el pedido. Actualiza el panel.' USING ERRCODE = '40001';
  END IF;
  IF v_pedido.estado <> 'listo' OR v_pedido.cocina_entregado_en IS NOT NULL
    OR NOT public.tiene_pendientes_cocina(p_pedido_id) THEN
    RAISE EXCEPTION 'El pedido no está listo para entregar' USING ERRCODE = '22023';
  END IF;
  IF v_pedido.tipo = 'recojo' AND v_pedido.estado_pago <> 'pagado' THEN
    RAISE EXCEPTION 'Confirma el pago en caja antes de entregar el pedido para llevar' USING ERRCODE = '22023';
  END IF;
  IF v_pedido.tipo = 'delivery' AND v_pedido.estado_pago <> 'pagado' AND v_pedido.metodo_solicitado IS DISTINCT FROM 'efectivo' THEN
    RAISE EXCEPTION 'Confirma el pago en caja; solo efectivo permite pago contra entrega' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('producto_id',d.producto_id,'nombre_producto',d.nombre_producto,
    'cantidad',d.cantidad - COALESCE(e.cantidad,0)) ORDER BY d.producto_id)
  INTO v_items FROM (
    SELECT producto_id,max(nombre_producto) AS nombre_producto,sum(cantidad) AS cantidad
    FROM public.detalles_pedido WHERE pedido_id = p_pedido_id AND requiere_preparacion GROUP BY producto_id
  ) d LEFT JOIN public.cantidades_entregadas_cocina(p_pedido_id) e USING(producto_id)
  WHERE d.cantidad > COALESCE(e.cantidad,0);
  SELECT cambiado_en INTO v_preparado FROM public.historial_estados_pedido
  WHERE pedido_id = p_pedido_id AND estado = 'listo' AND NOT es_reconstruido ORDER BY id DESC LIMIT 1;
  INSERT INTO public.entregas_cocina(pedido_id,version_pedido,entregado_por,preparado_en,items)
  VALUES(p_pedido_id,p_actualizado_en,auth.uid(),v_preparado,v_items);
  UPDATE public.pedidos SET cocina_entregado_en = clock_timestamp(), cocina_entregado_por = auth.uid(),
    estado = CASE tipo WHEN 'delivery' THEN 'en_camino' WHEN 'recojo' THEN 'entregado' ELSE estado END
  WHERE id = p_pedido_id;
  PERFORM public.cerrar_salon_si_completo(p_pedido_id);
  RETURN p_pedido_id;
END;
$$;
REVOKE ALL ON FUNCTION public.entregar_pedido_cocina(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.entregar_pedido_cocina(uuid,timestamptz) TO authenticated;
CREATE FUNCTION public.confirmar_entrega_delivery(p_pedido_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'') NOT IN ('caja','admin') THEN
    RAISE EXCEPTION 'Solo caja o administración pueden confirmar la entrega al cliente' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND OR v_pedido.tipo <> 'delivery' THEN RAISE EXCEPTION 'El pedido no es delivery' USING ERRCODE = '22023'; END IF;
  IF v_pedido.estado = 'entregado' THEN RETURN p_pedido_id; END IF;
  IF v_pedido.estado <> 'en_camino' OR v_pedido.estado_pago <> 'pagado' THEN
    RAISE EXCEPTION 'Confirma el cobro y la salida a reparto antes de completar la entrega' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pedidos SET estado = 'entregado' WHERE id = p_pedido_id;
  RETURN p_pedido_id;
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_entrega_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_entrega_delivery(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ajustar_estado_servicio(p_id uuid, p_reabrir boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_estado text; v_items boolean; v_cocina boolean;
BEGIN
  SELECT estado INTO v_estado FROM public.pedidos WHERE id = p_id FOR UPDATE;
  IF v_estado IS NULL OR v_estado IN ('entregado','cancelado') THEN RETURN; END IF;
  SELECT count(*) > 0, public.tiene_pendientes_cocina(p_id)
  INTO v_items, v_cocina FROM public.detalles_pedido WHERE pedido_id = p_id;
  IF v_items AND NOT v_cocina THEN
    IF v_estado IN ('pendiente','en_preparacion') THEN
      UPDATE public.pedidos SET estado = 'listo' WHERE id = p_id;
    END IF;
  ELSIF (v_estado = 'listo' AND (p_reabrir OR NOT v_items))
    OR (v_estado = 'en_preparacion' AND p_reabrir) THEN
    UPDATE public.pedidos SET estado = 'pendiente' WHERE id = p_id;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.agregar_o_modificar_detalles_salon(
  p_pedido_id uuid,
  p_articulos jsonb,
  p_notas text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_pedido public.pedidos%ROWTYPE;
  v_linea jsonb;
  v_producto public.productos%ROWTYPE;
  v_antes jsonb;
  v_despues jsonb;
  v_entregado record;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden modificar pedidos de salón' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id AND tipo = 'salon' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o no es de salón' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado_pago = 'pagado' THEN
    RAISE EXCEPTION 'No se puede modificar un pedido cobrado' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede modificar un pedido finalizado o cancelado' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_array(producto_id,cantidad) ORDER BY producto_id), '[]'::jsonb)
  INTO v_antes FROM public.detalles_pedido WHERE pedido_id = p_pedido_id AND requiere_preparacion;

  IF p_notas IS NOT NULL THEN
    UPDATE public.pedidos SET notas = btrim(p_notas) WHERE id = p_pedido_id;
  END IF;

  IF p_articulos IS NOT NULL AND jsonb_typeof(p_articulos) = 'array' THEN
    DELETE FROM public.detalles_pedido WHERE pedido_id = p_pedido_id;

    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_articulos) LOOP
      IF jsonb_typeof(v_linea) IS DISTINCT FROM 'object'
        OR COALESCE(v_linea->>'id','') !~ '^[1-9][0-9]{0,17}$'
        OR COALESCE(v_linea->>'qty','') !~ '^[1-9][0-9]{0,2}$' THEN
        RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_producto FROM public.productos
      WHERE id = (v_linea->>'id')::bigint AND disponible FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario)
      VALUES (p_pedido_id, v_producto.id, (v_linea->>'qty')::integer, v_producto.precio);
    END LOOP;
  END IF;

  -- No borrar de la cuenta cantidades que ya fueron entregadas físicamente.
  FOR v_entregado IN SELECT * FROM public.cantidades_entregadas_cocina(p_pedido_id) LOOP
    IF COALESCE((SELECT sum(cantidad) FROM public.detalles_pedido
      WHERE pedido_id = p_pedido_id AND producto_id = v_entregado.producto_id), 0) < v_entregado.cantidad THEN
      RAISE EXCEPTION 'No se pueden retirar platos ya entregados de la comanda' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF public.tiene_pendientes_cocina(p_pedido_id) THEN
    UPDATE public.pedidos SET cocina_entregado_en = NULL, cocina_entregado_por = NULL WHERE id = p_pedido_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_array(producto_id,cantidad) ORDER BY producto_id), '[]'::jsonb)
  INTO v_despues FROM public.detalles_pedido WHERE pedido_id = p_pedido_id AND requiere_preparacion;
  PERFORM public.ajustar_estado_servicio(p_pedido_id, v_antes IS DISTINCT FROM v_despues);
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.obtener_mesas_con_pedidos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.rol_actual() NOT IN ('mesera', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Acceso restringido al personal autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'numero', m.numero,
      'capacidad', m.capacidad,
      'forma', m.forma,
      'zona', m.zona,
      'estado', CASE
        WHEN p.id IS NOT NULL THEN 'ocupada'
        ELSE m.estado
      END,
      'hora_reserva', m.hora_reserva,
      'cliente_reserva', m.cliente_reserva,
      'telefono_reserva', m.telefono_reserva,
      'comensales_reserva', m.comensales_reserva,
      'pedido_id', p.id,
      'pedido_estado', p.estado,
      'estado_pago', p.estado_pago,
      'cocina_entregado_en', p.cocina_entregado_en,
      'cuenta_solicitada', COALESCE(p.cuenta_solicitada, false),
      'comensales', COALESCE(p.comensales, m.capacidad),
      'subtotal', COALESCE(p.subtotal, 0),
      'total', COALESCE(p.total, 0),
      'notas', COALESCE(p.notas, ''),
      'creado_en', p.creado_en,
      'items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'producto_id', d.producto_id,
            'nombre', d.nombre_producto,
            'cantidad', d.cantidad,
            'precio', d.precio_unitario,
            'subtotal', (d.cantidad * d.precio_unitario)
          ) ORDER BY d.id
        ) FROM public.detalles_pedido d WHERE d.pedido_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY m.id
  ) INTO v_resultado
  FROM public.mesas m
  LEFT JOIN LATERAL (
    SELECT p2.* FROM public.pedidos p2
    WHERE p2.mesa_id = m.id AND p2.tipo = 'salon' AND p2.estado NOT IN ('entregado', 'cancelado')
    ORDER BY p2.creado_en DESC LIMIT 1
  ) p ON true;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION public.liberar_mesa_salon(
  p_mesa_id bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
  v_estado_anterior text;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden liberar mesas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  v_estado_anterior := v_mesa.estado;

  -- Si tenía un pedido pendiente sin detalles (comanda vacía), cancelarlo
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE mesa_id = p_mesa_id AND tipo = 'salon'
    AND estado NOT IN ('entregado','cancelado') AND (total > 0 OR estado <> 'pendiente')) THEN
    RAISE EXCEPTION 'La mesa tiene un pedido pendiente de pago o de entrega' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pedidos SET estado = 'cancelado'
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado = 'pendiente'
    AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = public.pedidos.id);

  -- 2. Restaurar la mesa a libre y limpiar cualquier reserva
  UPDATE public.mesas
  SET estado = 'libre',
      hora_reserva = NULL,
      cliente_reserva = NULL,
      telefono_reserva = NULL,
      comensales_reserva = NULL
  WHERE id = p_mesa_id;

  -- 3. Registrar actividad en la tabla permanente
  INSERT INTO public.actividades_salon (
    mesa_id, mesa_numero, tipo, tipo_color, titulo, descripcion, orden_codigo, creado_por
  ) VALUES (
    p_mesa_id,
    v_mesa.numero,
    CASE WHEN v_estado_anterior = 'reservada' THEN 'reserva' ELSE 'pedido_completado' END,
    CASE WHEN v_estado_anterior = 'reservada' THEN 'amarillo' ELSE 'verde' END,
    'Mesa ' || v_mesa.numero,
    CASE WHEN v_estado_anterior = 'reservada' THEN 'Reserva cancelada · Mesa liberada' ELSE 'Mesa liberada manualmente' END,
    CASE WHEN v_estado_anterior = 'reservada' THEN 'Cancelada' ELSE '' END,
    v_usuario
  );

  RETURN true;
END;
$$;
CREATE FUNCTION public.obtener_historial_entregas_cocina(p_limite integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'') NOT IN ('cocina','admin') THEN
    RAISE EXCEPTION 'Solo cocina o administración pueden consultar el historial' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Página inválida' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(h.datos ORDER BY h.fecha DESC NULLS LAST,h.clave DESC),'[]'::jsonb) INTO v_resultado
  FROM (
    SELECT e.entregado_en AS fecha, 'entrega-' || e.id AS clave,
      jsonb_build_object('id',p.id,'historialId','entrega-' || e.id,'tipo',p.tipo,'estado',p.estado,
        'mesas',CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('numero',m.numero) END,
        'creado_en',p.creado_en,'entregado_en',e.entregado_en,'preparado_en',e.preparado_en,
        'entregado_por',e.entregado_por,'detalles_pedido',e.items) AS datos
    FROM public.entregas_cocina e JOIN public.pedidos p ON p.id = e.pedido_id LEFT JOIN public.mesas m ON m.id = p.mesa_id
    UNION ALL
    -- Pedidos cerrados antes de esta migración: conservarlos sin inventar una entrega física.
    SELECT p.actualizado_en, 'anterior-' || p.id,
      jsonb_build_object('id',p.id,'historialId','anterior-' || p.id,'tipo',p.tipo,'estado',p.estado,
        'mesas',CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('numero',m.numero) END,
        'creado_en',p.creado_en,'esAnterior',true,
        'historial_estados_pedido',(SELECT jsonb_agg(to_jsonb(s)) FROM public.historial_estados_pedido s WHERE s.pedido_id = p.id),
        'detalles_pedido',(SELECT jsonb_agg(to_jsonb(d)) FROM public.detalles_pedido d WHERE d.pedido_id = p.id AND requiere_preparacion))
    FROM public.pedidos p LEFT JOIN public.mesas m ON m.id = p.mesa_id
    WHERE p.estado = 'entregado' AND NOT EXISTS (SELECT 1 FROM public.entregas_cocina e WHERE e.pedido_id = p.id)
      AND EXISTS (SELECT 1 FROM public.detalles_pedido d WHERE d.pedido_id = p.id AND requiere_preparacion)
    ORDER BY fecha DESC NULLS LAST,clave DESC LIMIT p_limite OFFSET p_offset
  ) h;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_historial_entregas_cocina(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obtener_historial_entregas_cocina(integer,integer) TO authenticated;

END;
$entrega_cocina$;
