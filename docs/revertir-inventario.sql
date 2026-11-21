-- Ejecutar solo tras exportar el estado ACTUAL y recuperar el frontend anterior
-- al inventario. No borra pedidos ni pagos. Retira el historial de stock.
BEGIN;
DROP TRIGGER zz_stock_detalle ON public.detalles_pedido;
DROP TRIGGER zz_stock_cancelado ON public.pedidos;
DROP TRIGGER producto_inventario ON public.productos;
DROP VIEW public.productos_catalogo;
DROP FUNCTION public.actualizar_stock_detalle();
DROP FUNCTION public.actualizar_stock_cancelado();
DROP FUNCTION public.iniciar_stock_producto();
DROP FUNCTION public.sincronizar_stock_pedido(uuid);
DROP FUNCTION public.ajustar_inventario(bigint,numeric,text,uuid);
DROP TABLE public.inventario_movimientos;
DROP TABLE public.inventario_asignaciones;
DROP TABLE public.inventario_recetas;
DROP TABLE public.inventario_recursos;
DO $$ BEGIN
 IF to_regclass('public.schema_migrations') IS NOT NULL THEN
  DELETE FROM public.schema_migrations WHERE version='20261116020000_inventario-compartido.sql';
 END IF;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
