import { formatNumber } from '../utils.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tabla de consulta compartida: conserva cada colegio y cada línea recibida.
export function tablaColegios(colegios, { totales = false } = {}) {
  return `<table class="table-custom compras-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Cantidad</th></tr></thead>${colegios.map(c => `<tbody><tr class="compras-tabla-grupo"><th colspan="2" scope="rowgroup">${esc(c.nombre)}${totales ? `<span>${formatNumber(c.productos.reduce((s,p)=>s+p.cantidad,0))} unidades</span>` : ''}</th></tr>${c.productos.map(p => `<tr><td>${esc(p.modelo)}</td><td>${formatNumber(p.cantidad)}</td></tr>`).join('')}</tbody>`).join('')}</table>`;
}

export function tarjetas(ordenes, { detalles = false, baseUrl = '/api/compras-masivas/ordenes' } = {}) {
    return `<div class="ordenes-tarjetas">${ordenes.map((o) => `<article class="orden-tarjeta">
      <div class="compra-totals"><h3 class="panel-title">${esc(o.proveedor)}</h3><span class="badge badge-info">${esc(o.estado)}</span></div>
      <p class="cell-code">${esc(o.codigo)}</p>
      ${o.fecha ? `<p class="text-sm text-muted">${esc(o.fecha)}</p>` : ''}
      <dl class="orden-metricas"><div><dt>Total de unidades</dt><dd>${formatNumber(o.total)}</dd></div><div><dt>Modelos diferentes</dt><dd>${formatNumber(o.modelos)}</dd></div></dl>
      <div class="orden-acciones"><a class="btn-cancel" href="${baseUrl}/${o.id_solicitud ?? o.id_orden}/pdf?vista=1" target="_blank" rel="noopener"><i class="bi bi-eye" aria-hidden="true"></i> Ver PDF</a>
      <a class="btn-primary-action" href="${baseUrl}/${o.id_solicitud ?? o.id_orden}/pdf" download aria-label="Descargar PDF de ${esc(o.codigo)}"><i class="bi bi-download" aria-hidden="true"></i> Descargar PDF</a></div>
      ${detalles ? `<button class="btn-cancel orden-detalles-boton" type="button" data-detalles="${o.id_solicitud ?? o.id_orden}" aria-expanded="false" aria-controls="detalle-orden-${o.id_solicitud ?? o.id_orden}">Ver detalles</button><div class="orden-detalle" id="detalle-orden-${o.id_solicitud ?? o.id_orden}" data-detalle hidden></div>` : ''}
    </article>`).join('')}</div>`;
  }


export function conectarTarjetas(container, estado) {
  async function descargarPdf(url, nombre = 'solicitud-cotizacion.pdf') {
    estado.textContent = 'Descargando PDF…';
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'No se pudo descargar el PDF.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || nombre;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      if (estado.isConnected) estado.textContent = 'PDF descargado desde la orden guardada en MySQL.';
    } catch (error) {
      if (estado.isConnected) estado.textContent = error.message;
    }
  }

  function descargarDesdeTarjeta(event) {
    const link = event.target.closest('a[download]');
    if (!link) return;
    event.preventDefault();
    void descargarPdf(link.href);
  }
  container.addEventListener('click', descargarDesdeTarjeta);

}
