export function generateOrderNumber() {
  return 'LS-' + Math.floor(1000 + Math.random() * 9000);
}

export function formatCodigoPedido(id) {
  if (!id) return '';
  let str = String(id).trim();
  if (str.startsWith('Pedido #')) {
    str = str.slice(8).trim();
  } else if (str.startsWith('Pedido')) {
    str = str.replace(/^Pedido\s*/, '').trim();
  } else if (str.startsWith('#')) {
    str = str.slice(1).trim();
  }

  if (str.length >= 20 && (str.includes('-') || /^[0-9a-fA-F]{20,}$/.test(str))) {
    return `Pedido #${str.slice(0, 8).toUpperCase()}`;
  }
  return `Pedido #${str}`;
}
