BEGIN;
CREATE FUNCTION public.rol_actual() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT rol FROM public.perfiles WHERE id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.rol_actual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;
GRANT SELECT ON public.roles, public.perfiles TO authenticated;
-- Column grants prevent a user from changing their ID, role or creation timestamp.
GRANT UPDATE(nombre,apellido,telefono,preferencias) ON public.perfiles TO authenticated;
CREATE POLICY roles_lectura ON public.roles FOR SELECT TO authenticated USING(true);
CREATE POLICY perfiles_lectura ON public.perfiles FOR SELECT TO authenticated USING(id = auth.uid() OR public.rol_actual() = 'admin');
CREATE POLICY perfiles_edicion ON public.perfiles FOR UPDATE TO authenticated USING(id = auth.uid()) WITH CHECK(id = auth.uid());
GRANT SELECT ON public.categorias,public.productos,public.estados_pedido TO anon,authenticated;
CREATE POLICY categorias_lectura ON public.categorias FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY productos_publicos ON public.productos FOR SELECT TO anon,authenticated USING(disponible);
CREATE POLICY productos_personal ON public.productos FOR SELECT TO authenticated USING(public.rol_actual() = 'admin');
CREATE POLICY estados_lectura ON public.estados_pedido FOR SELECT TO anon,authenticated USING(true);
GRANT INSERT,UPDATE,DELETE ON public.categorias,public.productos TO authenticated;
CREATE POLICY categorias_admin ON public.categorias FOR ALL TO authenticated USING(public.rol_actual()='admin') WITH CHECK(public.rol_actual()='admin');
CREATE POLICY productos_admin ON public.productos FOR ALL TO authenticated USING(public.rol_actual()='admin') WITH CHECK(public.rol_actual()='admin');
GRANT SELECT ON public.mesas,public.pedidos,public.detalles_pedido,public.pagos TO authenticated;
GRANT UPDATE(estado) ON public.mesas TO authenticated;
CREATE POLICY mesas_personal ON public.mesas FOR SELECT TO authenticated USING(public.rol_actual() IN ('mesera','caja','admin'));
CREATE POLICY mesas_edicion ON public.mesas FOR UPDATE TO authenticated USING(public.rol_actual() IN ('mesera','admin')) WITH CHECK(public.rol_actual() IN ('mesera','admin'));
CREATE POLICY pedidos_lectura ON public.pedidos FOR SELECT TO authenticated USING(cliente_id=auth.uid() OR public.rol_actual() IN ('mesera','cocina','caja','admin'));
CREATE POLICY detalles_lectura ON public.detalles_pedido FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id));
CREATE POLICY pagos_lectura ON public.pagos FOR SELECT TO authenticated USING(public.rol_actual() IN ('caja','admin') OR EXISTS(SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.cliente_id=auth.uid()));
-- Order creation, state transitions and payment registration require validated RPCs
-- in their respective epics. No direct writes can forge totals, owners or receipts.
REVOKE ALL ON FUNCTION public.rol_actual() FROM anon;
COMMIT;
