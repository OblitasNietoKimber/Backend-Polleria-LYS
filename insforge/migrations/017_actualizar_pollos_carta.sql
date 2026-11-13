BEGIN;
-- Carta adjunta, página 1: actualizar los productos existentes sin cambiar sus IDs.
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.productos p
  SET descripcion = menu.descripcion, imagen = menu.imagen, precio = menu.precio
  FROM (VALUES
    (1::bigint, 'Pollo a la brasa entero', 'Pollo entero a la brasa, acompañado de papas fritas y ensalada fresca de lechuga, tomate y cebolla.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Pollo_entero.png', 56.00),
    (2::bigint, '1/2 Pollo a la brasa', 'Medio pollo a la brasa, dorado y jugoso, con papas fritas y ensalada fresca de lechuga, tomate y cebolla.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Medio_pollo.png', 29.00),
    (3::bigint, '1/4 Pollo a la brasa', 'Cuarto de pollo a la brasa con papas fritas doradas y ensalada fresca de lechuga, tomate y cebolla.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Cuarto_de_pollo.png', 16.00)
  ) AS menu(id, nombre, descripcion, imagen, precio)
  WHERE p.id = menu.id AND p.categoria_id = 'pollos' AND lower(btrim(p.nombre)) = lower(menu.nombre);
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 3 THEN
    RAISE EXCEPTION 'Se esperaban los tres pollos existentes con IDs 1, 2 y 3; revisar el catálogo antes de actualizar.';
  END IF;
END;
$$;
COMMIT;
