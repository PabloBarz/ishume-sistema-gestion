import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,unlink,stat} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fallo} from './pagoValidaciones.js';

const porDefecto=fileURLToPath(new URL('../../storage/pagos/',import.meta.url));
export const directorioPagos=()=>resolve(process.env.PAGOS_STORAGE_DIR||porDefecto);
function jpegValido(b){
  let pos=2,dimensiones=false;
  while(pos<b.length-2){
    if(b[pos++]!==255)return false;
    while(b[pos]===255)pos++;
    const marcador=b[pos++];
    if(marcador===218)return dimensiones; // Inicio del contenido comprimido (SOS).
    if(pos+2>b.length)return false;
    const largo=b.readUInt16BE(pos);if(largo<2||pos+largo>b.length)return false;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marcador)){
      if(largo<8)return false;const alto=b.readUInt16BE(pos+3),ancho=b.readUInt16BE(pos+5);
      dimensiones=alto>0&&ancho>0&&alto*ancho<=100000000;
    }
    pos+=largo;
  }
  return false;
}
function pngValido(b){
  let pos=8,imagen=false;
  while(pos+12<=b.length){const largo=b.readUInt32BE(pos),tipo=b.toString('ascii',pos+4,pos+8);
    if(pos+largo+12>b.length)return false;
    if(pos===8&&(tipo!=='IHDR'||largo!==13||!b.readUInt32BE(pos+8)||!b.readUInt32BE(pos+12)))return false;
    if(tipo==='IDAT'&&largo)imagen=true;
    if(tipo==='IEND')return imagen&&largo===0&&pos+12===b.length;
    pos+=largo+12;
  }return false;
}
export function validarContenidoArchivo(buffer,nombre,mime) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10485760)throw fallo('El archivo debe contener datos y no superar los 10 MB.');
  if(typeof nombre!=='string'||nombre.length>255||/[\x00-\x1f]/.test(nombre)||basename(nombre)!==nombre||/[\\/]/.test(nombre))throw fallo('Nombre de archivo inválido.');
  let tipo,extension;
  if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.length>=45&&pngValido(buffer)) {tipo='image/png';extension='png';}
  else if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255&&buffer.at(-2)===255&&buffer.at(-1)===217&&buffer.length>=20&&jpegValido(buffer)) {tipo='image/jpeg';extension='jpg';}
  else if(/^%PDF-(?:1\.[0-7]|2\.0)/.test(buffer.subarray(0,12).toString('ascii'))&&buffer.subarray(-2048).toString('latin1').includes('%%EOF')) {tipo='application/pdf';extension='pdf';}
  else throw fallo('El contenido no corresponde a una imagen JPG/PNG o PDF válido.');
  const patron=tipo==='image/jpeg'?/\.jpe?g$/i:tipo==='image/png'?/\.png$/i:/\.pdf$/i;
  if(mime!==tipo||!patron.test(nombre))throw fallo('La extensión, el tipo y el contenido del archivo no coinciden.');
  return {tipo,extension,sha:createHash('sha256').update(buffer).digest('hex'),nombre,bytes:buffer.length};
}
export async function almacenarArchivo(buffer,meta) {
  const directorio=directorioPagos();await mkdir(directorio,{recursive:true,mode:0o700});
  const clave=randomUUID()+'.'+meta.extension;
  await writeFile(join(directorio,clave),buffer,{flag:'wx',mode:0o600});
  return clave;
}
export async function borrarArchivo(clave){if(clave)await unlink(rutaArchivo(clave)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
export function rutaArchivo(clave) {
  if(typeof clave!=='string'||!/^[a-f0-9-]{36}\.(?:jpg|png|pdf)$/.test(clave))throw fallo('Referencia de archivo inválida.',500);
  return join(directorioPagos(),clave);
}
export async function comprobarArchivo(clave){const ruta=rutaArchivo(clave);try{await stat(ruta);}catch{throw fallo('El archivo no está disponible en el servidor.',404);}return ruta;}
