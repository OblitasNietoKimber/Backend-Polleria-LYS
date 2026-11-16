import { useRef, useState } from 'react';
import { requireInsforge } from '../../lib/insforge';

export default function StockControl({ product, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(null);
  async function save(event) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount === 0 || reason.trim().length < 5) {
      setError('Indica una cantidad distinta de cero y un motivo de al menos 5 caracteres.'); return;
    }
    const signature = JSON.stringify([product.id, amount, reason.trim()]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const { error: failure } = await requireInsforge().database.rpc('ajustar_inventario', {
        p_producto_id: product.id, p_cantidad: amount, p_motivo: reason.trim(), p_operacion: attempt.current.id,
      });
      if (failure) throw new Error(failure.message);
      window.dispatchEvent(new Event('catalog-stock-changed'));
      await onUpdated(); attempt.current = null; setOpen(false); setQuantity(''); setReason('');
    } catch (failure) { setError(failure.message || 'No se pudo ajustar el stock. Puedes reintentar.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-stock-control">
    <p>Stock: <strong>{product.stock}</strong> porciones disponibles</p>
    {product.inventoryScale === 8 && <p>Compartido: {product.inventoryAvailable} pollos a la brasa. Incluye fracciones y combos.</p>}
    <button className="btn-outline" onClick={() => setOpen(!open)} disabled={busy}>Ajustar existencias</button>
    {open && <form onSubmit={save}>
      <label>Cantidad a añadir o retirar ({product.inventoryScale === 8 ? 'pollos enteros' : 'unidades'})
        <input className="admin-form-input" type="number" step={1 / product.inventoryScale} value={quantity} onChange={e => setQuantity(e.target.value)} required disabled={busy}/>
      </label>
      <small>Usa una cantidad negativa para retirar. {product.inventoryScale === 8 ? 'El ajuste afecta a todos los platos del mismo inventario.' : 'Este ajuste afecta a este producto.'}</small>
      <label>Motivo<input className="admin-form-input" value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={250} required disabled={busy}/></label>
      {error && <p role="alert">{error}</p>}
      <button className="btn-ember" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ajuste'}</button>
    </form>}
  </div>;
}
