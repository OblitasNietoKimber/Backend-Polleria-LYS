-- Migración 012: Pedidos de Salón y Gestión de Mesas (EPIC 4)
-- Añade soporte para comensales, solicitud de cuenta, índice de exclusividad por mesa y RPCs seguras para meseras.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cuenta_solicitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comensales integer CHECK (comensales IS NULL OR comensales > 0);

-- Garantiza que una mesa no tenga más de un pedido activo simultáneo a nivel de base de datos (SCRUM-282)
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_salon_mesa_activa_idx
  ON public.pedidos(mesa_id)
  WHERE tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado');

CREATE INDEX IF NOT EXISTS pedidos_salon_activos_idx
  ON public.pedidos(tipo, estado)
  WHERE tipo = 'salon';

-- RPC: Abrir pedido de salón y ocupar mesa (SCRUM-278, SCRUM-282)
CREATE OR REPLACE FUNCTION public.abrir_pedido_salon(
  solicitud_id uuid,
  p_mesa_id bigint,
  p_comensales integer,
  p_notas text,
  p_articulos jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
  v_pedido_activo public.pedidos%ROWTYPE;
  v_existente public.pedidos%ROWTYPE;
  v_pedido_id uuid;
  v_linea jsonb;
  v_producto public.productos%ROWTYPE;
  v_comensales integer;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden abrir pedidos de salón' USING ERRCODE = '42501';
  END IF;

  IF p_mesa_id IS NULL THEN
    RAISE EXCEPTION 'Mesa requerida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  v_pedido_id := COALESCE(solicitud_id, gen_random_uuid());

  -- Idempotencia: si la solicitud ya existe para esta mesa
  SELECT * INTO v_existente FROM public.pedidos WHERE id = v_pedido_id;
  IF FOUND THEN
    IF v_existente.mesa_id = p_mesa_id AND v_existente.tipo = 'salon' THEN
      RETURN v_existente.id;
    ELSE
      RAISE EXCEPTION 'La solicitud ya fue utilizada' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Comprobar si ya existe un pedido activo en la mesa
  SELECT * INTO v_pedido_activo FROM public.pedidos
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado');
  IF FOUND THEN
    RAISE EXCEPTION 'La mesa ya tiene un pedido activo' USING ERRCODE = '22023';
  END IF;

  v_comensales := COALESCE(p_comensales, v_mesa.capacidad);
  IF v_comensales <= 0 THEN
    v_comensales := v_mesa.capacidad;
  END IF;

  INSERT INTO public.pedidos (
    id, cliente_id, creado_por, mesa_id, tipo, estado,
    notas, comensales, total, subtotal, cuenta_solicitada, huella_solicitud
  ) VALUES (
    v_pedido_id, NULL, v_usuario, p_mesa_id, 'salon', 'pendiente',
    COALESCE(btrim(p_notas), ''), v_comensales, 0, 0, false, md5(v_pedido_id::text)
  );

  UPDATE public.mesas SET estado = 'ocupada' WHERE id = p_mesa_id;

  -- Agregar artículos iniciales si se proporcionan
  IF p_articulos IS NOT NULL AND jsonb_typeof(p_articulos) = 'array' AND jsonb_array_length(p_articulos) > 0 THEN
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
      VALUES (v_pedido_id, v_producto.id, (v_linea->>'qty')::integer, v_producto.precio);
    END LOOP;
  END IF;

  RETURN v_pedido_id;
END;
$$;

-- RPC: Permitir agregar productos y observaciones a un pedido abierto (SCRUM-279)
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
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden modificar pedidos de salón' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id AND tipo = 'salon' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o no es de salón' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede modificar un pedido finalizado o cancelado' USING ERRCODE = '22023';
  END IF;

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

  RETURN true;
END;
$$;

-- RPC: Registrar el envío del pedido a cocina (SCRUM-280)
CREATE OR REPLACE FUNCTION public.enviar_pedido_cocina(
  p_pedido_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_pedido public.pedidos%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden enviar pedidos a cocina' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id AND tipo = 'salon' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o no es de salón' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'El pedido ya no está activo' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = p_pedido_id) THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado = 'pendiente' THEN
    UPDATE public.pedidos SET estado = 'en_preparacion' WHERE id = p_pedido_id;
  END IF;

  RETURN true;
END;
$$;

-- RPC: Registrar la solicitud de cuenta para caja (SCRUM-281)
CREATE OR REPLACE FUNCTION public.solicitar_cuenta_salon(
  p_pedido_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_pedido public.pedidos%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden solicitar la cuenta' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id AND tipo = 'salon' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o no es de salón' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado = 'cancelado' THEN
    RAISE EXCEPTION 'El pedido está cancelado' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pedidos SET cuenta_solicitada = true WHERE id = p_pedido_id;
  RETURN true;
END;
$$;

-- RPC: Liberar mesa de salón
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

  -- Si tenía un pedido pendiente sin detalles, cancelarlo
  UPDATE public.pedidos SET estado = 'cancelado'
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado = 'pendiente'
    AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = public.pedidos.id);

  UPDATE public.mesas SET estado = 'libre' WHERE id = p_mesa_id;
  RETURN true;
END;
$$;

-- RPC: Consultar mesas sincronizadas con sus pedidos activos desde PostgreSQL (SCRUM-277)
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

-- Permisos de ejecución
REVOKE ALL ON FUNCTION public.abrir_pedido_salon(uuid, bigint, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_pedido_salon(uuid, bigint, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.agregar_o_modificar_detalles_salon(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agregar_o_modificar_detalles_salon(uuid, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.enviar_pedido_cocina(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_pedido_cocina(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.solicitar_cuenta_salon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_cuenta_salon(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.liberar_mesa_salon(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_mesa_salon(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.obtener_mesas_con_pedidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_mesas_con_pedidos() TO authenticated;
