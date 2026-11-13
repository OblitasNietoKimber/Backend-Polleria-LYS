BEGIN;
-- Precios: página 7 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Chicharrón de chancho', ARRAY['chicharrón de chancho','chicharron de chancho']::text[], 'Chicharrón de chancho crocante con yuca y ensalada de cebolla y tomate.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377294/Chicharron_de_chancho.png', 25.00),
    ('Trucha frita', ARRAY['trucha frita','trucha frita']::text[], 'Trucha frita dorada con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377294/Trucha_frita.png', 20.00),
    ('1/2 Cuy chactado', ARRAY['1/2 cuy chactado','medio cuy chactado']::text[], 'Medio cuy chactado crocante con papas y ensalada de cebolla y tomate.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377294/Medio_cuy_chactado.png', 30.00),
    ('Cuy entero chactado', ARRAY['cuy entero chactado','cuy entero chactado']::text[], 'Cuy entero chactado con papas fritas y ensalada fresca.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377294/Cuy_entero_chactado.png', 60.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='criollos',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('criollos',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
