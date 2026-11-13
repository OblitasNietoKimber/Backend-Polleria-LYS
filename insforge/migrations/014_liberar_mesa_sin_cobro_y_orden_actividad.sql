-- Migración 014: Corrección de liberación de mesas sin cobro previo y orden descendente de actividad
-- Permite liberar mesas cerrando pedidos como 'cancelado' si no fueron cobrados en caja (evitando bloqueo por proteger_pedido_cobrado)
-- y ordena estrictamente por fecha descendente los eventos de actividad del salón.

CREATE OR REPLACE FUNCTION public.liberar_mesa_salon(
  p_mesa_id bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden liberar mesas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  -- Al liberar la mesa, cerrar pedidos activos de salón.
  -- Si ya tiene pago registrado en caja, pasa a 'entregado'. Si no fue pagado, pasa a 'cancelado'.
  UPDATE public.pedidos
  SET estado = CASE
    WHEN EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = public.pedidos.id) THEN 'entregado'
    ELSE 'cancelado'
  END
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado');

  -- Restaurar la mesa a libre y limpiar datos de reserva
  UPDATE public.mesas
  SET estado = 'libre',
      hora_reserva = NULL,
      cliente_reserva = NULL,
      telefono_reserva = NULL,
      comensales_reserva = NULL
  WHERE id = p_mesa_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_actividad_salon()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.rol_actual() NOT IN ('mesera', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Acceso restringido al personal autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', 'HIST-' || h.id::text,
      'mesaNumero', COALESCE(m.numero, '00'),
      'tipo', CASE
        WHEN h.estado = 'entregado' THEN 'pedido_completado'
        WHEN h.estado = 'cancelado' THEN 'pedido_cancelado'
        WHEN h.estado = 'en_preparacion' THEN 'pedido_cocina'
        ELSE 'pedido_creado'
      END,
      'tipoColor', CASE
        WHEN h.estado = 'entregado' THEN 'verde'
        WHEN h.estado = 'cancelado' THEN 'rojo'
        WHEN h.estado = 'en_preparacion' THEN 'amarillo'
        ELSE 'rojo'
      END,
      'titulo', 'Mesa ' || COALESCE(m.numero, '00'),
      'descripcion', CASE
        WHEN h.estado = 'entregado' THEN 'Mesa liberada / Pedido completado'
        WHEN h.estado = 'cancelado' THEN 'Mesa liberada / Pedido cancelado'
        WHEN h.estado = 'en_preparacion' THEN 'Comanda enviada a cocina'
        ELSE 'Nuevo pedido registrado'
      END,
      'ordenCodigo', 'Orden #' || substring(h.pedido_id::text from 1 for 8),
      'hora', to_char(h.cambiado_en AT TIME ZONE 'America/Lima', 'HH12:MI AM'),
      'createdAt', h.cambiado_en
    ) ORDER BY h.cambiado_en DESC
  ) INTO v_resultado
  FROM (
    SELECT h2.*, p.mesa_id
    FROM public.historial_estados_pedido h2
    JOIN public.pedidos p ON h2.pedido_id = p.id
    WHERE p.tipo = 'salon'
    ORDER BY h2.cambiado_en DESC
    LIMIT 20
  ) h
  LEFT JOIN public.mesas m ON h.mesa_id = m.id;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;
