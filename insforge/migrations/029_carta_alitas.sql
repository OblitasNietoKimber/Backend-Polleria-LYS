BEGIN;
-- Precios: página 8 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Alitas BBQ con papas fritas', ARRAY['alitas bbq con papas fritas','alitas bbq con papas fritas','alitas bbq (6 und)','alitas bbq']::text[], 'Alitas bañadas en salsa BBQ, acompañadas de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Alitas_BBQ_con_papas_fritas.png', 18.00),
    ('Alitas acevichadas con papas fritas', ARRAY['alitas acevichadas con papas fritas','alitas acevichadas con papas fritas']::text[], 'Alitas cubiertas con salsa acevichada, acompañadas de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Alitas_acevichadas_con_papas_fritas.png', 18.00),
    ('Alitas buffalo con papas fritas', ARRAY['alitas buffalo con papas fritas','alitas buffalo con papas fritas']::text[], 'Alitas con salsa buffalo, acompañadas de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Alitas_buffalo_con_papas_fritas.png', 18.00),
    ('Alitas chimichurri con papas fritas', ARRAY['alitas chimichurri con papas fritas','alitas chimichurri con papas fritas']::text[], 'Alitas con chimichurri, acompañadas de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Alitas_chimichurri_con_papas_fritas.png', 18.00),
    ('Alitas broaster con papas fritas', ARRAY['alitas broaster con papas fritas','alitas broaster con papas fritas']::text[], 'Alitas broaster crocantes acompañadas de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Alitas_broaster_con_papas_fritas.png', 18.00),
    ('Dúo de alitas', ARRAY['dúo de alitas','duo de alitas']::text[], 'Combinación de dos sabores de alitas, acompañada de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Duo_de_alitas.png', 22.00),
    ('Trío de alitas', ARRAY['trío de alitas','trio de alitas']::text[], 'Combinación de alitas servidas con papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Trio_de_alitas.png', 27.00),
    ('Festival de alitas', ARRAY['festival de alitas','festival de alitas']::text[], 'Festival de alitas BBQ, acevichadas, picantes y chimichurri, acompañado de papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377268/Festival_de_alitas.png', 40.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='alitas',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('alitas',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
-- Alitas picantes existentes: conservar ID e imagen; organizar en la sección Alitas.
UPDATE public.productos SET categoria_id='alitas' WHERE id=6 AND nombre='Alitas picantes (6 und)';
COMMIT;
