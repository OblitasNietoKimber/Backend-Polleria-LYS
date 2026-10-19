BEGIN;
-- Precios: página 2 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Mostro', ARRAY['mostro','mostro']::text[], 'Un cuarto de pollo con arroz chaufa, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377301/Mostro.png', 18.00),
    ('Mostrito', ARRAY['mostrito','mostrito']::text[], 'Un octavo de pollo acompañado de arroz chaufa, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377301/Mostrito.png', 13.00),
    ('Pollo loko', ARRAY['pollo loko','pollo loko']::text[], 'Un cuarto de pollo con chorizo y plátano frito.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377301/Pollo_loko.png', 20.00),
    ('Sabrosito', ARRAY['sabrosito','sabrosito']::text[], 'Un octavo de pollo con arroz chaufa, papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377301/Sabrosito.png', 14.00),
    ('Combo extremo', ARRAY['combo extremo','combo extremo']::text[], 'Un cuarto de pollo con anticucho, chorizo, papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377301/Combo_extremo.png', 22.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='mostros',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('mostros',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
