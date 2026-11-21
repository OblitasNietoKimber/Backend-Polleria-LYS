import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';
import mesaService from '../../services/mesaService';
import {FLOW_PREVIEW} from '../../services/atencionService';
import AtencionCuentas from './AtencionCuentas';
import { PERSON_NAME_MAX_LENGTH } from '../../utils/identityValidation';
import { RESERVATION_FIRST_TIME, RESERVATION_LAST_TIME } from '../../utils/reservationTime';

export default function MesaDetalleModal({ mesa, onClose, onMesaUpdated, onNotificacion }) {
  const navigate = useNavigate();

  const [modoReserva, setModoReserva] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [horaReservaInput, setHoraReservaInput] = useState('');
  const [comensalesReserva, setComensalesReserva] = useState(() => mesa?.capacidad || 4);
  const [telefonoReserva, setTelefonoReserva] = useState('');
  const [errorReserva, setErrorReserva] = useState('');
  const [guardandoReserva, setGuardandoReserva] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState('');

  const [modoAnulacion, setModoAnulacion] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('Cliente se retiró sin pagar');
  const [cargandoAnulacion, setCargandoAnulacion] = useState(false);
  const pedidoActivo = mesa?.pedidoId ? { items: mesa.items, estadoCocina: mesa.estadoCocina } : null;

  if (!mesa) return null;

  const { numero, capacidad, estado, inicioAt, totalAcumulado, horaReserva } = mesa;
  const minutos = mesaService.getMinutosOcupada(inicioAt);
  let tiempoDetalle = `${minutos} minutos`;
  if (minutos >= 720) {
    const horas = Math.floor(minutos / 60);
    tiempoDetalle = `Turno anterior (+${horas}h) · Atención prolongada`;
  } else if (minutos >= 60) {
    tiempoDetalle = `${Math.floor(minutos / 60)}h ${minutos % 60}m (${minutos} min)`;
  }

  function handleIrAPedido() {
    onClose();
    navigate(`/mesas/${numero}/pedido`);
  }

  async function handleConfirmarReserva(event) {
    event.preventDefault();
    if (guardandoReserva) return;

    setErrorReserva('');
    setGuardandoReserva(true);
    try {
      await mesaService.reservarMesa(numero, {
        cliente: clienteNombre,
        hora: horaReservaInput,
        comensales: comensalesReserva,
        telefono: telefonoReserva,
      });
      if (onNotificacion) {
        onNotificacion(`Reserva para Mesa ${numero} guardada con éxito.`);
      }
      if (onMesaUpdated) onMesaUpdated();
      onClose();
    } catch (err) {
      setErrorReserva(err.message || 'Error al guardar la reserva');
    } finally {
      setGuardandoReserva(false);
    }
  }

  async function handleLiberarMesa() {
    setErrorOperacion('');
    if (mesa.pedidoId && mesa.estadoPago === 'pagado') {
      setErrorOperacion('La cuenta está pagada. La mesa se liberará al completar la entrega de cocina.');
      return;
    }
    if (mesa.pedidoId && Number(totalAcumulado || 0) > 0) {
      setModoAnulacion(true);
      return;
    }

    if (window.confirm(`¿Confirmas liberar la Mesa ${numero}?`)) {
      try {
        await mesaService.liberarMesa(numero);
        if (onNotificacion) {
          onNotificacion(`Mesa ${numero} liberada con éxito.`);
        }
        if (onMesaUpdated) onMesaUpdated();
        onClose();
      } catch (err) {
        console.error('Error al liberar mesa:', err);
        if (err.message && err.message.toLowerCase().includes('pago')) {
          setModoAnulacion(true);
        } else {
          setErrorOperacion(err.message || 'No se pudo liberar la mesa.');
        }
      }
    }
  }

  async function handleConfirmarAnulacion() {
    setErrorOperacion('');
    if (window.confirm(`¿Confirmas anular la comanda y liberar la Mesa ${numero}?\nMotivo: "${motivoAnulacion}"`)) {
      try {
        setCargandoAnulacion(true);
        await mesaService.anularComandaYLiberarMesa(numero, motivoAnulacion);
        if (onNotificacion) {
          onNotificacion(`Comanda anulada y Mesa ${numero} liberada con éxito.`);
        }
        if (onMesaUpdated) onMesaUpdated();
        onClose();
      } catch (err) {
        console.error('Error al anular y liberar mesa:', err);
        setErrorOperacion(err.message || 'No se pudo anular la comanda.');
      } finally {
        setCargandoAnulacion(false);
      }
    }

  }

  async function handleSolicitarCuenta() {
    setErrorOperacion('');
    if (mesa.pedidoId) {
      try {
        await mesaService.solicitarCuenta(mesa.pedidoId, numero);
        if (onNotificacion) {
          onNotificacion(`Se ha solicitado la cuenta de la Mesa ${numero} para Caja.`);
        }
        if (onMesaUpdated) onMesaUpdated();
        onClose();
      } catch (err) {
        console.error('Error al solicitar cuenta:', err);
        setErrorOperacion('No se pudo solicitar la cuenta: ' + (err.message || 'Error en el servidor'));
      }
    } else {
      setErrorOperacion(`La Mesa ${numero} no tiene un pedido activo.`);
    }
  }

  async function handleCancelarReserva() {
    if (window.confirm(`¿Confirmas cancelar la reserva de la Mesa ${numero}?`)) {
      try {
        await mesaService.liberarMesa(numero);
        if (onNotificacion) {
          onNotificacion(`Reserva de Mesa ${numero} cancelada con éxito.`);
        }
        if (onMesaUpdated) onMesaUpdated();
        onClose();
      } catch (err) {
        console.error('Error al cancelar reserva:', err);
        setErrorOperacion(err.message || 'No se pudo confirmar la cancelación de la reserva.');
      }
    }
  }

  return (
    <div className="mesa-modal-backdrop" onClick={onClose}>
      <div className="mesa-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mesa-modal-header">
          <div>
            <h3 className="mesa-modal-section-title">Mesa {numero}</h3>
            <span className="mesa-modal-subtitle">
              Capacidad: {capacidad} comensales · Zona {mesa.zona === 'terraza' ? 'Terraza' : mesa.zona === 'segundo_piso' ? 'Segundo piso' : 'Salón principal'}
            </span>
          </div>
          <span className={`mesa-status-badge ${estado}`}>
            {estado}
          </span>
        </div>

        <div className="mesa-modal-body">
          {errorOperacion && <p role="alert" className="mesa-reserva-error">{errorOperacion}</p>}
          {estado === 'libre' && !modoReserva && (
            <div className="mesa-empty-state">
              <p className="mesa-empty-text">
                Esta mesa se encuentra disponible para nuevos comensales.
              </p>
              <div className="mesa-actions-col">
                <button
                  className="btn-nuevo-pedido mesa-btn-block mesa-btn-block-lg"
                  onClick={handleIrAPedido}
                >
                  + Tomar pedido ahora
                </button>
                <button type="button" className="mesa-btn-reservar" onClick={() => setModoReserva(true)}>
                  <Calendar size={16} />
                  <span>Reservar esta mesa</span>
                </button>
              </div>
            </div>
          )}

          {estado === 'libre' && modoReserva && (
            <form className="mesa-reserva-form" noValidate onSubmit={handleConfirmarReserva}>
              <div className="mesa-reserva-form-head">
                <Calendar size={18} />
                <h4 className="mesa-reserva-form-title">Reserva para hoy · Mesa {numero}</h4>
              </div>

              <p className="mesa-reserva-horario">
                Horario de 12:00 p. m. a 11:00 p. m. (Lima). La mesa se aparta al guardar.
              </p>

              {errorReserva && <div role="alert" className="mesa-reserva-error">{errorReserva}</div>}

              <div className="mesa-reserva-fields">
                <div>
                  <label htmlFor="reserva-cliente" className="mesa-reserva-label">Nombre del cliente / grupo:</label>
                  <input
                    id="reserva-cliente"
                    type="text"
                    maxLength={PERSON_NAME_MAX_LENGTH}
                    required
                    placeholder="Ej: Familia López, Carlos Vega..."
                    value={clienteNombre}
                    onChange={(e) => {
                      setClienteNombre(e.target.value.replace(/\p{N}/gu, ''));
                      if (errorReserva) setErrorReserva('');
                    }}
                    className="mesa-reserva-input"
                  />
                </div>

                <div className="mesa-reserva-row">
                  <div>
                    <label htmlFor="reserva-hora" className="mesa-reserva-label">Hora programada:</label>
                    <input
                      id="reserva-hora"
                      type="time"
                      min={RESERVATION_FIRST_TIME}
                      max={RESERVATION_LAST_TIME}
                      required
                      value={horaReservaInput}
                      onChange={(e) => {
                        setHoraReservaInput(e.target.value);
                        setErrorReserva('');
                      }}
                      className="mesa-reserva-input"
                    />
                  </div>

                  <div>
                    <label htmlFor="reserva-comensales" className="mesa-reserva-label">Comensales:</label>
                    <input
                      id="reserva-comensales"
                      type="number"
                      min="1"
                      max={capacidad}
                      step="1"
                      required
                      value={comensalesReserva}
                      onChange={(e) => {
                        setComensalesReserva(e.target.value);
                        setErrorReserva('');
                      }}
                      className="mesa-reserva-input"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reserva-telefono" className="mesa-reserva-label">Celular de contacto (opcional):</label>
                  <input
                    id="reserva-telefono"
                    type="tel"
                    inputMode="numeric"
                    placeholder="Ej: 987654321"
                    value={telefonoReserva}
                    onChange={(e) => {
                      const celular = e.target.value.replace(/ /g, '');
                      if (/^[0-9]{0,9}$/.test(celular)) {
                        setTelefonoReserva(celular);
                        setErrorReserva('');
                      } else {
                        setErrorReserva('Ingresa hasta 9 dígitos en el celular.');
                      }
                    }}
                    className="mesa-reserva-input"
                  />
                </div>

                <div className="mesa-reserva-actions">
                  <button type="submit" disabled={guardandoReserva} className="mesa-reserva-save-btn">
                    {guardandoReserva ? 'Guardando…' : 'Guardar reserva'}
                  </button>
                  <button type="button" disabled={guardandoReserva} onClick={() => setModoReserva(false)} className="mesa-reserva-cancel-btn">
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          )}

          {estado === 'ocupada' && (
            <div>
              <div className="mesa-ocupada-info">
                <div className="mesa-ocupada-row">
                  <span className="mesa-ocupada-label">Tiempo en mesa:</span>
                  <span className="mesa-ocupada-value">
                    <Clock size={14} className="mesa-inline-icon" />
                    {tiempoDetalle}
                  </span>
                </div>
                <div className="mesa-ocupada-row">
                  <span className="mesa-ocupada-label">Total consumido:</span>
                  <span className="mesa-ocupada-total">S/ {Number(totalAcumulado || 0).toFixed(2)}</span>
                </div>
                {pedidoActivo && (
                  <div className="mesa-ocupada-row">
                    <span className="mesa-ocupada-label">Estado en cocina:</span>
                    <span className="mesa-ocupada-estado-cocina">
                      {pedidoActivo.estadoCocina === 'entregado' ? 'Entregado a mesera' : pedidoActivo.estadoCocina?.replace('_', ' ') || 'En espera'}
                    </span>
                  </div>
                )}
              </div>

              {FLOW_PREVIEW&&mesa.atencionId ? <AtencionCuentas mesa={mesa} onUpdated={onMesaUpdated} onError={setErrorOperacion} onClose={onClose}/> : <>
              {mesa.pedidoId && <p>Cuenta: {mesa.estadoPago === 'pagado' ? 'Pagada · Esperando entrega de cocina' : 'Pendiente de cobro'}</p>}

              {(pedidoActivo?.items?.length > 0 || mesa?.items?.length > 0) && (
                <div className="mesa-comanda-box">
                  <h4 className="mesa-comanda-title">Comanda actual</h4>
                  <ul className="mesa-comanda-list">
                    {(pedidoActivo?.items?.length > 0 ? pedidoActivo.items : mesa.items).map((it, idx) => (
                      <li key={idx}>
                        {it.cantidad}x {it.nombre} - S/ {((it.precio || 0) * (it.cantidad || 1)).toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {modoAnulacion ? (
                <div className="mesa-anulacion-box">
                  <h4 className="mesa-anulacion-title">
                    <AlertTriangle size={18} />
                    Liberar mesa con pedido pendiente
                  </h4>
                  <p className="mesa-anulacion-desc">
                    Esta mesa tiene un consumo registrado de <strong>S/ {Number(totalAcumulado || 0).toFixed(2)}</strong>.
                    Si el cliente pagará, solicite la cuenta para Caja. Si ocurrió un incidente (cliente se retiró, canceló pedido o comanda por error), elija el motivo para anular la comanda y desocupar la mesa:
                  </p>

                  <div style={{ marginBottom: '12px' }}>
                    <label className="mesa-reserva-label">Motivo de anulación / liberación:</label>
                    <select
                      value={motivoAnulacion}
                      onChange={(e) => setMotivoAnulacion(e.target.value)}
                      className="mesa-reserva-input"
                    >
                      <option value="Cliente se retiró sin pagar">Cliente se retiró sin pagar</option>
                      <option value="Cliente canceló la atención / reclamo">Cliente canceló la atención / reclamo</option>
                      <option value="Comanda registrada por error">Comanda registrada por error</option>
                      <option value="Mesa de prueba / limpieza de salón">Mesa de prueba / limpieza de salón</option>
                      <option value="Otro incidente de atención">Otro incidente de atención</option>
                    </select>
                  </div>

                  <div className="mesa-actions-col">
                    <button
                      type="button"
                      className="mesa-btn-danger"
                      onClick={handleConfirmarAnulacion}
                      disabled={cargandoAnulacion}
                    >
                      {cargandoAnulacion ? 'Anulando...' : 'Anular comanda y liberar mesa'}
                    </button>
                    <button
                      type="button"
                      className="mesa-btn-secondary-warn"
                      onClick={handleSolicitarCuenta}
                      disabled={cargandoAnulacion}
                    >
                      Solicitar cuenta para caja (Cobro regular)
                    </button>
                    <button
                      type="button"
                      className="mesa-btn-secondary-neutral"
                      onClick={() => setModoAnulacion(false)}
                      disabled={cargandoAnulacion}
                    >
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mesa-actions-col">
                  <button className="btn-nuevo-pedido mesa-btn-block" onClick={handleIrAPedido} disabled={mesa.estadoPago === 'pagado'}>
                    Ver / Agregar a la comanda
                  </button>
                  <button type="button" className="mesa-btn-secondary-warn" onClick={handleSolicitarCuenta} disabled={mesa.estadoPago === 'pagado'}>
                    Solicitar cuenta para caja
                  </button>
                  <button type="button" className="mesa-btn-secondary-neutral" onClick={handleLiberarMesa}>
                    Liberar mesa manualmente
                  </button>
                </div>
              )}
              </>}
            </div>
          )}

          {estado === 'reservada' && (
            <div className="mesa-reservada-wrap">
              <div className="mesa-reservada-card">
                <div className="mesa-reservada-head">
                  <div className="mesa-reservada-icon-wrap">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h4 className="mesa-reservada-title">Reserva programada</h4>
                    <span className="mesa-reservada-subtitle">Mesa reservada y apartada</span>
                  </div>
                </div>

                <div className="mesa-reservada-grid mesa-reservada-grid-first">
                  <div>
                    <span className="mesa-reservada-field-label">Cliente:</span>
                    <strong className="mesa-reservada-field-value">{mesa.clienteReserva || 'Cliente'}</strong>
                  </div>
                  <div>
                    <span className="mesa-reservada-field-label">Hora:</span>
                    <strong className="mesa-reservada-field-value-accent">{horaReserva ? `${horaReserva} hrs` : 'Sin hora registrada'}</strong>
                  </div>
                </div>

                <div className="mesa-reservada-grid">
                  <div>
                    <span className="mesa-reservada-field-label">Comensales:</span>
                    <strong className="mesa-reservada-field-value">{mesa.comensalesReserva || capacidad} personas</strong>
                  </div>
                  <div>
                    <span className="mesa-reservada-field-label">Teléfono:</span>
                    <span className="mesa-reservada-field-text">{mesa.telefonoReserva || 'Sin registrar'}</span>
                  </div>
                </div>
              </div>

              <div className="mesa-actions-col">
                <button className="btn-nuevo-pedido mesa-btn-block" onClick={handleIrAPedido}>
                  <CheckCircle2 size={18} className="mesa-btn-icon-inline" />
                  Llegó el cliente · Sentar y abrir pedido
                </button>
                <button type="button" className="mesa-btn-secondary-neutral" onClick={handleCancelarReserva}>
                  Cancelar / Liberar reserva
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mesa-modal-footer">
          <button type="button" className="mesa-modal-close-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
