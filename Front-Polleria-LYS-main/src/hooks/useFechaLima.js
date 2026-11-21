import { useEffect, useState } from 'react';
import { fechaLima } from '../utils/cajaSummary';

export default function useFechaLima() {
  const [fecha, setFecha] = useState(fechaLima);
  useEffect(() => {
    let timer;
    function programar() {
      clearTimeout(timer);
      const hoy = fechaLima();
      setFecha(hoy);
      const siguienteDia = Date.parse(`${hoy}T00:00:00-05:00`) + 86400000;
      timer = setTimeout(programar, Math.max(1, siguienteDia - Date.now()));
    }
    const recobrarFecha = () => { if (document.visibilityState === 'visible') programar(); };
    timer = setTimeout(programar, 0);
    document.addEventListener('visibilitychange', recobrarFecha);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', recobrarFecha);
    };
  }, []);
  return fecha;
}
