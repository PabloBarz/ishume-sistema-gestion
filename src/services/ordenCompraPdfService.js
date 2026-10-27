import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const azul = [52, 69, 165];
const tinta = [25, 36, 58];
const gris = [99, 112, 134];
const colorCorporativo = [91, 63, 249]; // #5B3FF9: solo ISHUME y la línea del PDF actual.
const numero = (n) => new Intl.NumberFormat('es-PE').format(n);
// RUC proporcionado por el usuario. Correo y celular son PROVISIONALES / FICTICIOS
// para pruebas: reemplazarlos aquí cuando ISHUME confirme sus contactos reales.
const emisorPdf = Object.freeze({ ruc: '10727174040', correo: 'compras@ishume.pe', celular: '+51 956 123 456' });

// Conserva el nombre del servicio y la ruta existentes; solo cambia la presentación.
export function generarOrdenCompraPdf(orden) {
  const masiva = orden.version_documento >= 2;
  const formal = orden.version_documento >= 3;
  const actual = orden.version_documento >= 4;
  const naranja = [255, 122, 0];
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({ title: `${masiva ? 'Orden de compra' : 'Solicitud de cotización'} ${orden.codigo}`, author: 'ISHUME' });
  const left = 46;
  const width = doc.internal.pageSize.getWidth() - left * 2;
  const bottom = doc.internal.pageSize.getHeight() - 60;
  let y = 46;
  const colegios = new Map();
  for (const d of orden.distribuciones) {
    if (formal && (typeof d.colegio !== 'string' || !d.colegio.trim())) throw Object.assign(new Error('Falta el nombre del colegio en la orden guardada.'),{status:409});
    if (!colegios.has(d.id_contrato)) colegios.set(d.id_contrato, { nombre: d.colegio, productos: [] });
    colegios.get(d.id_contrato).productos.push(d);
  }

  function espacio(height) {
    if (y + height > bottom) { doc.addPage(); y = 46; }
  }
  function texto(text, size = 11, bold = false, color = tinta) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size);
    const lines = doc.splitTextToSize(String(text), width);
    const height = lines.length * size * 1.15;
    espacio(height + 8);
    doc.setTextColor(...color).text(lines, left, y + size);
    y += height + 8;
  }
  function dato(etiqueta, valor) {
    doc.setFont('helvetica','normal').setFontSize(11);
    const lines=doc.splitTextToSize(String(valor),width-110);
    const height=lines.length*12.65;
    espacio(height+7);
    doc.setFontSize(9).setTextColor(...gris).text(etiqueta,left,y+11);
    doc.setFontSize(11).setTextColor(...tinta).text(lines,left+110,y+11);
    y+=height+7;
  }
  function tabla(nombre, productos, sinColegio = false, ultima = false) {
    const cantidadColumna=1;
    const totalColegio=productos.reduce((s,p)=>s+p.cantidad,0);
    doc.setFont('helvetica', 'bold').setFontSize(11);
    espacio(doc.splitTextToSize(nombre, width - 16).length * 13 + 70);
    autoTable(doc, {
      startY: y,
      // La última sección reserva espacio para que el total general no quede solo en otra página.
      margin: { top: 46, right: left, bottom: ultima ? (actual ? 130 : formal ? 170 : 140) : 60, left },
      head: [
        [{ content: nombre, colSpan: cantidadColumna+1, styles: { fillColor: formal ? [242, 244, 247] : [236, 239, 246], textColor: tinta, fontSize: 11 } }],
        [actual ? 'Modelo' : 'Descripción del modelo','Cantidad'],
      ],
      body: productos.map((p) => [p.modelo,numero(p.cantidad)]),
      foot: actual ? [[{content:`${sinColegio?'Total sin distribuir':'Total del colegio'}: ${numero(totalColegio)} unidades`,colSpan:cantidadColumna+1,styles:{halign:'right'}}]]
        : [[sinColegio ? 'Total de unidades sin distribuir' : 'Total de unidades del colegio', numero(totalColegio)]],
      theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage', showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: actual ? 10 : formal ? 10.5 : 10, cellPadding: formal ? {top:5,bottom:5,left:7,right:7} : 7, textColor: tinta, lineColor: [219, 224, 233], lineWidth: formal ? 0.25 : 0.4, overflow: 'linebreak' },
      headStyles: { fillColor: [248, 249, 251], textColor: tinta, fontStyle: 'bold', halign: 'left' },
      footStyles: { fillColor: [248, 249, 251], textColor: tinta, fontStyle: 'bold', halign: 'left' },
      columnStyles: { [cantidadColumna]: { halign: 'right', cellWidth: 80 } },
      didParseCell: (cell) => {
        if (cell.column.index === cantidadColumna && cell.cell.colSpan === 1) cell.cell.styles.halign = 'right';
      },
    });
    y = doc.lastAutoTable.finalY + (formal ? 12 : 18);
  }

  if (formal) {
    doc.setFont('helvetica','bold').setFontSize(25).setTextColor(...(actual ? colorCorporativo : naranja)).text('ISHUME',left,y+22);
    if (!actual) doc.setFont('helvetica','normal').setFontSize(9).setTextColor(...gris).text('Gestión de compras',left,y+39);
    doc.setFont('helvetica','bold').setFontSize(15).setTextColor(...tinta).text('ORDEN DE COMPRA',left+width,y+18,{align:'right'});
    doc.setFontSize(10).text(orden.codigo,left+width,y+36,{align:'right'});
    if (actual) {
      doc.setFont('helvetica','normal').setFontSize(9).setTextColor(...gris);
      doc.text(`RUC: ${emisorPdf.ruc}`,left,y+42);
      doc.text(`Correo: ${emisorPdf.correo}`,left,y+56);
      doc.text(`Celular: ${emisorPdf.celular}`,left,y+70);
    }
    const linea=actual?86:54;
    doc.setDrawColor(...(actual ? colorCorporativo : naranja)).setLineWidth(.8).line(left,y+linea,left+width,y+linea);
    y+=linea+13;
  } else {
  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(...azul).text('ISHUME', left, y + 20);
  doc.setFontSize(14).setTextColor(...tinta).text(masiva ? 'ORDEN DE COMPRA' : 'SOLICITUD DE COTIZACIÓN', left + width, y + 18, { align: 'right' });
  y += 43;
  if (masiva) texto(`Código: ${orden.codigo}`, 10, true);
  }
  if (formal) {
    if (!actual) dato('Fecha de emisión',orden.fecha);
    dato('Proveedor',orden.proveedor);
    if (actual) dato('Fecha de emisión',orden.fecha);
    dato('Colegios incluidos',colegios.size);
  } else {
  texto(`Fecha de emisión: ${orden.fecha}`, 10, false, gris);
  if (!formal) {
  doc.setDrawColor(210, 216, 228).setLineWidth(0.6).line(left, y + 3, left + width, y + 3);
  y += 17;
  }
  texto(`Proveedor: ${orden.proveedor}`, 12, true);
  texto(`Cantidad de colegios incluidos: ${colegios.size}`, 10, false, gris);
  }
  y += 8;
  texto('DETALLE DE PRODUCTOS SOLICITADOS', 11, true);
  if (!formal) texto(masiva ? 'Documento enviado para cotización de precios y condiciones' : 'Solicitamos cotización de los siguientes modelos y cantidades', 10, false, gris);
  y += 8;

  // Las filas se presentan solo en su colegio; no hay una segunda tabla de totales por modelo.
  // Conserva productos de órdenes antiguas que no tengan distribución completa, sin inventar colegios.
  const pendientes = new Map();
  const clave = (p) => JSON.stringify([p.modelo, p.categoria ?? null]);
  for (const p of orden.productos) {
    const key = clave(p);
    const anterior = pendientes.get(key);
    pendientes.set(key, { ...p, cantidad: (anterior?.cantidad || 0) + p.cantidad });
  }
  for (const d of orden.distribuciones) {
    const p = pendientes.get(clave(d));
    if (!p || p.cantidad < d.cantidad) throw new Error('La distribución de la orden no coincide con sus productos.');
    p.cantidad -= d.cantidad;
  }
  const sinDistribuir = [...pendientes.values()].filter(p => p.cantidad > 0);
  const secciones = [...colegios.values()];
  if (sinDistribuir.length) secciones.push({ nombre: 'Productos sin distribución por colegio registrada', productos: sinDistribuir, sinColegio: true });
  secciones.forEach((c, index) => tabla(c.nombre, c.productos, c.sinColegio, index === secciones.length - 1));
  espacio(actual ? 55 : formal ? 95 : 55);
  const boxWidth = formal ? 280 : 245;
  const boxX = left + width - boxWidth;
  doc.setFillColor(248, 249, 251).setDrawColor(210, 216, 228).setLineWidth(formal ? .4 : .6).roundedRect(boxX, y, boxWidth, formal ? 42 : 48, 3, 3, 'FD');
  if (formal) {
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(...gris).text('TOTAL GENERAL:',boxX+12,y+26);
    doc.setFontSize(14).setTextColor(...tinta).text(`${numero(orden.total)} UNIDADES`,left+width-12,y+26,{align:'right'});
  } else {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...gris).text('TOTAL GENERAL DE UNIDADES', left + width - 12, y + 16, { align: 'right' });
  doc.setFontSize(16).setTextColor(...tinta).text(`${numero(orden.total)} unidades`, left + width - 12, y + 36, { align: 'right' });
  }
  if (formal && !actual) {
    y+=54;
    texto('Precios y condiciones pendientes de cotización por el proveedor',9,false,gris);
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 28;
    doc.setDrawColor(224, 228, 235).setLineWidth(0.4).line(left, footerY - 14, left + width, footerY - 14);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...gris)
      .text('ISHUME · Sistema de gestión de compras', left, footerY)
      .text(`Página ${i} de ${paginas}`, left + width, footerY, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
