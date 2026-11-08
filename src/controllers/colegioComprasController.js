import {colegioComprasService} from '../services/colegioComprasService.js';

async function responder(res,accion){
  try{res.set('Cache-Control','no-store').json({success:true,data:await accion()});}
  catch(e){if(!e.status)console.error('Consulta de colegios:',e);res.status(e.status??500).json({success:false,message:e.status?e.message:'No se pudieron consultar las compras del colegio. Reintenta.'});}
}
export const colegioComprasController={
  buscar:(req,res)=>responder(res,()=>req.query.listado==='1'
    ?colegioComprasService.listar(req.query)
    :colegioComprasService.buscar(req.query.q??'')),
  obtener:(req,res)=>responder(res,()=>colegioComprasService.obtener(req.params.id)),
};
