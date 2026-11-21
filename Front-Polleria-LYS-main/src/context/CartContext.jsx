import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { DELIVERY_COST } from '../data/products'
import { stockLimit } from '../utils/stock'
import { getCartProducts } from '../services/productService'
import { watchCatalog } from '../services/orderUpdates'
import orderService from '../services/orderService'
import { getCurrentUser } from '../services/authService'
import { orderSignature, readPendingOrder, savePendingOrder, clearPendingOrder } from '../utils/pendingOrder'
import { formatCodigoPedido } from '../utils/orderNumber'
import { assertValidForm, asForm } from '../utils/identityValidation'
import { normalizeDeliveryType, updateDeliveryField } from '../utils/deliveryValidation'
import { isCartQuantity, isProductId, MAX_CART_LINES, MAX_ITEM_QUANTITY, PAYMENT_METHODS, sanitizeStoredCart, validateCheckout } from '../utils/checkoutValidation'

const CartContext = createContext(null)
const CART_STORAGE_KEY = 'lys-cart'
const DELIVERY_STORAGE_KEY = 'lys-checkout-delivery'
const PAYMENT_STORAGE_KEY = 'lys-checkout-payment'
const ORDER_STORAGE_KEY = 'lys-order-number'

const EMPTY_FORM = { name: '', address: '', reference: '', phone: '' }
// Los datos de tarjeta NUNCA se guardan en localStorage (ni completos ni parciales):
// viven solo en memoria mientras dura la sesión de pago.
const EMPTY_CARD = { number: '', name: '', expiry: '', cvv: '' }

