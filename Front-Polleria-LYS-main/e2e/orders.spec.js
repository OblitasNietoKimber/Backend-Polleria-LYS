import { Buffer } from 'node:buffer'
import { test, expect } from './fixtures'
const identity = { id: '10000000-0000-0000-0000-000000000001', email: 'cliente@example.test', emailVerified: true, profile: { name: 'Cliente Prueba' } }
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: identity.id, exp: 4102444800 })).toString('base64url')}.test`
const form = { name: 'Cliente Prueba', phone: '987654321', address: 'Av. Prueba 123', location: { lat: -11.88, lng: -77.03, address: 'Av. Prueba 123' }, reference: '' }
const uuid = '20000000-0000-0000-0000-000000000099'
const fixture = { id: uuid, tipo: 'delivery', estado: 'pendiente', destinatario: form, metodo_solicitado: 'efectivo',
  subtotal: '128.70', envio: '6.00', total: '134.70', creado_en: '2026-10-16T16:00:00Z',
  detalles_pedido: [{ producto_id: 1, cantidad: 3, precio_unitario: '42.90', nombre_producto: 'Pollo a la Brasa con papas, ensalada y todas las cremas de la casa' }] }
async function backend(page, { type = 'delivery', failFirst = false, failRead = false, initial = false,
  foreign = false, paginated = false, cancelled = false, longHistory = false } = {}) {
  let saved = initial ? { ...fixture, estado: cancelled ? 'cancelado' : 'pendiente' } : null
  const confirmations = [], queries = []
  await page.addInitScript(({ type, form }) => {
    if (!localStorage.getItem('lys-cart')) localStorage.setItem('lys-cart', JSON.stringify({ 1: 1 }))
    if (!localStorage.getItem('lys-checkout-delivery')) localStorage.setItem('lys-checkout-delivery', JSON.stringify({ deliveryType: type, form }))
    if (!localStorage.getItem('lys-checkout-payment')) localStorage.setItem('lys-checkout-payment', 'efectivo')
  }, { type, form })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    queries.push(url)
    let response = [], status = 200
    if (path.endsWith('/auth/refresh')) response = { user: identity, accessToken: token, csrfToken: 'test' }
    else if (path.endsWith('/auth/public-config')) response = { oAuthProviders: [], requireEmailVerification: true }
    else if (path.endsWith('/records/perfiles')) response = { id: identity.id, nombre: 'Cliente', apellido: 'Prueba', telefono: form.phone, rol: 'cliente', preferencias: {} }
    else if (path.endsWith('/records/productos_catalogo')) response = { id: 1, categoria_id: 'pollos', nombre: 'Pollo a la Brasa', precio: '42.90', descripcion: '', stock: 50, disponible: true }
    else if (path.includes('/rpc/crear_pedido_cliente')) {
      const body = req.postDataJSON(); confirmations.push(body)
      saved = { ...fixture, id: body.solicitud_id, tipo: body.tipo_entrega, destinatario: body.datos_entrega,
        subtotal: '42.90', envio: type === 'delivery' ? '6.00' : '0.00', total: type === 'delivery' ? '48.90' : '42.90',
        detalles_pedido: [{ producto_id: 1, cantidad: 1, precio_unitario: '42.90', nombre_producto: 'Pollo a la Brasa' }] }
      if (failFirst && confirmations.length === 1) { status = 503; response = { message: 'Respuesta interrumpida' } }
      else response = saved.id
    } else if (path.endsWith('/records/pedidos')) {
      if (foreign) response = null
      else if (url.searchParams.get('select') === 'estado') response = { estado: saved?.estado || 'pendiente' }
      else if (url.searchParams.has('id')) {
        if (failRead && confirmations.length === 1) { status = 400; response = { message: 'Lectura interrumpida' } }
        else response = saved
      } else if (paginated) {
        const start = Number(url.searchParams.get('offset') || 0)
        response = Array.from({ length: start === 0 ? 20 : 1 }, (_, index) => ({ ...fixture,
          id: `20000000-0000-0000-0000-${String(start + index + 100).padStart(12, '0')}` }))
      } else response = saved ? [saved] : []
    } else if (path.endsWith('/records/historial_estados_pedido')) {
      const history = Array.from({ length: longHistory ? 53 : 1 }, (_, index) => ({ id: index + 1,
        estado_anterior: null, estado: saved?.estado || 'pendiente', cambiado_en: '2026-10-16T16:00:00Z', es_reconstruido: false })).reverse()
      const before = Number(url.searchParams.get('id')?.slice(3) || 1000)
      response = history.filter(entry => entry.id < before).slice(0, 50)
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) })
  })
  return { confirmations, queries }
}
for (const type of ['delivery', 'recojo']) {
  test(`confirma ${type} con importes guardados y abre el detalle`, async ({ page }) => {
    const { confirmations } = await backend(page, { type })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/checkout/resumen')
    await page.getByRole('button', { name: /Confirmar pedido/ }).click()
    await expect(page.getByText('¡Pedido confirmado!')).toBeVisible()
    expect(confirmations).toHaveLength(1)
    expect(confirmations[0].articulos).toEqual([{ id: 1, qty: 1 }])
    expect(confirmations[0]).not.toHaveProperty('total')
    await page.getByRole('link', { name: 'Ver mi pedido' }).click()
    await expect(page.locator('h1').filter({has:page.getByRole('button',{name:'Copiar número de pedido'})})).toHaveAttribute('title',confirmations[0].solicitud_id)
    await expect(page.getByRole('region', { name: 'Historial de estados' })).toContainText('Recibido')
    await expect(page.locator('.order-item-row.total')).toContainText(type === 'delivery' ? 'S/ 48.90' : 'S/ 42.90')
    expect(await page.evaluate(() => localStorage.getItem('lys-pending-order'))).toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('un nombre numérico guardado en localStorage bloquea saltarse entrega y confirmar', async ({ page }) => {
  const { confirmations } = await backend(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lys-checkout-delivery', JSON.stringify({
    deliveryType: 'delivery', form: { name: '12345678', phone: '987654321', address: 'Av. Prueba 123', location: { lat: -11.88, lng: -77.03, address: 'Av. Prueba 123' } },
  })));
  await page.goto('/checkout/resumen');
  await expect(page.getByText('El nombre no puede contener números.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar pedido/ })).toBeDisabled();
  expect(confirmations).toHaveLength(0);
});

test('el nombre de entrega impide números al escribir, pegar o rellenar el input', async ({ page }) => {
  await backend(page);
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/checkout/entrega');
  const input = page.getByPlaceholder('Ej. María Torres López');
  await input.fill('');
  await input.pressSequentially('María123');
  await expect(input).toHaveValue('María');
  await input.fill('');
  await input.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '123١٢٣１２３');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveValue('');
  await input.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'María2 Torres3');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveValue('María Torres');
  await input.fill('María99 Torres88');
  await expect(input).toHaveValue('María Torres');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lys-checkout-delivery')).form.name)).toBe('María Torres');
});

for (const quantity of [-1, 1.5, '2', 101]) {
  test(`un carrito alterado con cantidad ${JSON.stringify(quantity)} no permite confirmar`, async ({ page }) => {
    const { confirmations } = await backend(page);
    await page.goto('/');
    await page.evaluate(qty => localStorage.setItem('lys-cart', JSON.stringify({ 1: qty })), quantity);
    await page.goto('/checkout/resumen');
    await expect(page.getByRole('button', { name: /Confirmar pedido/ })).toBeDisabled();
    expect(confirmations).toHaveLength(0);
  });
}

test('el stock del servidor bloquea un carrito restaurado con cantidades superiores al saldo', async ({ page }) => {
  const { confirmations } = await backend(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lys-cart', JSON.stringify({ 1: 51 })));
  await page.goto('/checkout/resumen');
  await expect(page.getByText('El carrito supera el stock disponible. Revisa las cantidades.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar pedido/ })).toBeDisabled();
  expect(confirmations).toHaveLength(0);
});
for (const failure of ['respuesta', 'lectura']) {
  test(`reintenta tras perder la ${failure} y recargar sin duplicar la solicitud`, async ({ page }) => {
    const { confirmations } = await backend(page, { failFirst: failure === 'respuesta', failRead: failure === 'lectura' })
    await page.goto('/checkout/resumen')
    await page.getByRole('button', { name: /Confirmar pedido/ }).click()
    await expect(page.getByRole('alert')).toContainText(/interrumpida/)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lys-cart')))).toEqual({ 1: 1 })
    await page.reload()
    await page.getByRole('button', { name: /Confirmar pedido/ }).click()
    await expect(page.getByText('¡Pedido confirmado!')).toBeVisible()
    expect(confirmations).toHaveLength(2)
    expect(confirmations[0].solicitud_id).toBe(confirmations[1].solicitud_id)
  })
}
test('cambiar el contacto tras confirmar sin respuesta no elude el pedido pendiente', async ({ page }) => {
  const { confirmations } = await backend(page, { failFirst: true })
  await page.goto('/checkout/resumen')
  await page.getByRole('button', { name: /Confirmar pedido/ }).click()
  await expect(page.getByRole('alert')).toContainText('interrumpida')
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lys-checkout-delivery'))
    state.form.address = 'Av. Otra dirección 456'
    localStorage.setItem('lys-checkout-delivery', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('pendiente de pago')
  await expect(page.getByRole('button', { name: /Confirmar pedido/ })).toBeDisabled()
  expect(confirmations).toHaveLength(1)
})

test('no muestra un pedido ajeno ni consulta su historial si no está disponible', async ({ page }) => {
  const { queries } = await backend(page, { foreign: true })
  await page.goto(`/pedidos/${uuid}`)
  await expect(page.getByText('No encontramos ese pedido.')).toBeVisible()
  expect(queries.some(url => url.pathname.endsWith('historial_estados_pedido'))).toBe(false)
})
test('pagina pedidos y permite volver sin descargar todos los registros', async ({ page }) => {
  const { queries } = await backend(page, { paginated: true })
  await page.goto('/pedidos')
  await expect(page.locator('.order-card')).toHaveCount(20)
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByText('Página 2')).toBeVisible()
  await expect(page.locator('.order-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled()
  expect(queries.some(url => url.searchParams.get('offset') === '20' && url.searchParams.get('limit') === '20')).toBe(true)
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await expect(page.locator('.order-card')).toHaveCount(20)
})
test('consulta los cambios anteriores del historial y puede actualizar el más reciente', async ({ page }) => {
  await backend(page, { initial: true, longHistory: true })
  await page.goto(`/pedidos/${uuid}`)
  const history = page.getByRole('region', { name: 'Historial de estados' })
  await expect(history.locator('li')).toHaveCount(50)
  await history.getByRole('button', { name: 'Ver estados anteriores' }).click()
  await expect(history.locator('li')).toHaveCount(3)
  await history.getByRole('button', { name: 'Actualizar historial' }).click()
  await expect(history.locator('li')).toHaveCount(50)
})
test('muestra la cancelación sin sugerir avance normal en el stepper', async ({ page }) => {
  await backend(page, { initial: true, cancelled: true })
  await page.goto(`/pedidos/${uuid}`)
  await expect(page.getByText('Este pedido fue cancelado.')).toBeVisible()
  await expect(page.locator('.status-stepper')).toHaveCount(0)
})
for (const width of [320, 390, 768, 876, 1280]) {
  test(`tarjeta legible sin superposiciones a ${width}px`, async ({ page }) => {
    await backend(page, { initial: true })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/pedidos')
    const card = page.locator('.order-card')
    await expect(card).toContainText('S/ 134.70')
    await card.evaluate(async element => {
      await document.fonts.ready
      await Promise.all(element.getAnimations().map(animation => animation.finished))
    })
    const layout = await card.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const boxes = ['.order-card-icon', '.order-card-info', '.order-card-product', '.order-card-status-col', '.order-card-cta']
        .map(selector => element.querySelector(selector).getBoundingClientRect())
      return {
        contained: boxes.every(box => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom),
        overlaps: boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1)),
        textVisible: ['.order-card-id', '.order-card-product-name', '.order-card-count-tag'].every(selector => {
          const node = element.querySelector(selector)
          return node.clientWidth > 0 && node.scrollWidth <= node.clientWidth + 1
        }),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    expect(layout).toEqual({ contained: true, overlaps: false, textVisible: true, overflow: false })
    if (width === 876) await page.screenshot({ path: test.info().outputPath('tarjeta-pedidos.png') })
    await card.click()
    await expect(page.locator('h1.order-detail-id')).toHaveAttribute('title',uuid)
  })
}


test('entrega respeta límites aunque se manipule maxlength y se pegue texto', async ({ page }) => {
  await backend(page)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] } }))
  await page.goto('/checkout/entrega')
  const fields = [
    [page.getByPlaceholder('Ej. María Torres López'), 120, 'a'],
    [page.getByPlaceholder('Ej. Frente al parque, fachada azul, piso 2...'), 150, 'r'],
    [page.getByRole('combobox'), 150, 'c'],
    [page.getByPlaceholder('9XXXXXXXX'), 9, '9'],
  ]
  for (const [input, limit, character] of fields) {
    // Un límite reducido no debe bloquear la escritura antes del onChange.
    await input.evaluate(element => element.setAttribute('maxlength', '2'))
    await expect(input).toHaveAttribute('maxlength', String(limit))
    await input.fill('')
    await input.pressSequentially(character.repeat(5))
    await expect(input).toHaveValue(character.repeat(5))
    await input.evaluate(element => element.setAttribute('maxlength', '9999'))
    await expect(input).toHaveAttribute('maxlength', String(limit))
    await input.evaluate(element => element.removeAttribute('maxlength'))
    await expect(input).toHaveAttribute('maxlength', String(limit))
    await input.fill(character.repeat(limit + 60))
    await expect(input).toHaveValue(character.repeat(limit))
    await input.press('End')
    await input.pressSequentially(character.repeat(3))
    await expect(input).toHaveValue(character.repeat(limit))
  }
  const name = fields[0][0]
  await name.fill('')
  await name.evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', 'a'.repeat(200) + '123')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(name).toHaveValue('a'.repeat(120))
})

test('tarjeta restaura los límites del inspector y conserva el formato al escribir', async ({ page }) => {
  await backend(page)
  await page.goto('/checkout/pago')
  await page.getByRole('button', { name: /Tarjeta Débito/ }).click()
  for (const [placeholder, limit, value] of [
    ['Número de tarjeta', 19, '4111 1111 1111 1111'],
    ['Fecha de caducidad', 5, '12/30'],
    ['Código de seguridad', 3, '123'],
  ]) {
    const input = page.getByPlaceholder(placeholder)
    await input.evaluate(element => element.setAttribute('maxlength', '2'))
    await expect(input).toHaveAttribute('maxlength', String(limit))
    await input.pressSequentially(value)
    await expect(input).toHaveValue(value)
    await input.evaluate(element => element.removeAttribute('maxlength'))
    await expect(input).toHaveAttribute('maxlength', String(limit))
    await input.fill(value + '999999')
    await expect(input).toHaveValue(value)
  }
})

test('escribir una dirección distinta invalida el punto y bloquea continuar y confirmar', async ({ page }) => {
  const { confirmations } = await backend(page)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] } }))
  await page.goto('/checkout/entrega')
  await page.getByRole('combobox').fill('Av. Larco 123, Miraflores')
  await page.getByRole('button', { name: 'Continuar al pago' }).click()
  await expect(page).toHaveURL(/checkout\/entrega/)
  await expect(page.getByText('Selecciona tu dirección en las sugerencias o en el mapa de Carabayllo.', { exact: true })).toBeVisible()
  await page.goto('/checkout/resumen')
  await expect(page.getByRole('button', { name: /Confirmar pedido/ })).toBeDisabled()
  expect(confirmations).toHaveLength(0)
})

test('solo sugiere puntos dentro de Carabayllo y permite seleccionar una dirección válida', async ({ page }) => {
  await backend(page)
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [
    { geometry: { coordinates: [-77.03, -11.88] }, properties: { street: 'Av. Válida', housenumber: '123' } },
    { geometry: { coordinates: [-77.08, -11.94] }, properties: { street: 'Fuera del distrito', district: 'Carabayllo' } },
  ] } }))
  await page.goto('/checkout/entrega')
  await page.getByRole('combobox').fill('Av. Válida')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option').click()
  await expect(page.getByRole('combobox')).toHaveValue('Av. Válida 123, Carabayllo')
  await page.getByRole('button', { name: 'Continuar al pago' }).click()
  await expect(page).toHaveURL(/checkout\/pago/)
})
