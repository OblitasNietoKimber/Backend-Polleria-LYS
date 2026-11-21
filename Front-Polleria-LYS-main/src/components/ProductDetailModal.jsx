import { X } from 'lucide-react'

import { money } from '../utils/currency'
import { useCart } from '../context/CartContext'
import { getProductStock } from '../data/products'

export default function ProductDetailModal({ product, onClose }) {
  const { addToCart, cart, getAvailableStock } = useCart()

  if (!product) return null

  const maxStock = getAvailableStock ? getAvailableStock(product) : getProductStock(product)
  const soldOut = !product.available || getProductStock(product) === 0
  const inCart = cart?.[product.id] || 0
  const isStockMax = product.available && inCart >= maxStock

  function handleAdd() {
    const added = addToCart(product)
    if (added) onClose()
  }

  return (
    <div className="product-modal-overlay" onClick={onClose}>
      <div className="product-modal-panel" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="product-modal-close" aria-label="Cerrar detalle del producto">
          <X size={16} />
        </button>
        <div className="product-modal-media">
          <img
            src={product.image}
            alt={product.name}
            className={product.available ? '' : 'is-unavailable'}
          />
        </div>
        <div className="product-modal-body">
          {soldOut && <span className="font-mono product-modal-unavailable-tag">NO DISPONIBLE</span>}
          {product.available && (
            <span className="font-mono product-modal-stock-tag">
              {isStockMax ? `Alcanzaste el máximo (${inCart}/${maxStock} disp.)` : `Stock: ${maxStock} disponibles`}
            </span>
          )}
          <h3 className="font-display product-modal-title">{product.name}</h3>
          <p className="product-modal-desc">{product.desc}</p>
          <div className="product-modal-footer">
            <span className="font-mono product-modal-price">{money(product.price)}</span>
            <button className="btn-ember" disabled={soldOut || isStockMax} onClick={handleAdd}>
              {soldOut ? 'Agotado' : isStockMax ? 'Stock máximo' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
