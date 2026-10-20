import { crc32 } from 'node:zlib';
import { ReglaNegocio } from '../errores.js';

const LIMITE_32_BITS = 0xffffffff;
const LIMITE_ENTRADAS = 0xffff;
const UTF8 = 0x0800;
const ATRIBUTO_CARPETA = 0x10;

// ZIP sin compresión (método "store"), compatible con cualquier descompresor.
// entradas: [{ ruta, esCarpeta, tamano, fecha, leer }], donde leer() devuelve los bytes por partes.
// Cada archivo se recorre dos veces: una para calcular el CRC y otra para enviarlo,
// así nunca hace falta tenerlo entero en memoria. No usa ZIP64: el límite es 4 GB.
export function crearZip(entradas) {
  const preparadas = entradas.map((entrada) => ({
    ...entrada,
    nombre: Buffer.from(entrada.esCarpeta ? `${entrada.ruta}/` : entrada.ruta, 'utf8'),
    tamano: entrada.esCarpeta ? 0 : entrada.tamano,
  }));
  const longitud = preparadas.reduce((suma, e) => suma + 30 + e.nombre.length + e.tamano + 46 + e.nombre.length, 22);
  if (longitud > LIMITE_32_BITS || preparadas.length > LIMITE_ENTRADAS) {
    throw new ReglaNegocio('La carpeta es demasiado grande para descargarla como ZIP (máximo 4 GB y 65 535 elementos)');
  }
  return { longitud, partes: generar(preparadas) };
}

function* generar(entradas) {
  const central = [];
  let posicion = 0;
  for (const entrada of entradas) {
    const crc = entrada.esCarpeta ? 0 : calcularCrc(entrada.leer());
    const { hora, dia } = fechaDos(entrada.fecha);
    const datos = { ...entrada, crc, hora, dia, posicion };
    const cabecera = cabeceraLocal(datos);
    yield cabecera;
    let enviados = 0;
    if (!entrada.esCarpeta) {
      for (const parte of entrada.leer()) {
        enviados += parte.length;
        yield parte;
      }
    }
    if (enviados !== entrada.tamano) {
      throw new Error(`El tamaño de "${entrada.ruta}" no coincide con lo guardado`);
    }
    central.push(datos);
    posicion += cabecera.length + entrada.tamano;
  }
  const inicioCentral = posicion;
  let tamanoCentral = 0;
  for (const datos of central) {
    const registro = registroCentral(datos);
    tamanoCentral += registro.length;
    yield registro;
  }
  yield finDeDirectorio(central.length, tamanoCentral, inicioCentral);
}

function calcularCrc(partes) {
  let crc = 0;
  for (const parte of partes) crc = crc32(parte, crc);
  return crc;
}

function cabeceraLocal({ nombre, crc, tamano, hora, dia }) {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4);
  b.writeUInt16LE(UTF8, 6);
  b.writeUInt16LE(0, 8);
  b.writeUInt16LE(hora, 10);
  b.writeUInt16LE(dia, 12);
  b.writeUInt32LE(crc, 14);
  b.writeUInt32LE(tamano, 18);
  b.writeUInt32LE(tamano, 22);
  b.writeUInt16LE(nombre.length, 26);
  b.writeUInt16LE(0, 28);
  return Buffer.concat([b, nombre]);
}

function registroCentral({ nombre, crc, tamano, hora, dia, posicion, esCarpeta }) {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(20, 4);
  b.writeUInt16LE(20, 6);
  b.writeUInt16LE(UTF8, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(hora, 12);
  b.writeUInt16LE(dia, 14);
  b.writeUInt32LE(crc, 16);
  b.writeUInt32LE(tamano, 20);
  b.writeUInt32LE(tamano, 24);
  b.writeUInt16LE(nombre.length, 28);
  b.writeUInt32LE(esCarpeta ? ATRIBUTO_CARPETA : 0, 38);
  b.writeUInt32LE(posicion, 42);
  return Buffer.concat([b, nombre]);
}

function finDeDirectorio(total, tamanoCentral, inicioCentral) {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(0x06054b50, 0);
  b.writeUInt16LE(total, 8);
  b.writeUInt16LE(total, 10);
  b.writeUInt32LE(tamanoCentral, 12);
  b.writeUInt32LE(inicioCentral, 16);
  return b;
}

// Formato de fecha de MS-DOS que usa ZIP (hora local, desde 1980).
function fechaDos(iso) {
  const fecha = new Date(iso ?? Date.now());
  const anio = Math.max(fecha.getFullYear(), 1980);
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    dia: ((anio - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  };
}
