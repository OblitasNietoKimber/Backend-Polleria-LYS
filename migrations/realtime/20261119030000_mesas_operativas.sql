-- Devuelve solo el salón y las cuentas de atenciones abiertas, sin historial de cocina ni cobros históricos.
CREATE OR REPLACE FUNCTION public.flujo_mesas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(), '') NOT IN ('mesera','admin') THEN
    RAISE EXCEPTION 'Acceso restringido a mesas' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'mesas', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.mesas m), '[]'::jsonb),
    'atenciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'mesa_id', mesa_id, 'abierta_en', abierta_en))
      FROM public.atenciones_salon WHERE cerrada_en IS NULL
    ), '[]'::jsonb),
    'actividades', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.creado_en DESC, a.id DESC)
      FROM (SELECT * FROM public.actividades_salon ORDER BY creado_en DESC, id DESC LIMIT 20) a
    ), '[]'::jsonb),
    'cuentas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'atencion_id', p.atencion_id, 'estado', p.estado, 'estado_pago', p.estado_pago,
        'cuenta_solicitada', p.cuenta_solicitada, 'cocina_entregado_en', p.cocina_entregado_en,
        'cocina_cancelada_en', p.cocina_cancelada_en, 'version_cuenta', p.version_cuenta,
        'comensales', p.comensales, 'total', p.total, 'subtotal', p.subtotal, 'notas', p.notas,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d.id, 'producto_id', d.producto_id, 'nombre_producto', d.nombre_producto,
            'cantidad', d.cantidad, 'precio_unitario', d.precio_unitario, 'requiere_preparacion', d.requiere_preparacion
          ) ORDER BY d.id) FROM public.detalles_pedido d WHERE d.pedido_id = p.id
        ), '[]'::jsonb),
        'entregas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('items', e.items))
          FROM public.entregas_cocina e WHERE e.pedido_id = p.id
        ), '[]'::jsonb),
        'incidencias', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('tipo', i.tipo, 'estado', i.estado, 'motivo', i.motivo) ORDER BY i.creada_en)
          FROM public.incidencias_atencion i WHERE i.pedido_id = p.id
        ), '[]'::jsonb)
      ) ORDER BY p.creado_en DESC, p.id DESC)
      FROM public.pedidos p JOIN public.atenciones_salon a ON a.id = p.atencion_id
      WHERE a.cerrada_en IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.flujo_mesas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flujo_mesas() TO authenticated;
NOTIFY pgrst, 'reload schema';
