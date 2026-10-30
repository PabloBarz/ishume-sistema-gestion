import { pagosService } from '../services/pagosService.js';

async function responder(res,accion){try{res.set('Cache-Control','no-store').json({success:true,data:await accion()});}catch(e){if(!e.status)console.error('Pagos:',e);res.status(e.status||500).json({success:false,message:e.status?e.message:'No se completó la operación. Reintenta con la misma clave para evitar duplicados.'});}}

export const pagosController = {
  obtener:(req,res)=>responder(res,()=>pagosService.obtener(Number(req.params.id))),
  abonar:(req,res)=>responder(res,()=>pagosService.abonar(Number(req.params.id),req.body)),
  guardar:(req,res)=>responder(res,()=>{
    let datos;
    try{const header=req.get('X-Pagos-Datos');if(!header||header.length>8000)throw Error();datos=JSON.parse(decodeURIComponent(header));if(!datos||Array.isArray(datos)||typeof datos!=='object')throw Error();}catch{throw Object.assign(new Error('Los datos del documento son inválidos.'),{status:400});}
    return pagosService.guardarDocumento(Number(req.params.id),datos,req.body,req.get('X-Pagos-Mime'),req.get('X-Pagos-Nombre')?decodeURIComponent(req.get('X-Pagos-Nombre')):'');
  }),
  async archivo(req,res){try{const r=await pagosService.archivo(Number(req.params.id),Number(req.query.version));res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(r.archivo_nombre)}).type(r.archivo_mime).sendFile(r.ruta,e=>{if(e&&!res.headersSent)res.status(404).json({message:'Archivo no disponible.'});});}catch(e){res.status(e.status||500).json({message:e.status?e.message:'No se pudo abrir el documento.'});}},
  async listar(req, res) {
    try {
      const data = await pagosService.listar({ q: req.query.q ?? '', pagina: Number(req.query.pagina ?? 1), estado: req.query.estado ?? 'todos' });
      res.set('Cache-Control','no-store').json({ success:true, data });
    } catch (error) {
      if (!error.status) console.error('Consulta de Pagos:',error);
      res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'No se pudieron consultar las órdenes. Reintenta.' });
    }
  },
};
