-- Migración 016: Anulación de comanda de salón por incidente y liberación forzada
-- Permite a meseras y administradores anular una comanda con pedido pendiente
-- cuando ocurre un incidente con el cliente (abandono, pedido duplicado o anulación expresa),
-- liberando la mesa y registrando el motivo en el historial de actividades del salón.

CREATE OR REPLACE FUNCTION public.anular_comanda_salon(
  p_mesa_id bigint,
  p_motivo text DEFAULT 'Incidente / Anulación de atención'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
  v_pedido_id uuid;
  v_motivo text := COALESCE(NULLIF(TRIM(p_motivo), ''), 'Incidente / Anulación de atención');
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Solo personal autorizado puede anular comandas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  -- Buscar pedido activo de salón en esta mesa
  SELECT id INTO v_pedido_id
  FROM public.pedidos
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado')
  ORDER BY creado_en DESC LIMIT 1;

  IF v_pedido_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = v_pedido_id) THEN
      RAISE EXCEPTION 'No se puede anular un pedido que ya fue cobrado en caja' USING ERRCODE = '22023';
    END IF;

    UPDATE public.pedidos
    SET estado = 'cancelado',
        notas = CASE
          WHEN COALESCE(notas, '') = '' THEN 'Anulado: ' || v_motivo
          ELSE notas || ' | Anulado: ' || v_motivo
        END
    WHERE id = v_pedido_id;
  END IF;

  -- Restaurar la mesa a libre y limpiar reservas
  UPDATE public.mesas
  SET estado = 'libre',
      hora_reserva = NULL,
      cliente_reserva = NULL,
      telefono_reserva = NULL,
      comensales_reserva = NULL
  WHERE id = p_mesa_id;

  -- Registrar en actividades_salon
  INSERT INTO public.actividades_salon (
    mesa_id, mesa_numero, tipo, tipo_color, titulo, descripcion, orden_codigo, creado_por
  ) VALUES (
    p_mesa_id,
    v_mesa.numero,
    'pedido_cancelado',
    'rojo',
    'Mesa ' || v_mesa.numero,
    'Comanda anulada · ' || v_motivo,
    CASE WHEN v_pedido_id IS NOT NULL THEN 'Orden #' || substring(v_pedido_id::text from 1 for 8) ELSE '' END,
    v_usuario
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_comanda_salon(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_comanda_salon(bigint, text) TO authenticated;