function readStoredCart() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    return raw ? sanitizeStoredCart(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

function readStoredDelivery() {
  if (typeof window === 'undefined') return { deliveryType: 'delivery', form: EMPTY_FORM }
  try {
    const raw = window.localStorage.getItem(DELIVERY_STORAGE_KEY)
    if (!raw) return { deliveryType: 'delivery', form: EMPTY_FORM }
    const parsed = JSON.parse(raw)
    const normalizedType = ['delivery', 'recojo'].includes(normalizeDeliveryType(parsed?.deliveryType)) ? normalizeDeliveryType(parsed.deliveryType) : 'delivery'
    const rawForm = asForm(parsed?.form)
    const sanitizedForm = Object.fromEntries(Object.keys(EMPTY_FORM).map(key => [key, typeof rawForm[key] === 'string' ? rawForm[key] : '']))
    if (rawForm.location != null) sanitizedForm.location = rawForm.location
    return { deliveryType: normalizedType, form: sanitizedForm }
  } catch {
    return { deliveryType: 'delivery', form: EMPTY_FORM }
  }
}

function readStoredPayment() {
  if (typeof window === 'undefined') return ''
  try {
    const payment = window.localStorage.getItem(PAYMENT_STORAGE_KEY)
    return PAYMENT_METHODS.includes(payment) ? payment : ''
  } catch {
    return ''
  }
}

function readStoredOrderNumber() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ORDER_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(readStoredCart)
  const [products, setProducts] = useState({})
  const [catalogState, setCatalogState] = useState({ ids: null, error: '' })
  const cartIds = Object.keys(cart).sort().join(',')
  const cartLoading = Boolean(cartIds) && catalogState.ids !== cartIds
  const cartError = catalogState.ids === cartIds ? catalogState.error : ''
  const missingCartIds = !cartLoading && cartError ? Object.keys(cart).filter(id => !products[id]) : []
  const [cartOpen, setCartOpen] = useState(false)
  const [deliveryType, setDeliveryTypeRaw] = useState(() => readStoredDelivery().deliveryType)
  const setDeliveryType = type => {
    if (['delivery', 'recojo'].includes(normalizeDeliveryType(type))) setDeliveryTypeRaw(normalizeDeliveryType(type))
  }
  const [form, setForm] = useState(() => readStoredDelivery().form)
  const [payment, setPaymentRaw] = useState(readStoredPayment)
  const setPayment = method => setPaymentRaw(PAYMENT_METHODS.includes(method) ? method : '')
  const [orderNumber, setOrderNumber] = useState(readStoredOrderNumber)
  const [card, setCard] = useState(EMPTY_CARD)
  const [cardReceipt, setCardReceipt] = useState(null)
  const [stockAlert, setStockAlert] = useState(null)
  const clearStockAlert = () => setStockAlert(null)

  useEffect(() => {
    if (!cartIds) return
    const ids = cartIds.split(',')
    let active = true, running = false, pending = false, rows = []
    async function refresh(changes) {
      if (changes && changes.every(change =>
        change.recurso === 'categorias' ||
        (change.recurso === 'productos' && change.productoId && !ids.includes(String(change.productoId))) ||
        (change.recurso === 'stock' && change.inventarioId && rows.length === ids.length &&
          rows.every(product => product.inventoryId !== change.inventarioId)),
      )) return
      pending = true
      if (running) return
      running = true
      do {
        pending = false
        try {
          rows = await getCartProducts(ids)
          if (active) {
            setProducts(Object.fromEntries(rows.map(product => [product.id, product])))
            setCatalogState({ ids: cartIds, error: rows.length < ids.length ? 'Un producto del carrito ya no está en el catálogo.' : '' })
          }
        } catch (error) {
          if (active) setCatalogState({ ids: cartIds, error: error.message })
        }
      } while (active && pending)
      running = false
    }
    const stop = watchCatalog(refresh)
    const refreshLocal = () => { void refresh() }
    window.addEventListener('catalog-stock-changed', refreshLocal)
    return () => {
      active = false
      stop()
      window.removeEventListener('catalog-stock-changed', refreshLocal)
    }
  }, [cartIds])

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // localStorage no disponible (modo privado, cuotas, etc.)
    }
  }, [cart])

  useEffect(() => {
    try {
      window.localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify({ deliveryType, form }))
    } catch {
      // localStorage no disponible (modo privado, cuotas, etc.)
    }
  }, [deliveryType, form])

  useEffect(() => {
    try {
      window.localStorage.setItem(PAYMENT_STORAGE_KEY, payment)
    } catch {
      // localStorage no disponible (modo privado, cuotas, etc.)
    }
  }, [payment])

  useEffect(() => {
    try {
      if (orderNumber) window.localStorage.setItem(ORDER_STORAGE_KEY, orderNumber)
      else window.localStorage.removeItem(ORDER_STORAGE_KEY)
    } catch {
      // localStorage no disponible (modo privado, cuotas, etc.)
    }
  }, [orderNumber])

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ product: products[id], qty }))
        .filter((item) => item.product && item.qty > 0),
    [cart, products]
  )
  const cartCount = cartItems.reduce((total, item) => total + item.qty, 0)
  const subtotal = cartItems.reduce((total, item) => total + item.qty * item.product.price, 0)
  const shipping = deliveryType === 'delivery' && subtotal > 0 ? DELIVERY_COST : 0
  const total = subtotal + shipping

  function openCart() {
    setCartOpen(true)
  }

  function closeCart() {
    setCartOpen(false)
  }

  function addToCart(product, qty = 1) {
    const id = product && typeof product === 'object' ? product.id : product
    if (!isProductId(id) || !isCartQuantity(qty)) return false
    if (!cart[id] && Object.keys(cart).length >= MAX_CART_LINES) return false
    const itemProduct = product && typeof product === 'object' ? product : (products[id] || { id })
    const stock = stockLimit(itemProduct, cart, [...Object.values(products), itemProduct])
    const maxStock = Number.isFinite(stock) ? Math.min(MAX_ITEM_QUANTITY, stock) : 0
    const currentQty = cart[id] || 0
    const targetQty = currentQty + qty

    if (typeof product === 'object') {
      if (!product.available) return false
      setProducts(current => ({ ...current, [id]: product }))
    }

    if (targetQty > maxStock) {
      const productName = itemProduct.name || `Producto #${id}`
      setStockAlert({
        id,
        message: `Solo quedan ${maxStock} unidades disponibles de "${productName}". Ya tienes ${currentQty} en tu carrito.`,
        maxStock,
      })
      setCartOpen(true)
      return false
    }

    setStockAlert(null)
    setCart((current) => ({ ...current, [id]: targetQty }))
    return true
  }

  function removeItem(id) {
    setCart((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setStockAlert(cur => (cur?.id === id ? null : cur))
  }

  function setQty(id, qty) {
    if (!isProductId(id) || !Number.isSafeInteger(qty) || qty < 0 || qty > MAX_ITEM_QUANTITY) return
    if (qty === 0) {
      setCart((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setStockAlert(cur => (cur?.id === id ? null : cur))
      return
    }

    const itemProduct = products[id] || { id }
    const stock = stockLimit(itemProduct, cart, Object.values(products))
    const maxStock = Number.isFinite(stock) ? Math.min(MAX_ITEM_QUANTITY, stock) : 0

    if (qty > maxStock) {
      const productName = itemProduct.name || `Producto #${id}`
      setStockAlert({
        id,
        message: `Solo quedan ${maxStock} unidades disponibles de "${productName}". No es posible seleccionar ${qty}.`,
        maxStock,
      })
      setCart(current => {
        const next = { ...current }
        if (maxStock > 0) next[id] = maxStock
        else delete next[id]
        return next
      })
      return
    }

    setStockAlert(cur => (cur?.id === id ? null : cur))
    setCart((current) => ({ ...current, [id]: qty }))
  }

  function updateFormField(field, value) {
    setForm(current => updateDeliveryField(current, field, value))
  }

  function updateCardField(field, value) {
    setCard((current) => ({ ...current, [field]: value }))
  }

  function clearCard() {
    setCard(EMPTY_CARD)
  }

  const pendingOrder = useRef(readPendingOrder());
  const confirmation = useRef(null);
  const isResumingOrder = useCallback(id => pendingOrder.current?.id === id &&
    pendingOrder.current.signature === orderSignature(getCurrentUser()?.id, {
      items: cartItems, deliveryType, form, payment,
    }), [cartItems, deliveryType, form, payment]);
  async function confirmOrder() {
    if (confirmation.current) return confirmation.current;
    if (cartLoading || cartError || !cartItems.length || cartItems.some(item => !item.product.available)) {
      throw new Error('Revisa los productos y su disponibilidad en el carrito antes de continuar.')
    }
    const user = getCurrentUser();
    if (!user || user.rol !== 'cliente') throw new Error('Debes iniciar sesión como cliente.');
    assertValidForm(validateCheckout({ items: cartItems, deliveryType, form, payment }, { checkStock: true }));

    // Restricción: solo se permite 1 pedido con pago en efectivo o Yape/Plin (contra entrega o recojo en caja)
    // hasta que el pago de dicho pedido anterior sea confirmado. Con tarjeta opera con normalidad.
    if (payment !== 'tarjeta') {
      const activeUnpaid = await orderService.getActiveUnpaidOrder().catch(() => null);
      if (activeUnpaid && !isResumingOrder(activeUnpaid.id)) {
        throw new Error(
          `Ya tienes un pedido en curso (${formatCodigoPedido(activeUnpaid.id)}) con pago pendiente en ${activeUnpaid.payment === 'efectivo' ? 'efectivo' : 'Yape / Plin'}. Hasta que no se confirme el pago de ese pedido, no puedes realizar otro en efectivo o Yape/Plin. Puedes pagar con Tarjeta para continuar.`
        );
      }
    }

    if (payment === 'tarjeta' && (!cardReceipt?.success || cardReceipt.status !== 'succeeded')) {
      throw new Error('Confirma el pago con tarjeta antes de crear el pedido.');
    }

    const request = { items: cartItems, deliveryType, form, payment, cardReceipt: payment === 'tarjeta' ? cardReceipt : null };
    const signature = orderSignature(user.id, request);
    if (pendingOrder.current?.signature !== signature) {
      pendingOrder.current = { id: crypto.randomUUID(), signature };
    }
    savePendingOrder(pendingOrder.current);
    confirmation.current = orderService.createOrder({ id: pendingOrder.current.id, ...request })
      .then(saved => {
        window.dispatchEvent(new Event('catalog-stock-changed'));
        setOrderNumber(saved.id); setCart({}); clearCard();
        pendingOrder.current = null; clearPendingOrder();
        return saved.id;
      }).catch(error => {
        window.dispatchEvent(new Event('catalog-stock-changed'));
        throw error;
      }).finally(() => { confirmation.current = null; });
    return confirmation.current;
  }

  function resetAll() {
    pendingOrder.current = null
    clearPendingOrder()
    setCart({})
    setDeliveryType('delivery')
    setForm(EMPTY_FORM)
    setPayment('')
    setOrderNumber(null)
    clearCard()
    setCardReceipt(null)
  }

  const value = {
    cart,
    isResumingOrder,
    getAvailableStock: product => stockLimit(product, cart, [...Object.values(products), product]),
    stockAlert,
    clearStockAlert,
    missingCartIds,
    cartLoading,
    cartError,
    cartItems,
    cartCount,
    subtotal,
    shipping,
    total,
    cartOpen,
    openCart,
    closeCart,
    addToCart,
    removeItem,
    setQty,
    deliveryType,
    setDeliveryType,
    form,
    updateFormField,
    payment,
    setPayment,
    card,
    updateCardField,
    clearCard,
    cardReceipt,
    setCardReceipt,
    orderNumber,
    confirmOrder,
    resetAll,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// El contexto mantiene su provider y su hook público en el mismo módulo.
// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart debe usarse dentro de un CartProvider')
  }
  return context
}
