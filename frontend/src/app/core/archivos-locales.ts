// Archivos elegidos o arrastrados desde el equipo, con su ruta relativa cuando vienen dentro de carpetas.
export interface ArchivoLocal {
  archivo: File;
  ruta: string;
}

export interface SeleccionLocal {
  archivos: ArchivoLocal[];
  // Carpetas vacías: no tienen archivos que subir pero igual se crean.
  carpetasVacias: string[];
}

export function desdeInput(lista: FileList | null): SeleccionLocal {
  return {
    archivos: [...(lista ?? [])].map((archivo) => ({ archivo, ruta: archivo.webkitRelativePath || archivo.name })),
    carpetasVacias: [],
  };
}

// Las entradas hay que pedirlas durante el evento "drop": después el navegador ya no las entrega.
export function entradasDeArrastre(datos: DataTransfer): { entradas: FileSystemEntry[]; sueltos: File[] } {
  const entradas: FileSystemEntry[] = [];
  const sueltos: File[] = [];
  for (const item of [...datos.items]) {
    if (item.kind !== 'file') continue;
    const entrada = item.webkitGetAsEntry?.();
    if (entrada) {
      entradas.push(entrada);
    } else {
      const archivo = item.getAsFile();
      if (archivo) sueltos.push(archivo);
    }
  }
  return { entradas, sueltos };
}

// null si lo soltado no son archivos del equipo (por ejemplo, elementos arrastrados dentro de la app).
export function soltadoDesdeEquipo(evento: DragEvent): Promise<SeleccionLocal> | null {
  const datos = evento.dataTransfer;
  if (!datos || ![...datos.types].includes('Files')) return null;
  return leerEntradas(entradasDeArrastre(datos));
}

export async function leerEntradas({ entradas, sueltos }: { entradas: FileSystemEntry[]; sueltos: File[] }): Promise<SeleccionLocal> {
  const seleccion: SeleccionLocal = { archivos: sueltos.map((archivo) => ({ archivo, ruta: archivo.name })), carpetasVacias: [] };
  for (const entrada of entradas) {
    await recorrer(entrada, '', seleccion);
  }
  return seleccion;
}

async function recorrer(entrada: FileSystemEntry, prefijo: string, seleccion: SeleccionLocal) {
  const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
  if (entrada.isFile) {
    const archivo = await new Promise<File>((resolver, rechazar) => (entrada as FileSystemFileEntry).file(resolver, rechazar));
    seleccion.archivos.push({ archivo, ruta });
    return;
  }
  const lector = (entrada as FileSystemDirectoryEntry).createReader();
  let hijos = 0;
  // readEntries entrega los hijos por tandas: se llama hasta que devuelve una lista vacía.
  for (;;) {
    const tanda = await new Promise<FileSystemEntry[]>((resolver, rechazar) => lector.readEntries(resolver, rechazar));
    if (tanda.length === 0) break;
    hijos += tanda.length;
    for (const hijo of tanda) await recorrer(hijo, ruta, seleccion);
  }
  if (hijos === 0) seleccion.carpetasVacias.push(ruta);
}
