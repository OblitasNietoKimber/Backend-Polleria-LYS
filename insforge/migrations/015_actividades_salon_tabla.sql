-- Migración 015: Tabla permanente para actividades del salón y orden cronológico descendente
-- Registra eventos de salón (reservas, cancelaciones, liberaciones manuales y pedidos)
-- en una tabla persistente de PostgreSQL y garantiza que siempre aparezcan los más recientes arriba.

CREATE TABLE IF NOT EXISTS public.actividades_salon (
  id bigserial PRIMARY KEY,
  mesa_id bigint REFERENCES public.mesas(id) ON DELETE SET NULL,
  mesa_numero text NOT NULL,
  tipo text NOT NULL,
  tipo_color text NOT NULL DEFAULT 'rojo',
  titulo text NOT NULL,
  descripcion text NOT NULL,
  orden_codigo text DEFAULT '',
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividades_salon_creado_en ON public.actividades_salon(creado_en DESC);

ALTER TABLE public.actividades_salon ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.actividades_salon FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.actividades_salon TO authenticated;

DROP POLICY IF EXISTS "actividades_salon_personal" ON public.actividades_salon;
CREATE POLICY "actividades_salon_personal" ON public.actividades_salon
FOR ALL TO authenticated
USING (public.rol_actual() IN ('mesera', 'caja', 'admin'))
WITH CHECK (public.rol_actual() IN ('mesera', 'caja', 'admin'));

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

CREATE OR REPLACE FUNCTION public.reservar_mesa_salon(
  p_mesa_id bigint,
  p_cliente text,
  p_hora text,
  p_telefono text DEFAULT NULL,
  p_comensales integer DEFAULT 4
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden reservar mesas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  IF v_mesa.estado = 'ocupada' THEN
    RAISE EXCEPTION 'No se puede reservar una mesa actualmente ocupada' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mesas
  SET estado = 'reservada',
      hora_reserva = p_hora,
      cliente_reserva = p_cliente,
      telefono_reserva = p_telefono,
      comensales_reserva = p_comensales
  WHERE id = p_mesa_id;

  INSERT INTO public.actividades_salon (
    mesa_id, mesa_numero, tipo, tipo_color, titulo, descripcion, orden_codigo, creado_por
  ) VALUES (
    p_mesa_id,
    v_mesa.numero,
    'reserva',
    'amarillo',
    'Mesa ' || v_mesa.numero,
    'Reserva confirmada a nombre de ' || p_cliente,
    p_hora || ' hrs',
    v_usuario
  );

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

  -- Combina eventos de actividades_salon con eventos históricos de pedidos de salón,
  -- ordenados estrictamente por fecha descendente (los más recientes primero).
  WITH eventos_unificados AS (
    SELECT
      'ACT-' || a.id::text AS id,
      a.mesa_numero AS mesa_numero,
      a.tipo AS tipo,
      a.tipo_color AS tipo_color,
      a.titulo AS titulo,
      a.descripcion AS descripcion,
      a.orden_codigo AS orden_codigo,
      a.creado_en AS creado_en
    FROM public.actividades_salon a

    UNION ALL

    SELECT
      'HIST-' || h.id::text AS id,
      COALESCE(m.numero, '00') AS mesa_numero,
      CASE
        WHEN h.estado = 'entregado' THEN 'pedido_completado'
        WHEN h.estado = 'cancelado' THEN 'pedido_cancelado'
        WHEN h.estado = 'en_preparacion' THEN 'pedido_cocina'
        ELSE 'pedido_creado'
      END AS tipo,
      CASE
        WHEN h.estado = 'entregado' THEN 'verde'
        WHEN h.estado = 'cancelado' THEN 'rojo'
        WHEN h.estado = 'en_preparacion' THEN 'amarillo'
        ELSE 'rojo'
      END AS tipo_color,
      'Mesa ' || COALESCE(m.numero, '00') AS titulo,
      CASE
        WHEN h.estado = 'entregado' THEN 'Mesa liberada / Pedido completado'
        WHEN h.estado = 'cancelado' THEN 'Mesa liberada / Pedido cancelado'
        WHEN h.estado = 'en_preparacion' THEN 'Comanda enviada a cocina'
        ELSE 'Nuevo pedido registrado'
      END AS descripcion,
      'Orden #' || substring(h.pedido_id::text from 1 for 8) AS orden_codigo,
      h.cambiado_en AS creado_en
    FROM public.historial_estados_pedido h
    JOIN public.pedidos p ON h.pedido_id = p.id
    LEFT JOIN public.mesas m ON p.mesa_id = m.id
    WHERE p.tipo = 'salon'
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'mesaNumero', e.mesa_numero,
      'tipo', e.tipo,
      'tipoColor', e.tipo_color,
      'titulo', e.titulo,
      'descripcion', e.descripcion,
      'ordenCodigo', e.orden_codigo,
      'hora', to_char(e.creado_en AT TIME ZONE 'America/Lima', 'HH12:MI AM'),
      'createdAt', e.creado_en
    ) ORDER BY e.creado_en DESC
  ) INTO v_resultado
  FROM (
    SELECT *
    FROM eventos_unificados
    ORDER BY creado_en DESC
    LIMIT 25
  ) e;

  RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_mesa_salon(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_mesa_salon(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_mesa_salon(bigint, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_mesa_salon(bigint, text, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.obtener_actividad_salon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_actividad_salon() TO authenticated;
