import { compraMasivaService } from '../services/compraMasivaService.js';
import { generarOrdenCompraPdf } from '../services/ordenCompraPdfService.js';
import { solicitudCotizacionService } from '../services/solicitudCotizacionService.js';

async function responder(res, action) {
  try {
    res.set('Cache-Control', 'no-store').json({ success: true, data: await action() });
  } catch (error) {
    if (!error.status) console.error('Compra masiva:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'No se pudo completar la operación. Reintenta con la misma revisión para evitar duplicados.' });
  }
}

export const compraMasivaController = {
  async descargarPdf(req, res) {
    try {
      const id = req.params.solicitudId ?? req.params.id;
      if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, message: 'Ingresa un ID válido.' });
      const orden = req.params.solicitudId ? await solicitudCotizacionService.obtener(Number(id)) : await compraMasivaService.obtenerOrden(Number(id));
      const pdf = await generarOrdenCompraPdf(orden);
      const codigo = orden.codigo.replace(/[^a-zA-Z0-9_-]/g, '_');
      const proveedor = orden.proveedor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80) || 'Proveedor';
      const nombre = orden.version_documento >= 3 ? `${codigo}_${proveedor}`
        : `${orden.version_documento === 2 ? 'Orden-compra' : 'Solicitud-cotizacion'}-${codigo}`;
      res.set('Cache-Control', 'no-store').attachment(`${nombre}.pdf`).type('application/pdf');
      if (req.query.vista === '1') res.set('Content-Disposition', `inline; filename="${nombre}.pdf"`);
      res.send(pdf);
    } catch (error) {
      if (!error.status) console.error('PDF de orden de compra:', error);
      res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'No se pudo generar el PDF de la orden de compra.' });
    }
  },
  pendientes: (req,res) => responder(res,()=>solicitudCotizacionService.pendientes(req.query.q??'',Number(req.query.pagina??1))),
  vistaPedido: (req,res) => responder(res,()=>solicitudCotizacionService.vistaPendientes({id_orden:Number(req.params.id)})),
  vistaProveedor: (req,res) => responder(res,()=>solicitudCotizacionService.vistaPendientes({id_proveedor:Number(req.params.id)})),
  realizadas: (req,res) => responder(res,()=>solicitudCotizacionService.realizadas(req.query.q??'',Number(req.query.pagina??1))),
  revisarSolicitud: (req,res) => responder(res,()=>solicitudCotizacionService.revisar(req.body?.ordenes,req.body?.id_proveedor)),
  confirmarSolicitud: (req,res) => responder(res,()=>solicitudCotizacionService.confirmar(req.body)),
  obtenerSolicitud: (req,res) => responder(res,()=>solicitudCotizacionService.obtener(Number(req.params.solicitudId))),
  buscarOrdenes: (req, res) => responder(res, () => compraMasivaService.buscarOrdenes(req.query.q ?? '', Number(req.query.pagina ?? 1))),
  obtenerOrden: (req, res) => responder(res, () => {
    if (!/^\d+$/.test(req.params.id)) throw Object.assign(new Error('Ingresa un ID de orden válido.'), { status: 400 });
    return compraMasivaService.obtenerOrden(Number(req.params.id));
  }),
  revisar: (req, res) => responder(res, () => compraMasivaService.revisar(req.body?.contratos)),
  confirmar: (req, res) => responder(res, () => compraMasivaService.confirmar(req.body?.token)),
};
