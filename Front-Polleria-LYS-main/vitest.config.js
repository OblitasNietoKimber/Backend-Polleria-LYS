import { defineConfig } from 'vitest/config'

export default defineConfig({ define: { 'import.meta.env.VITE_FLUJO_ATENCIONES': JSON.stringify('false') }, test: { include: ['tests/*.test.js'] } })
