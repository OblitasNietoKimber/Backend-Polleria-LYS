import { getProductStock } from '../data/products';

// Límite del producto, descontando otros platos del mismo recurso en el carrito.
// credit representa cantidades ya reservadas por una comanda que se está editando.
export function stockLimit(product, quantities, catalog, credit = {}) {
  if (!product?.inventoryId) return getProductStock(product);
  const byId = new Map(catalog.map(p => [String(p.id), p]));
  let units = product.inventoryAvailable * product.inventoryScale;
  for (const [id, qty] of Object.entries(credit)) {
    const item = byId.get(id);
    if (item?.inventoryId === product.inventoryId) units += qty * item.inventoryConsumption;
  }
  for (const [id, qty] of Object.entries(quantities)) {
    const item = byId.get(id);
    if (id !== String(product.id) && item?.inventoryId === product.inventoryId) units -= qty * item.inventoryConsumption;
  }
  return Math.max(0, Math.floor(units / product.inventoryConsumption));
}
