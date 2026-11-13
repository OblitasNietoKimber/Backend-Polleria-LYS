BEGIN;
INSERT INTO public.categorias(id,nombre) VALUES
('broaster','Broaster'),
('mostros','Mostros'),
('chifa','Chifa'),
('criollos','Criollos típicos'),
('alitas','Alitas'),
('selvaticos','Selváticos'),
('especialidades','Especialidades'),
('sopas','Sopas y caldos'),
('guarniciones','Guarniciones')
ON CONFLICT (id) DO NOTHING;
COMMIT;
