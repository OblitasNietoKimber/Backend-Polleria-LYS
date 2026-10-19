BEGIN;
CREATE TABLE public.roles (codigo text PRIMARY KEY, nombre text NOT NULL);
INSERT INTO public.roles VALUES ('cliente','Cliente'),('mesera','Mesera'),('cocina','Cocina'),('caja','Caja'),('admin','Administrador');
CREATE TABLE public.perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '', apellido text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '' CHECK (telefono = '' OR telefono ~ '^9[0-9]{8}$'),
  rol text NOT NULL DEFAULT 'cliente' REFERENCES public.roles(codigo),
  preferencias jsonb NOT NULL DEFAULT '{"notificacionesEmail":true,"notificacionesPromos":true}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
-- A role can never originate from editable Auth profile/metadata.
CREATE FUNCTION public.crear_perfil_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.perfiles(id,nombre,rol)
  VALUES (NEW.id, COALESCE(NEW.profile->>'name',''), 'cliente') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER crear_perfil AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_usuario();
INSERT INTO public.perfiles(id,nombre) SELECT id,COALESCE(profile->>'name','') FROM auth.users ON CONFLICT DO NOTHING;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roles, public.perfiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_perfil_usuario() FROM PUBLIC, anon, authenticated;
COMMIT;
