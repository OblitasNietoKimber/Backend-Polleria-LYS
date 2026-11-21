import { money } from '../utils/currency'
import { useCart } from '../context/CartContext'
import { getProductStock } from '../data/products'

export default function ProductCard({ product, onSelect }) {
  const { addToCart, cart, getAvailableStock } = useCart()
  const maxStock = getAvailableStock ? getAvailableStock(product) : getProductStock(product)
  const soldOut = !product.available || getProductStock(product) === 0
  const inCart = cart?.[product.id] || 0
  const isStockMax = product.available && inCart >= maxStock

  function handleAdd(event) {
    event.stopPropagation()
    addToCart(product)
  }

  return (
    <div className="ticket-card" onClick={() => onSelect?.(product)}>
      <div className={`product-card-media ${soldOut ? 'is-unavailable' : ''}`}>
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="product-card-image" />
      </div>

      <div className="product-card-body">
        {soldOut && <span className="font-mono product-card-unavailable-tag">NO DISPONIBLE</span>}
        {product.available && (
          <span className="font-mono product-card-stock-tag">
            {isStockMax ? `En carrito: ${inCart}/${maxStock} (Máx)` : `Stock: ${maxStock} disp.`}
          </span>
        )}

        <div className={`font-display product-card-name ${soldOut ? 'is-unavailable' : ''}`}>
          {product.name}
        </div>

        <p className="product-card-desc">
          {product.desc.slice(0, 70)}
          {product.desc.length > 70 ? '…' : ''}
        </p>

        <div className="product-card-footer">
          <span className="font-mono product-card-price">{money(product.price)}</span>

          <button
            className="btn-outline product-card-add-btn"
            disabled={soldOut || isStockMax}
            onClick={handleAdd}
            title={isStockMax ? `Alcanzaste el stock máximo (${maxStock} disp.)` : 'Agregar al carrito'}
          >
            {soldOut ? 'Agotado' : isStockMax ? 'Stock máx.' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
