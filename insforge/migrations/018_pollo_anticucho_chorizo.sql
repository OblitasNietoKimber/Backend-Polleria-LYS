BEGIN;
-- Reutiliza el producto si ya existe por nombre equivalente o por la misma imagen.
DO $$
DECLARE product_id bigint; matches integer;
BEGIN
  SELECT count(*), min(id) INTO matches, product_id
  FROM public.productos
  WHERE lower(btrim(nombre)) IN (
    '1/4 pollo a la brasa con anticucho y chorizo',
    '1/4 pollo con anticucho y chorizo',
    'cuarto de pollo con anticucho y chorizo'
  ) OR imagen = 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Cuarto_de_pollo_con_anticucho_y_chorizo.png';
  IF matches > 1 THEN
    RAISE EXCEPTION 'Hay más de un cuarto con anticucho y chorizo; revisar duplicados sin borrar referencias de pedidos.';
  ELSIF matches = 1 THEN
    UPDATE public.productos SET categoria_id = 'pollos', nombre = '1/4 Pollo a la brasa con anticucho y chorizo',
      descripcion = 'Cuarto de pollo a la brasa con anticucho, chorizo a la parrilla, papas fritas y ensalada fresca de lechuga, tomate y cebolla.',
      imagen = 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Cuarto_de_pollo_con_anticucho_y_chorizo.png', precio = 20.00
    WHERE id = product_id;
  ELSE
    INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
    VALUES ('pollos', '1/4 Pollo a la brasa con anticucho y chorizo',
      'Cuarto de pollo a la brasa con anticucho, chorizo a la parrilla, papas fritas y ensalada fresca de lechuga, tomate y cebolla.',
      'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Cuarto_de_pollo_con_anticucho_y_chorizo.png', 20.00, true);
  END IF;
END;
$$;
COMMIT;
