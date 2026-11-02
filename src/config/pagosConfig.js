// Desactivado por defecto. No controla registros iniciales ni nuevos abonos.
export const permisosPagos = () => ({
  editar_cotizacion: process.env.PAGOS_EDITAR_COTIZACIONES === 'true',
  // La correccion individual de abonos todavia no esta implementada.
  corregir_abonos: false,
});
