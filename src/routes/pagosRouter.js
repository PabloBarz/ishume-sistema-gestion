import express, { Router } from 'express';
import { pagosController } from '../controllers/pagosController.js';
const router = Router();
// El sistema aún no dispone de usuarios/sesiones. Los documentos y operaciones
// financieras se restringen a acceso local, sin exponer archivos por express.static.
router.use((req,res,next)=>{
  const ip=req.socket.remoteAddress||'';
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return res.status(403).json({message:'Pagos está habilitado solo para acceso local.'});
  const origen=req.get('Origin');
  if(req.get('Sec-Fetch-Site')==='cross-site')return res.status(403).json({message:'Origen no autorizado.'});
  if(origen){try{if(new URL(origen).host!==req.get('host'))throw Error();}catch{return res.status(403).json({message:'Origen no autorizado.'});}}
  next();
});
router.get('/ordenes', pagosController.listar);
router.get('/ordenes/:id/archivo',pagosController.archivo);
router.get('/ordenes/:id',pagosController.obtener);
router.post('/ordenes/:id/documento',express.raw({type:'application/octet-stream',limit:'10mb'}),pagosController.guardar);
router.post('/ordenes/:id/abonos',pagosController.abonar);
export default router;
