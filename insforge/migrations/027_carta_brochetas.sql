BEGIN;
-- Precios: página 6 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Anticuchos con papas', ARRAY['anticuchos con papas','anticuchos dos palitos con papas','anticucho de corazón','anticuchos','anticuchos dos palitos con papas']::text[], 'Dos palitos de anticucho a la parrilla acompañados de papas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Anticuchos_dos_palitos_con_papas.png', 17.00),
    ('Mollejitas con papas y ensalada', ARRAY['mollejitas con papas y ensalada','mollejitas con papas y ensalada']::text[], 'Mollejitas doradas a la parrilla con papas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Mollejitas_con_papas_y_ensalada.png', 17.00),
    ('Brochetas de pollo con papas y ensalada', ARRAY['brochetas de pollo con papas y ensalada','brochetas de pollo dos palitos con papas y ensalada']::text[], 'Dos palitos de brochetas de pollo a la parrilla con papas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Brochetas_de_pollo_dos_palitos_con_papas_y_ensalada.png', 17.00),
    ('Porción de rachi con papas y ensalada', ARRAY['porción de rachi con papas y ensalada','porcion de rachi con papas y ensalada']::text[], 'Porción de rachi a la parrilla con papas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Porcion_de_rachi_con_papas_y_ensalada.png', 18.00),
    ('Anticuchos y mollejitas', ARRAY['anticuchos y mollejitas','anticuchos y mollejitas dos palitos papas choclo ensalada']::text[], 'Dos palitos de anticucho con mollejitas, papas, choclo y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Anticuchos_y_mollejitas_dos_palitos_papas_choclo_ensalada.png', 23.00),
    ('Anticuchos y rachi', ARRAY['anticuchos y rachi','anticuchos y rachi dos palitos papas ensalada']::text[], 'Dos palitos de anticucho con rachi, papas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Anticuchos_y_rachi_dos_palitos_papas_ensalada.png', 25.00),
    ('Anticucho, rachi y chorizo', ARRAY['anticucho, rachi y chorizo','anticucho rachi y chorizo con papas y ensalada']::text[], 'Un palito de anticucho con rachi, chorizo, papas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377292/Anticucho_rachi_y_chorizo_con_papas_y_ensalada.png', 26.00)
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
