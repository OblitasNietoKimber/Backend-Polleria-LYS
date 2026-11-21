BEGIN;
-- El cliente consulta la disponibilidad; un agotado sigue visible sin poder comprarse.
ALTER POLICY productos_publicos ON public.productos USING (true);
COMMIT;
