BEGIN;
-- Precios: página 6 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Pechuga al orégano', ARRAY['pechuga al orégano','pechuga al oregano']::text[], 'Pechuga de pollo al orégano con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Pechuga_al_oregano.png', 20.00),
    ('Pechuga especial', ARRAY['pechuga especial','pechuga especial']::text[], 'Pechuga de pollo dorada con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Pechuga_especial.png', 27.00),
    ('Pechuga a la parrilla', ARRAY['pechuga a la parrilla','pechuga a la parrilla']::text[], 'Pechuga de pollo a la parrilla con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Pechuga_a_la_parrilla.png', 20.00),
    ('Bistec a la parrilla', ARRAY['bistec a la parrilla','bistec a la parrilla']::text[], 'Bistec de res a la parrilla con arroz blanco, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Bistec_a_la_parrilla.png', 20.00),
    ('Churrasco a la parrilla', ARRAY['churrasco a la parrilla','churrasco a la parrilla']::text[], 'Churrasco de res a la parrilla acompañado de papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Churrasco_a_la_parrilla.png', 22.00),
    ('Chuleta a la parrilla', ARRAY['chuleta a la parrilla','chuleta a la parrilla']::text[], 'Chuleta a la parrilla con arroz blanco, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Chuleta_a_la_parrilla.png', 20.00),
    ('Milanesa', ARRAY['milanesa','milanesa']::text[], 'Milanesa dorada y crocante con papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Milanesa.png', 20.00),
    ('Porción de chorizo', ARRAY['porción de chorizo','porcion de chorizo']::text[], 'Chorizos dorados a la parrilla con papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377288/Porcion_de_chorizo.png', 14.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='parrillas',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('parrillas',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
