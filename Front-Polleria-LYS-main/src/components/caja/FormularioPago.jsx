import PaymentMethodLogo from "./PaymentMethodLogo";

const METODOS = [
  { nombre: "Efectivo" },
  { nombre: "Yape" },
  { nombre: "Plin" },
  { nombre: "Tarjeta" },
];

export default function FormularioPago({
  metodo,
  onMetodoChange,
  monto,
  onMontoChange,
  total,
  disabled = false,
  metodoSolicitado = null,
  puedeModificarMetodo = false,
  onToggleModificarMetodo = null,
}) {
  const base = Math.ceil(total / 10) * 10;
  const montosRapidos = [...new Set([base, Math.max(100, base), Math.max(200, base)])];
  const tieneMetodoSolicitado = Boolean(metodoSolicitado);
  const botonesBloqueados = disabled || (tieneMetodoSolicitado && !puedeModificarMetodo);

  return (
    <div className="caja-payment">
      <div className="caja-metodo-header">
        <p className="caja-label">Método de pago</p>
        {tieneMetodoSolicitado && (
          <label className="caja-modificar-metodo-check">
            <input
              type="checkbox"
              checked={puedeModificarMetodo}
              onChange={(e) => onToggleModificarMetodo?.(e.target.checked)}
              disabled={disabled}
            />
            <span>Modificar método</span>
          </label>
        )}
      </div>

      {tieneMetodoSolicitado && !puedeModificarMetodo && (
        <div className="caja-metodo-auto-note">
          <span>Seleccionado en carrito: <strong>{metodoSolicitado}</strong></span>
        </div>
      )}

      <div className="caja-metodos">
        {METODOS.map(({ nombre }) => (
          <button
            type="button"
            key={nombre}
            disabled={botonesBloqueados}
            className={metodo === nombre ? "active" : ""}
            onClick={() => onMetodoChange(nombre)}
            aria-pressed={metodo === nombre}
            title={tieneMetodoSolicitado && !puedeModificarMetodo ? "Marca 'Modificar método' para cambiarlo" : undefined}
          >
            <PaymentMethodLogo method={nombre} />
            {nombre}
          </button>
        ))}
      </div>

      {metodo === "Efectivo" ? (
        <>
          <label className="caja-label" htmlFor="monto-recibido">Monto recibido</label>
          <div className="caja-money-input">
            <span>S/</span>
            <input
              id="monto-recibido"
              disabled={disabled}
              type="number"
              min="0"
              max="10000"
              step="0.01"
              placeholder="0.00"
              value={monto}
              onChange={(e) => {
                const valor = e.target.value;
                if (valor === "" || Number.parseFloat(valor) <= 10000) onMontoChange(valor);
              }}
            />
          </div>
          <div className="caja-quick-amounts" aria-label="Montos rápidos">
            <span>Montos rápidos</span>
            {montosRapidos.map((valor) => (
              <button type="button" key={valor} disabled={disabled} onClick={() => onMontoChange(String(valor))}>
                S/ {valor}
              </button>
            ))}
            <button type="button" disabled={disabled} onClick={() => onMontoChange(total.toFixed(2))}>Exacto</button>
          </div>
        </>
      ) : (
        <div className="caja-digital-note">
          El importe de S/ {total.toFixed(2)} se registrará con {metodo}.
        </div>
      )}
    </div>
  );
}
