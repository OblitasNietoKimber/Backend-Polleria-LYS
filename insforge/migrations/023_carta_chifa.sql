BEGIN;
-- Precios: página 3 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Chaufa de pollo', ARRAY['chaufa de pollo','chaufa de pollo']::text[], 'Arroz chaufa salteado al estilo chifa con trozos de pollo.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Chaufa_de_pollo.png', 13.00),
    ('Chaufa de carne de res', ARRAY['chaufa de carne de res','chaufa de carne de res']::text[], 'Arroz chaufa salteado con trozos de carne de res.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Chaufa_de_carne_de_res.png', 16.00),
    ('Chaufa de chancho', ARRAY['chaufa de chancho','chaufa de chancho']::text[], 'Arroz chaufa salteado con trozos de chancho.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Chaufa_de_chancho.png', 14.00),
    ('Chaufa salvaje', ARRAY['chaufa salvaje','chaufa salvaje']::text[], 'Arroz chaufa con carnes, camarones, huevo y verduras salteadas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Chaufa_salvaje.png', 15.00),
    ('Pollo con verduras estilo chifa', ARRAY['pollo con verduras estilo chifa','pollo con verduras estilo chifa']::text[], 'Pollo salteado con verduras, acompañado de arroz blanco y papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Pollo_con_verduras_estilo_chifa.png', 17.00),
    ('Aeropuerto', ARRAY['aeropuerto','aeropuerto']::text[], 'Combinación de arroz chaufa y fideos salteados al estilo chifa.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Aeropuerto.png', 13.00),
    ('Combinado chifa', ARRAY['combinado chifa','combinado chifa']::text[], 'Combinado de arroz chaufa y tallarines con acompañamientos al estilo chifa.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Combinado_chifa.png', 17.00),
    ('Tallarín chifa', ARRAY['tallarín chifa','tallarin chifa']::text[], 'Tallarines salteados con verduras y acompañamientos al estilo chifa.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Tallarin_chifa.png', 17.00),
    ('Tortilla con verduras estilo chifa', ARRAY['tortilla con verduras estilo chifa','tortilla con verduras estilo chifa']::text[], 'Tortilla de verduras con arroz blanco y papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Tortilla_con_verduras_estilo_chifa.png', 15.00),
    ('Frejolito saltado estilo chifa', ARRAY['frejolito saltado estilo chifa','frejolito saltado estilo chifa']::text[], 'Frejolitos salteados con carne y verduras, acompañados de arroz blanco y papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Frejolito_saltado_estilo_chifa.png', 17.00),
    ('Porción de wantán frito', ARRAY['porción de wantán frito','porcion de wantan frito']::text[], 'Porción de wantanes fritos, dorados y crocantes.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Porcion_de_wantan_frito.png', 8.00),
    ('Tipakay', ARRAY['tipakay','tipakay']::text[], 'Pollo crocante en salsa rojiza con arroz blanco y papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Tipakay.png', 17.00),
    ('Chijaukay', ARRAY['chijaukay','chijaukay']::text[], 'Pollo crocante bañado en salsa chijaukay, con arroz blanco y papas fritas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377309/Chijaukay.png', 17.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='chifa',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('chifa',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
