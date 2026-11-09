import {pool} from '../config/db.js';

// Un contrato permanece procesado aunque su pedido se consolide o cancele.
// No se define un desbloqueo automatico por estado o por cambio de cantidades.
export const contratoPedidoService={
  async registrados(ids,conn=pool){
    const unicos=[...new Set(ids.map(Number))];
    if(!unicos.length)return new Set();
    if(unicos.some(id=>!Number.isSafeInteger(id)||id<1||id>2147483647))throw Object.assign(new Error('ID de contrato inválido.'),{status:400});
    const [rows]=await conn.query(`SELECT DISTINCT cr.id_contrato_api
      FROM contratos_referencia cr
      JOIN contrato_detalles cd ON cd.id_contrato=cr.id_contrato
      JOIN orden_distribuciones d ON d.id_detalle_contrato=cd.id_detalle_contrato
      JOIN orden_detalles od ON od.id_orden_detalle=d.id_orden_detalle
      JOIN ordenes_compra o ON o.id_orden=od.id_orden
      WHERE cr.id_contrato_api IN (?)`,[unicos]);
    return new Set(rows.map(r=>Number(r.id_contrato_api)));
  },
};
