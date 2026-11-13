import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';
import MesaIlustracion from './MesaIlustracion';
import mesaService from '../../services/mesaService';

export default function MesaCard({ mesa, onClick }) {
  const { numero, capacidad, forma, estado, inicioAt, totalAcumulado, horaReserva, clienteReserva } = mesa;

  // Tick local cada 60 s para que el contador de minutos se actualice sin esperar un evento de la DB.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (estado !== 'ocupada') return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [estado, inicioAt]);

  const minutos = estado === 'ocupada' ? mesaService.getMinutosOcupada(inicioAt) : 0;
  let tiempoTexto = `${minutos} min`;
  if (minutos >= 720) {
    tiempoTexto = '+12h (turno ant.)';
  } else if (minutos >= 60) {
    tiempoTexto = `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
  }
  const montoFormateado = totalAcumulado ? Number(totalAcumulado).toFixed(2) : '0.00';

  return (
    <div
      className={`mesa-card mesa-${estado}`}
      onClick={() => onClick(mesa)}
      role="button"
      tabIndex={0}
      title={`Mesa ${numero} - ${estado}`}
    >
      <div className="mesa-card-header">
        <span className="mesa-numero">Mesa {numero}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {mesa.cuentaSolicitada && (
            <span
              className="mesa-status-badge"
              style={{
                fontSize: '11px',
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                padding: '2px 6px',
                borderRadius: '6px',
              }}
              title="Cuenta solicitada a caja"
            >
              Cuenta pedida
            </span>
          )}
          <span className={`mesa-status-badge ${estado}`}>
            {estado}
          </span>
        </div>
      </div>

      <div className="mesa-visual-wrapper">
        <MesaIlustracion capacidad={capacidad} forma={forma} estado={estado} />
      </div>

      <div className="mesa-card-footer">
        <span className="mesa-capacidad-tag">
          {capacidad} {capacidad === 1 ? 'persona' : 'personas'}
        </span>

        {estado === 'ocupada' && (
          <div className="mesa-info-ocupada">
            <span className="mesa-tiempo">
              <Clock size={13} className="mesa-inline-icon" />
              <span>{tiempoTexto}</span>
            </span>
            <span className="mesa-total-soles">
              S/ {montoFormateado}
            </span>
          </div>
        )}

        {estado === 'reservada' && (
          <div className="mesa-info-reservada">
            <Calendar size={13} className="mesa-inline-icon" />
            <span className="mesa-reserva-hora">{horaReserva || 'Hoy'}</span>
            {clienteReserva && (
              <span className="mesa-reserva-cliente" title={clienteReserva}>
                · {clienteReserva}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
