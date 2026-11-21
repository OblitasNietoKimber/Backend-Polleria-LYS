-- Migración 013: Soporte de reservas en mesas, liberación completa y actividad de salón
-- Permite persistir reservas en PostgreSQL, liberar mesas cerrando pedidos activos y consultar actividad real del salón.

ALTER TABLE public.mesas
  ADD COLUMN IF NOT EXISTS hora_reserva text,
  ADD COLUMN IF NOT EXISTS cliente_reserva text,
  ADD COLUMN IF NOT EXISTS telefono_reserva text,
  ADD COLUMN IF NOT EXISTS comensales_reserva integer;

-- RPC: Liberar mesa de salón cerrando cualquier pedido activo y limpiando reservas
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

  -- Al liberar la mesa, cerrar pedidos activos de salón
  UPDATE public.pedidos
  SET estado = CASE WHEN estado = 'pendiente' THEN 'cancelado' ELSE 'entregado' END
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

-- RPC: Reservar mesa de salón en PostgreSQL
CREATE OR REPLACE FUNCTION public.reservar_mesa_salon(
  p_mesa_id bigint,
  p_cliente text,
  p_hora text,
  p_telefono text,
  p_comensales integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
  v_pedido_activo public.pedidos%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden reservar mesas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pedido_activo FROM public.pedidos
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado');
  IF FOUND THEN
    RAISE EXCEPTION 'No se puede reservar una mesa con pedido activo' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mesas
  SET estado = 'reservada',
      hora_reserva = COALESCE(btrim(p_hora), '20:00'),
      cliente_reserva = COALESCE(btrim(p_cliente), 'Cliente Reserva'),
      telefono_reserva = COALESCE(btrim(p_telefono), ''),
      comensales_reserva = COALESCE(p_comensales, v_mesa.capacidad)
  WHERE id = p_mesa_id;

  RETURN true;
END;
$$;

-- RPC: Consultar mesas sincronizadas con pedidos y reservas desde PostgreSQL
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

-- RPC: Consultar actividad real del salón desde el historial de pedidos
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
        WHEN h.estado = 'en_preparacion' THEN 'pedido_creado'
        WHEN h.estado = 'cancelado' THEN 'pedido_cancelado'
        ELSE 'pedido_creado'
      END,
      'tipoColor', CASE
        WHEN h.estado = 'entregado' THEN 'verde'
        WHEN h.estado = 'cancelado' THEN 'rojo'
        WHEN h.estado = 'en_preparacion' THEN 'rojo'
        ELSE 'amarillo'
      END,
      'titulo', 'Mesa ' || COALESCE(m.numero, '00'),
      'descripcion', CASE
        WHEN h.estado = 'entregado' THEN 'Mesa liberada / Pedido entregado'
        WHEN h.estado = 'en_preparacion' THEN 'Comanda enviada a cocina'
        WHEN h.estado = 'cancelado' THEN 'Pedido cancelado'
        ELSE 'Nuevo pedido registrado'
      END,
      'ordenCodigo', 'Orden #' || substring(h.pedido_id::text from 1 for 8),
      'hora', to_char(h.cambiado_en AT TIME ZONE 'America/Lima', 'HH12:MI AM'),
      'createdAt', h.cambiado_en
    )
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

REVOKE ALL ON FUNCTION public.reservar_mesa_salon(bigint, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_mesa_salon(bigint, text, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.obtener_actividad_salon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_actividad_salon() TO authenticated;
