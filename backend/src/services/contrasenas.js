import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LONGITUD_CLAVE = 64;

// Formato guardado: scrypt$N$r$p$sal$hash (sal y hash en base64).
export async function cifrarContrasena(contrasena) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(contrasena, sal, LONGITUD_CLAVE, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarContrasena(contrasena, guardado) {
  const [algoritmo, N, r, p, sal, hash] = guardado.split('$');
  if (algoritmo !== 'scrypt') {
    return false;
  }
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scryptAsync(contrasena, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMETROS.maxmem,
  });
  return timingSafeEqual(calculado, esperado);
}
