BEGIN;
-- Precios: página 2 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Alitas broaster con papas y ensalada', ARRAY['alitas broaster con papas y ensalada','alitas broaster con papas y ensalada']::text[], 'Alitas de pollo broaster crocantes, acompañadas de papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Alitas_broaster_con_papas_y_ensalada.png', 10.00),
    ('Broaster de pollo con papas y ensalada', ARRAY['broaster de pollo con papas y ensalada','broaster de pollo con papas y ensalada']::text[], 'Pollo broaster de cobertura crocante con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Broaster_de_pollo_con_papas_y_ensalada.png', 14.00),
    ('Pollo broaster con arroz chaufa', ARRAY['pollo broaster con arroz chaufa','pollo broaster con arroz chaufa papas y ensalada']::text[], 'Pollo broaster crocante servido con arroz chaufa, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Pollo_broaster_con_arroz_chaufa_papas_y_ensalada.png', 15.00),
    ('Pollo broaster con arroz blanco', ARRAY['pollo broaster con arroz blanco','pollo broaster con arroz blanco papas y ensalada']::text[], 'Pollo broaster acompañado de arroz blanco, papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Pollo_broaster_con_arroz_blanco_papas_y_ensalada.png', 14.00),
    ('Salchipapa con ensalada', ARRAY['salchipapa con ensalada','salchipapa con ensalada']::text[], 'Salchichas doradas sobre papas fritas, acompañadas de ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Salchipapa_con_ensalada.png', 8.00),
    ('Salchipapa especial', ARRAY['salchipapa especial','salchipapa especial con huevo frito y ensalada']::text[], 'Salchipapa con papas fritas, huevo frito y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Salchipapa_especial_con_huevo_frito_y_ensalada.png', 10.00),
    ('Combo broaster 1', ARRAY['combo broaster 1','combo broaster 1']::text[], 'Una pieza de pollo broaster con papas fritas, ensalada y gaseosa personal.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Combo_broaster_1.png', 16.00),
    ('Combo broaster 2', ARRAY['combo broaster 2','combo broaster 2']::text[], 'Dos piezas de pollo broaster con papas fritas, ensalada y gaseosa personal.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377299/Combo_broaster_2.png', 20.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='broaster',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('broaster',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
