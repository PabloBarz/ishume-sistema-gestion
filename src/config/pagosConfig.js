// Desactivado por defecto. No controla registros iniciales ni nuevos abonos.
export const permisosPagos = () => ({
  editar_cotizacion: process.env.PAGOS_EDITAR_COTIZACIONES === 'true',
  corregir_abonos: process.env.PAGOS_CORREGIR_ABONOS !== 'false',
});
