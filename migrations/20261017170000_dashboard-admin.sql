-- Requiere Caja y Pagos (20261016194047). InsForge ejecuta este archivo completo en una transacción.
-- Los indicadores se calculan en PostgreSQL a partir de los pagos registrados; solo el Administrador los consulta.
DO $$ BEGIN
  IF to_regprocedure('public.registrar_cobro(uuid,text,numeric,uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero las migraciones de Caja y Pagos';
  END IF;
END; $$;

-- Recorrer las ventas por fecha de cobro sin leer todas las cuentas.
CREATE INDEX pagos_creado_idx ON public.pagos(creado_en DESC, id DESC);

-- Las fechas se agrupan en la hora local del restaurante, no en la del navegador.
CREATE FUNCTION public.obtener_dashboard_admin(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_zona constant text := 'America/Lima';
  hoy date := (now() AT TIME ZONE v_zona)::date;
  inicio_semana date := hoy - (extract(isodow FROM hoy)::int - 1);
  inicio_mes date := date_trunc('month', hoy)::date;
  resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar el dashboard' USING ERRCODE = '42501';
  END IF;
  IF p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la final' USING ERRCODE = '22023';
  END IF;

  WITH ventas AS (
    SELECT pago.pedido_id, pago.metodo, pago.monto, (pago.creado_en AT TIME ZONE v_zona) AS fecha_local
    FROM public.pagos pago
  ), filtradas AS (
    SELECT * FROM ventas
    WHERE (p_desde IS NULL OR fecha_local::date >= p_desde) AND (p_hasta IS NULL OR fecha_local::date <= p_hasta)
  ), productos AS (
    SELECT detalle.producto_id, max(detalle.nombre_producto) AS nombre, max(producto.imagen) AS imagen,
      sum(detalle.cantidad) AS cantidad, sum(detalle.cantidad * detalle.precio_unitario) AS total
    FROM filtradas venta
    JOIN public.detalles_pedido detalle ON detalle.pedido_id = venta.pedido_id
    LEFT JOIN public.productos producto ON producto.id = detalle.producto_id
    GROUP BY detalle.producto_id
  ), metodos AS (
    SELECT metodo, count(*) AS cantidad, sum(monto) AS total FROM filtradas GROUP BY metodo
  ), por_dia AS (
    SELECT fecha_local::date AS fecha, count(*) AS cantidad, sum(monto) AS total FROM filtradas GROUP BY 1
  ), dias_operativos AS (
    SELECT (hoy - n)::date AS fecha FROM generate_series(4, 0, -1) AS n
  ), operativos AS (
    SELECT dia.fecha,
      (SELECT count(*) FROM ventas WHERE fecha_local::date = dia.fecha) AS completados,
      (SELECT COALESCE(sum(monto), 0) FROM ventas WHERE fecha_local::date = dia.fecha) AS ventas,
      (SELECT count(*) FROM public.pedidos WHERE (creado_en AT TIME ZONE v_zona)::date = dia.fecha
        AND estado_pago = 'pendiente' AND estado <> 'cancelado') AS pendientes,
      (SELECT count(*) FROM public.pedidos WHERE (creado_en AT TIME ZONE v_zona)::date = dia.fecha
        AND estado = 'cancelado') AS cancelados
    FROM dias_operativos dia
  )
  SELECT jsonb_build_object(
    'generadoEn', now(), 'zonaHoraria', v_zona, 'hoy', hoy,
    'resumen', jsonb_build_object(
      'dia', (SELECT jsonb_build_object('cantidadPedidos', count(*), 'totalVentas', COALESCE(sum(monto), 0))
        FROM filtradas WHERE fecha_local::date = hoy),
      'semana', (SELECT jsonb_build_object('cantidadPedidos', count(*), 'totalVentas', COALESCE(sum(monto), 0))
        FROM filtradas WHERE fecha_local::date BETWEEN hoy - 6 AND hoy),
      'mes', (SELECT jsonb_build_object('cantidadPedidos', count(*), 'totalVentas', COALESCE(sum(monto), 0))
        FROM filtradas WHERE fecha_local::date BETWEEN inicio_mes AND hoy),
      'total', (SELECT jsonb_build_object('cantidadPedidos', count(*), 'totalVentas', COALESCE(sum(monto), 0))
        FROM filtradas)
    ),
    'productos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('productoId', producto_id, 'nombre', nombre,
      'imagen', imagen, 'cantidad', cantidad, 'total', total) ORDER BY cantidad DESC, total DESC, nombre), '[]'::jsonb)
      FROM productos),
    'metodosPago', (SELECT COALESCE(jsonb_agg(jsonb_build_object('metodo', metodo, 'cantidad', cantidad, 'total', total)
      ORDER BY total DESC, metodo), '[]'::jsonb) FROM metodos),
    'ventasPorDia', (SELECT COALESCE(jsonb_agg(jsonb_build_object('fecha', fecha, 'cantidad', cantidad, 'total', total)
      ORDER BY fecha), '[]'::jsonb) FROM por_dia),
    'tendencias', jsonb_build_object(
      'dia', (SELECT jsonb_build_object('labels', jsonb_agg(hora || 'h' ORDER BY hora), 'values', jsonb_agg(total ORDER BY hora))
        FROM (SELECT hora, (SELECT COALESCE(sum(monto), 0) FROM ventas WHERE fecha_local::date = hoy
          AND extract(hour FROM fecha_local) = hora) AS total FROM generate_series(0, 23) AS hora) horas),
      'semana', (SELECT jsonb_build_object('labels', '["lun","mar","mie","jue","vie","sab","dom"]'::jsonb,
          'values', jsonb_agg(total ORDER BY fecha))
        FROM (SELECT fecha, (SELECT COALESCE(sum(monto), 0) FROM ventas WHERE fecha_local::date = fecha) AS total
          FROM (SELECT inicio_semana + n AS fecha FROM generate_series(0, 6) AS n) dias) semana),
      'mes', (SELECT jsonb_build_object('labels', jsonb_agg(extract(day FROM fecha)::int::text ORDER BY fecha),
          'values', jsonb_agg(total ORDER BY fecha))
        FROM (SELECT fecha, (SELECT COALESCE(sum(monto), 0) FROM ventas WHERE fecha_local::date = fecha) AS total
          FROM (SELECT inicio_mes + n AS fecha
            FROM generate_series(0, (inicio_mes + interval '1 month')::date - inicio_mes - 1) AS n) dias) mes),
      'total', (SELECT jsonb_build_object('labels', '["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]'::jsonb,
          'values', jsonb_agg(total ORDER BY numero))
        FROM (SELECT numero, (SELECT COALESCE(sum(monto), 0) FROM ventas
          WHERE extract(year FROM fecha_local) = extract(year FROM hoy) AND extract(month FROM fecha_local) = numero) AS total
          FROM generate_series(1, 12) AS numero) meses)
    ),
    'operativas', (SELECT jsonb_build_object('fechas', jsonb_agg(fecha ORDER BY fecha),
      'completados', jsonb_agg(completados ORDER BY fecha), 'pendientes', jsonb_agg(pendientes ORDER BY fecha),
      'cancelados', jsonb_agg(cancelados ORDER BY fecha), 'ventas', jsonb_agg(ventas ORDER BY fecha)) FROM operativos),
    'pedidosPendientes', (SELECT count(*) FROM public.pedidos
      WHERE estado_pago = 'pendiente' AND estado <> 'cancelado' AND total > 0)
  ) INTO resultado;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_dashboard_admin(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_dashboard_admin(date,date) TO authenticated;

-- Historial paginado por fecha de cobro; el cursor es la última venta recibida.
CREATE FUNCTION public.obtener_historial_ventas(
  p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_limite integer DEFAULT 10,
  p_antes_fecha timestamptz DEFAULT NULL, p_antes_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_zona constant text := 'America/Lima';
  limite integer := least(greatest(COALESCE(p_limite, 10), 1), 100);
  filas jsonb;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar el historial de ventas' USING ERRCODE = '42501';
  END IF;
  IF p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la final' USING ERRCODE = '22023';
  END IF;
  IF (p_antes_fecha IS NULL) <> (p_antes_id IS NULL) THEN
    RAISE EXCEPTION 'El cursor del historial está incompleto' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(venta ORDER BY orden), '[]'::jsonb) INTO filas FROM (
    SELECT row_number() OVER (ORDER BY pago.creado_en DESC, pago.id DESC) AS orden,
      jsonb_build_object(
        'id', pedido.id, 'codigo', pedido.id::text, 'pagoId', pago.id, 'tipo', pedido.tipo, 'mesa', mesa.numero,
        'cliente', COALESCE(NULLIF(pedido.destinatario->>'name', ''), 'Mesa ' || mesa.numero, 'Cliente'),
        'total', pago.monto, 'createdAt', pedido.creado_en, 'pagadoAt', pago.creado_en,
        'pago', jsonb_build_object('metodo', pago.metodo, 'referencia', pago.referencia)
      ) AS venta
    FROM public.pagos pago
    JOIN public.pedidos pedido ON pedido.id = pago.pedido_id
    LEFT JOIN public.mesas mesa ON mesa.id = pedido.mesa_id
    WHERE (p_desde IS NULL OR (pago.creado_en AT TIME ZONE v_zona)::date >= p_desde)
      AND (p_hasta IS NULL OR (pago.creado_en AT TIME ZONE v_zona)::date <= p_hasta)
      AND (p_antes_fecha IS NULL OR (pago.creado_en, pago.id) < (p_antes_fecha, p_antes_id))
    ORDER BY pago.creado_en DESC, pago.id DESC
    LIMIT limite + 1
  ) pagina;

  RETURN jsonb_build_object(
    'ventas', (SELECT COALESCE(jsonb_agg(elemento ORDER BY posicion), '[]'::jsonb)
      FROM jsonb_array_elements(filas) WITH ORDINALITY AS t(elemento, posicion) WHERE posicion <= limite),
    'siguiente', CASE WHEN jsonb_array_length(filas) > limite THEN jsonb_build_object(
      'fecha', filas->(limite - 1)->'pagadoAt', 'id', filas->(limite - 1)->'pagoId') END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_historial_ventas(date,date,integer,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_historial_ventas(date,date,integer,timestamptz,uuid) TO authenticated;
