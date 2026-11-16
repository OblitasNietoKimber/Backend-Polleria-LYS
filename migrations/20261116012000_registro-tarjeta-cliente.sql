-- Un pedido creado después de una tarjeta aprobada conserva el pago en la misma transacción.
CREATE FUNCTION public.crear_pedido_cliente_tarjeta(
  solicitud_id uuid,
  tipo_entrega text,
  articulos jsonb,
  datos_entrega jsonb,
  referencia_pago text,
  idempotencia_pago uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_pedido_id uuid;
  v_pedido public.pedidos%ROWTYPE;
  v_pago public.pagos%ROWTYPE;
  v_referencia text := NULLIF(btrim(referencia_pago), '');
  v_comprobante jsonb;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'Solo clientes autenticados pueden registrar pagos con tarjeta' USING ERRCODE = '42501';
  END IF;
  IF idempotencia_pago IS NULL OR v_referencia IS NULL OR char_length(v_referencia) > 120 THEN
    RAISE EXCEPTION 'La referencia del pago con tarjeta no es válida' USING ERRCODE = '22023';
  END IF;

  v_pedido_id := public.crear_pedido_cliente(solicitud_id, tipo_entrega, articulos, datos_entrega, 'tarjeta');
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = v_pedido_id FOR UPDATE;

  IF v_pedido.cliente_id IS DISTINCT FROM v_usuario THEN
    RAISE EXCEPTION 'El pedido no pertenece al cliente autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_pedido.total <= 0 THEN
    RAISE EXCEPTION 'El pedido no tiene un importe válido para cobrar' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pago FROM public.pagos WHERE pedido_id = v_pedido_id;
  IF FOUND THEN
    IF v_pago.metodo = 'tarjeta' AND v_pago.idempotencia = idempotencia_pago
       AND v_pago.referencia = v_referencia THEN
      RETURN v_pedido_id;
    END IF;
    RAISE EXCEPTION 'El pedido ya tiene un pago registrado' USING ERRCODE = '23505';
  END IF;
  IF v_pedido.estado = 'cancelado' OR v_pedido.estado_pago = 'pagado' THEN
    RAISE EXCEPTION 'Este pedido no admite un cobro' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos(
    pedido_id, registrado_por, monto, metodo, referencia, recibido, vuelto, idempotencia
  ) VALUES (
    v_pedido_id, v_usuario, v_pedido.total, 'tarjeta', v_referencia,
    v_pedido.total, 0, idempotencia_pago
  ) RETURNING * INTO v_pago;

  UPDATE public.pedidos
  SET estado_pago = 'pagado', cuenta_solicitada = false
  WHERE id = v_pedido_id;

  v_comprobante := jsonb_build_object(
    'id', v_pedido.id,
    'codigo', v_pedido.id::text,
    'mesa', NULL,
    'tipo', v_pedido.tipo,
    'cliente', COALESCE(NULLIF(v_pedido.destinatario->>'name', ''), 'Cliente'),
    'subtotal', v_pedido.subtotal,
    'envio', v_pedido.envio,
    'total', v_pago.monto,
    'estado', 'pagado',
    'estadoPedido', v_pedido.estado,
    'createdAt', v_pedido.creado_en,
    'pagadoAt', v_pago.creado_en,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', detalle.producto_id,
        'nombre', detalle.nombre_producto,
        'cantidad', detalle.cantidad,
        'precio', detalle.precio_unitario
      ) ORDER BY detalle.id)
      FROM public.detalles_pedido AS detalle
      WHERE detalle.pedido_id = v_pedido_id
    ), '[]'::jsonb),
    'pago', jsonb_build_object(
      'id', v_pago.id,
      'metodo', v_pago.metodo,
      'monto', v_pago.recibido,
      'importe', v_pago.monto,
      'vuelto', v_pago.vuelto,
      'referencia', v_pago.referencia,
      'registradoPor', v_pago.registrado_por
    )
  );
  UPDATE public.pagos SET comprobante = v_comprobante WHERE id = v_pago.id;
  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_cliente_tarjeta(uuid,text,jsonb,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_cliente_tarjeta(uuid,text,jsonb,jsonb,text,uuid) TO authenticated;
