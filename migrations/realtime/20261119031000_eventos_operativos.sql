INSERT INTO realtime.channels(pattern, description, enabled)
VALUES ('lys:catalogo', 'Avisos públicos sin cantidades ni datos de pedidos', true)
ON CONFLICT (pattern) DO UPDATE SET enabled = true;

DROP POLICY IF EXISTS lys_catalogo_suscribir ON realtime.channels;
CREATE POLICY lys_catalogo_suscribir ON realtime.channels FOR SELECT TO anon, authenticated
USING (pattern = 'lys:catalogo');

CREATE OR REPLACE FUNCTION public.notificar_pedido_cocina()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  pedido uuid;
  cliente uuid;
  datos jsonb;
  tipo_pedido text;
BEGIN
  IF TG_TABLE_NAME = 'detalles_pedido' THEN
    pedido := CASE WHEN TG_OP = 'DELETE' THEN OLD.pedido_id ELSE NEW.pedido_id END;
    UPDATE public.pedidos SET actualizado_en = clock_timestamp() WHERE id = pedido;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    pedido := OLD.id;
    cliente := OLD.cliente_id;
    tipo_pedido := OLD.tipo;
  ELSE
    pedido := NEW.id;
    cliente := NEW.cliente_id;
    tipo_pedido := NEW.tipo;
  END IF;
  datos := jsonb_build_object('pedidoId', pedido, 'tipo', tipo_pedido);
  PERFORM realtime.publish('lys:staff', 'lys:pedido-actualizado', datos);
  IF cliente IS NOT NULL THEN
    PERFORM realtime.publish('lys:client:' || cliente::text, 'lys:pedido-actualizado', datos);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_cambio_operativo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  fila jsonb;
  datos jsonb := '{}'::jsonb;
  evento text := TG_ARGV[0];
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NULL; END IF;
  fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  IF evento = 'lys:incidencia-actualizada' THEN
    IF fila->>'tipo' <> 'devolucion' THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND NEW.estado <> 'resuelta' AND OLD.estado <> 'resuelta' THEN RETURN NULL; END IF;
    IF TG_OP <> 'UPDATE' AND fila->>'estado' <> 'resuelta' THEN RETURN NULL; END IF;
  END IF;

  IF evento IN ('lys:pago-actualizado', 'lys:entrega-cocina-actualizada') THEN
    datos := jsonb_build_object('pedidoId', COALESCE(fila->>'pedido_id', fila->>'id'));
  END IF;
  PERFORM realtime.publish('lys:staff', evento, datos);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_catalogo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  fila jsonb;
  datos jsonb := jsonb_build_object('recurso', TG_ARGV[0]);
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NULL; END IF;
  IF TG_ARGV[0] = 'productos' THEN
    fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    datos := datos || jsonb_build_object('productoId', fila->'id');
  ELSIF TG_ARGV[0] = 'stock' THEN
    IF TG_OP = 'UPDATE' AND NEW.unidades IS NOT DISTINCT FROM OLD.unidades AND
       (to_jsonb(NEW) - 'actualizado_en') = (to_jsonb(OLD) - 'actualizado_en') THEN RETURN NULL; END IF;
    fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    datos := datos || jsonb_build_object('inventarioId', fila->>'id');
  END IF;
  PERFORM realtime.publish('lys:catalogo', 'lys:catalogo-actualizado', datos);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_pedido_cocina(), public.notificar_cambio_operativo(), public.notificar_catalogo()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lys_realtime_mesas ON public.mesas;
CREATE TRIGGER lys_realtime_mesas AFTER INSERT OR UPDATE OR DELETE ON public.mesas
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:mesa-actualizada');
DROP TRIGGER IF EXISTS lys_realtime_atenciones ON public.atenciones_salon;
CREATE TRIGGER lys_realtime_atenciones AFTER INSERT OR UPDATE OR DELETE ON public.atenciones_salon
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:mesa-actualizada');
DROP TRIGGER IF EXISTS lys_realtime_actividades ON public.actividades_salon;
CREATE TRIGGER lys_realtime_actividades AFTER INSERT OR UPDATE OR DELETE ON public.actividades_salon
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:mesa-actualizada');

DROP TRIGGER IF EXISTS lys_realtime_pagos ON public.pagos;
CREATE TRIGGER lys_realtime_pagos AFTER INSERT OR UPDATE OR DELETE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:pago-actualizado');
DROP TRIGGER IF EXISTS lys_realtime_devoluciones ON public.incidencias_atencion;
CREATE TRIGGER lys_realtime_devoluciones AFTER INSERT OR UPDATE OR DELETE ON public.incidencias_atencion
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:incidencia-actualizada');

DROP TRIGGER IF EXISTS lys_realtime_entregas ON public.entregas_cocina;
CREATE TRIGGER lys_realtime_entregas AFTER INSERT OR UPDATE OR DELETE ON public.entregas_cocina
FOR EACH ROW EXECUTE FUNCTION public.notificar_cambio_operativo('lys:entrega-cocina-actualizada');
DROP TRIGGER IF EXISTS lys_realtime_cambio_entregado ON public.pedidos;
CREATE TRIGGER lys_realtime_cambio_entregado AFTER UPDATE OF estado ON public.pedidos
FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado AND (OLD.estado = 'entregado' OR NEW.estado = 'entregado'))
EXECUTE FUNCTION public.notificar_cambio_operativo('lys:entrega-cocina-actualizada');

DROP TRIGGER IF EXISTS lys_realtime_productos ON public.productos;
CREATE TRIGGER lys_realtime_productos AFTER INSERT OR UPDATE OR DELETE ON public.productos
FOR EACH ROW EXECUTE FUNCTION public.notificar_catalogo('productos');
DROP TRIGGER IF EXISTS lys_realtime_categorias ON public.categorias;
CREATE TRIGGER lys_realtime_categorias AFTER INSERT OR UPDATE OR DELETE ON public.categorias
FOR EACH ROW EXECUTE FUNCTION public.notificar_catalogo('categorias');

DO $$
BEGIN
  IF to_regclass('public.inventario_recursos') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS lys_realtime_stock ON public.inventario_recursos;
    CREATE TRIGGER lys_realtime_stock AFTER INSERT OR UPDATE OR DELETE ON public.inventario_recursos
    FOR EACH ROW EXECUTE FUNCTION public.notificar_catalogo('stock');
  END IF;
END;
$$;
