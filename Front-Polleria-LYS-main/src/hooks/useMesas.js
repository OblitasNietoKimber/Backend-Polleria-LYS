import { useState, useEffect, useCallback, useMemo } from 'react';
import mesaService from '../services/mesaService';

export default function useMesas(zona = 'salon_principal') {
  const [listaCompleta, setListaCompleta] = useState(() => mesaService.getMesas());
  const [actividades, setActividades] = useState(() => mesaService.getActividades());

  const recargar = useCallback(async () => {
    try {
      const actualizadas = await mesaService.fetchMesas();
      if (Array.isArray(actualizadas) && actualizadas.length > 0) {
        setListaCompleta(actualizadas);
      } else {
        setListaCompleta(mesaService.getMesas());
      }
    } catch {
      setListaCompleta(mesaService.getMesas());
    }
    try {
      const acts = await mesaService.fetchActividades();
      if (Array.isArray(acts)) {
        setActividades(acts);
      } else {
        setActividades(mesaService.getActividades());
      }
    } catch {
      setActividades(mesaService.getActividades());
    }
  }, []);

  useEffect(() => {
    recargar();

    let timer = null;

    function iniciarPolling() {
      if (!timer) {
        timer = setInterval(recargar, 5000);
      }
    }

    function detenerPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibilityChange() {
      if (typeof document !== 'undefined') {
        if (document.hidden) {
          detenerPolling();
        } else {
          recargar();
          iniciarPolling();
        }
      }
    }

    iniciarPolling();

    function onStorageEvent(e) {
      if (e.key === 'lys_mesas' || e.key === 'lys_actividades' || e.key === 'lys_pedidos') {
        recargar();
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorageEvent);
      window.addEventListener('lys_mesas_updated', recargar);
      window.addEventListener('lys_actividades_updated', recargar);
    }

    return () => {
      detenerPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorageEvent);
        window.removeEventListener('lys_mesas_updated', recargar);
        window.removeEventListener('lys_actividades_updated', recargar);
      }
    };
  }, [recargar]);

  // Derivación reactiva inmediata al cambiar zona
  const mesas = useMemo(() => {
    if (!zona || zona === 'todas') return listaCompleta;
    return listaCompleta.filter((m) => m.zona === zona);
  }, [listaCompleta, zona]);

  // Estadísticas calculadas al instante según la zona activa
  const estadisticas = useMemo(() => {
    const filtradas = (!zona || zona === 'todas') ? listaCompleta : listaCompleta.filter((m) => m.zona === zona);
    const total = filtradas.length || 1;
    const libres = filtradas.filter((m) => m.estado === 'libre').length;
    const ocupadas = filtradas.filter((m) => m.estado === 'ocupada').length;
    const reservadas = filtradas.filter((m) => m.estado === 'reservada').length;

    return {
      total,
      libres,
      ocupadas,
      reservadas,
      pctLibres: ((libres / total) * 100).toFixed(1),
      pctOcupadas: ((ocupadas / total) * 100).toFixed(1),
      pctReservadas: ((reservadas / total) * 100).toFixed(1),
    };
  }, [listaCompleta, zona]);

  return {
    mesas,
    estadisticas,
    actividades,
    recargar,
    liberarMesa: async (numero) => {
      await mesaService.liberarMesa(numero);
      await recargar();
    },
    reservarMesa: async (numero, datos) => {
      await mesaService.reservarMesa(numero, datos);
      await recargar();
    },
    ocuparMesa: (numero, pedidoId, total) => {
      mesaService.ocuparMesa(numero, pedidoId, total);
      recargar();
    },
  };
}
