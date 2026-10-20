import { HttpEventType } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { filter, lastValueFrom } from 'rxjs';
import { AccionesService } from '../core/acciones.service';
import { Api, ResultadoSubida } from '../core/api.service';
import { SeleccionLocal } from '../core/archivos-locales';
import { aErrorApi, esCodigo } from '../core/errores';
import { EspaciosService } from '../core/espacios.service';
import { EventosService } from '../core/eventos.service';
import { PANTALLA_ESTRECHA, tipoLegible } from '../core/formato';
import { Contenido, Elemento, ErrorApi } from '../core/modelos';
import { NavegacionService } from '../core/navegacion.service';
import { Notificar } from '../core/notificar.service';
import { ArrastreService, PortapapelesService } from '../core/portapapeles.service';
import { SubidasService } from '../core/subidas.service';

export type Vista = 'lista' | 'cuadricula';
export type CampoOrden = 'nombre' | 'modificadoEn' | 'tipo' | 'tamano';
export interface Orden {
  campo: CampoOrden;
  asc: boolean;
}

export const NOMBRES_ORDEN: Record<CampoOrden, string> = {
  nombre: 'Nombre',
  modificadoEn: 'Fecha de modificación',
  tipo: 'Tipo',
  tamano: 'Tamaño',
};

const PREFERENCIAS = 'dc.explorador';
const comparador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function leerPreferencias(): { vista: Vista; orden: Orden; detalles: boolean } {
  try {
    const guardado = JSON.parse(localStorage.getItem(PREFERENCIAS) ?? '{}');
    return {
      vista: guardado.vista === 'cuadricula' ? 'cuadricula' : 'lista',
      orden: guardado.orden?.campo in NOMBRES_ORDEN ? guardado.orden : { campo: 'nombre', asc: true },
      detalles: guardado.detalles === true,
    };
  } catch {
    return { vista: 'lista', orden: { campo: 'nombre', asc: true }, detalles: false };
  }
}

function comparar(a: Elemento, b: Elemento, { campo, asc }: Orden) {
  let resultado = 0;
  if (campo === 'modificadoEn') resultado = a.modificadoEn.localeCompare(b.modificadoEn);
  else if (campo === 'tamano') resultado = (a.tamano ?? a.elementos ?? 0) - (b.tamano ?? b.elementos ?? 0);
  else if (campo === 'tipo') resultado = comparador.compare(tipoLegible(a), tipoLegible(b));
  if (resultado === 0) resultado = comparador.compare(a.nombre, b.nombre);
  return asc ? resultado : -resultado;
}

// Estado de una pestaña del explorador. Lo provee el componente Explorador y lo comparten
// la barra de comandos, la lista o cuadrícula, el panel de detalles y la barra de estado.
@Injectable()
export class ExploradorEstado {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly navegacion = inject(NavegacionService);
  private readonly eventos = inject(EventosService);
  private readonly notificar = inject(Notificar);
  private readonly subidas = inject(SubidasService);
  readonly espacios = inject(EspaciosService);
  readonly acciones = inject(AccionesService);
  readonly portapapeles = inject(PortapapelesService);
  readonly arrastre = inject(ArrastreService);

  readonly carpetaId = signal<number | null>(null);
  readonly consulta = signal('');
  readonly contenido = signal<Contenido | null>(null);
  readonly resultados = signal<Elemento[] | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<ErrorApi | null>(null);

  private readonly preferencias = leerPreferencias();
  readonly vista = signal<Vista>(this.preferencias.vista);
  readonly orden = signal<Orden>(this.preferencias.orden);
  // En pantallas estrechas el panel tapa la lista: empieza cerrado y abrirlo no cambia la preferencia guardada.
  private readonly pantallaEstrecha = window.matchMedia(PANTALLA_ESTRECHA).matches;
  readonly detallesVisible = signal(this.preferencias.detalles && !this.pantallaEstrecha);
  readonly gruposPlegados = signal<ReadonlySet<'CARPETA' | 'ARCHIVO'>>(new Set());

  readonly seleccion = signal<ReadonlySet<number>>(new Set());
  readonly ancla = signal<number | null>(null);
  readonly foco = signal<number | null>(null);
  readonly renombrando = signal<number | null>(null);
  readonly destinoArrastre = signal<number | null>(null);
  readonly columnas = signal(1);

  // La lista y la cuadrícula llaman a esto para abrir el menú contextual del explorador.
  abrirMenu: (evento: MouseEvent, elemento: Elemento | null) => void = () => {};

  readonly carpeta = computed(() => this.contenido()?.carpeta ?? null);
  readonly ruta = computed(() => this.contenido()?.ruta ?? []);
  readonly nombreCarpeta = computed(() => {
    const carpeta = this.carpeta();
    return carpeta?.esRaiz ? (this.ruta()[0]?.nombre ?? '') : (carpeta?.nombre ?? '');
  });
  readonly buscando = computed(() => this.consulta().trim().length > 0);
  readonly compartido = computed(() => this.espacios.esCompartido(this.carpeta()?.espacioId));
  readonly espacioCompartido = computed(() => this.espacios.espacioDe(this.carpeta()?.espacioId));

  private readonly ordenados = computed(() => {
    const lista = this.buscando() ? (this.resultados() ?? []) : (this.contenido()?.elementos ?? []);
    const orden = this.orden();
    return [...lista].sort((a, b) => comparar(a, b, orden));
  });
  readonly carpetas = computed(() => this.ordenados().filter((e) => e.tipo === 'CARPETA'));
  readonly archivos = computed(() => this.ordenados().filter((e) => e.tipo === 'ARCHIVO'));
  readonly todos = computed(() => [...this.carpetas(), ...this.archivos()]);
  // Lo que se ve en pantalla, en orden: se usa para las flechas del teclado y la selección con Mayús.
  readonly visibles = computed(() => {
    const plegados = this.gruposPlegados();
    return this.todos().filter((e) => !plegados.has(e.tipo));
  });
  readonly seleccionados = computed(() => {
    const seleccion = this.seleccion();
    return this.todos().filter((e) => seleccion.has(e.id));
  });
  readonly unico = computed(() => (this.seleccionados().length === 1 ? this.seleccionados()[0] : null));
  readonly tamanoSeleccion = computed(() => this.seleccionados().reduce((suma, e) => suma + (e.tamano ?? 0), 0));
  // --- Carga ---

  async ir(carpetaId: number, consulta: string, seleccionar?: number) {
    const cambioCarpeta = carpetaId !== this.carpetaId();
    this.carpetaId.set(carpetaId);
    this.consulta.set(consulta);
    if (cambioCarpeta) {
      this.navegacion.registrar(carpetaId);
      this.limpiarSeleccion();
      this.renombrando.set(null);
      this.contenido.set(null);
      this.resultados.set(null);
    }
    await this.cargar(!cambioCarpeta);
    if (seleccionar && this.todos().some((e) => e.id === seleccionar)) this.seleccionarSolo(seleccionar);
  }

  async cargar(silencioso = false) {
    const id = this.carpetaId();
    if (id === null) return;
    const consulta = this.consulta().trim();
    if (!silencioso) this.cargando.set(true);
    try {
      const [contenido, resultados] = await Promise.all([
        this.api.contenido(id),
        consulta ? this.api.buscar(id, consulta).then((r) => r.resultados) : Promise.resolve(null),
      ]);
      if (id !== this.carpetaId() || consulta !== this.consulta().trim()) return;
      this.contenido.set(contenido);
      this.resultados.set(resultados);
      this.error.set(null);
      this.navegacion.establecer(contenido.carpeta, contenido.ruta);
      this.conservarSeleccionExistente();
      // Abrir una carpeta quita su punto de cambios: la barra lateral tiene que enterarse.
      if (this.compartido() && !silencioso) this.eventos.avisar('espacios');
    } catch (error) {
      if (id !== this.carpetaId()) return;
      this.error.set(aErrorApi(error));
      this.contenido.set(null);
      this.navegacion.limpiar();
    } finally {
      this.cargando.set(false);
    }
  }

  recargar() {
    this.eventos.carpetas([this.carpetaId()]);
  }

  buscar(consulta: string) {
    const id = this.carpetaId();
    if (id !== null) this.navegacion.abrir(id, consulta.trim() || undefined);
  }

  private conservarSeleccionExistente() {
    const ids = new Set(this.todos().map((e) => e.id));
    const seleccion = this.seleccion();
    if ([...seleccion].some((id) => !ids.has(id))) {
      this.seleccion.set(new Set([...seleccion].filter((id) => ids.has(id))));
    }
  }

  // --- Preferencias ---

  cambiarVista(vista: Vista) {
    this.vista.set(vista);
    this.guardarPreferencias();
  }

  ordenarPor(campo: CampoOrden, asc?: boolean) {
    const actual = this.orden();
    this.orden.set({ campo, asc: asc ?? (actual.campo === campo ? !actual.asc : true) });
    this.guardarPreferencias();
  }

  alternarDetalles() {
    this.detallesVisible.update((v) => !v);
    if (!this.pantallaEstrecha) this.preferencias.detalles = this.detallesVisible();
    this.guardarPreferencias();
  }

  alternarGrupo(tipo: 'CARPETA' | 'ARCHIVO') {
    const grupos = new Set(this.gruposPlegados());
    if (grupos.has(tipo)) grupos.delete(tipo);
    else grupos.add(tipo);
    this.gruposPlegados.set(grupos);
  }

  private guardarPreferencias() {
    localStorage.setItem(PREFERENCIAS, JSON.stringify({ vista: this.vista(), orden: this.orden(), detalles: this.preferencias.detalles }));
  }

  // --- Selección ---

  alClic(elemento: Elemento, evento: MouseEvent) {
    if (this.renombrando() === elemento.id) return;
    if (evento.shiftKey && this.ancla() !== null) {
      this.seleccionarRango(this.ancla()!, elemento.id, evento.ctrlKey || evento.metaKey);
    } else if (evento.ctrlKey || evento.metaKey) {
      const seleccion = new Set(this.seleccion());
      if (seleccion.has(elemento.id)) seleccion.delete(elemento.id);
      else seleccion.add(elemento.id);
      this.seleccion.set(seleccion);
      this.ancla.set(elemento.id);
      this.foco.set(elemento.id);
    } else {
      this.seleccionarSolo(elemento.id);
    }
  }

  seleccionarSolo(id: number) {
    this.seleccion.set(new Set([id]));
    this.ancla.set(id);
    this.foco.set(id);
  }

  seleccionarTodo() {
    this.seleccion.set(new Set(this.visibles().map((e) => e.id)));
  }

  invertirSeleccion() {
    const actual = this.seleccion();
    this.seleccion.set(new Set(this.visibles().filter((e) => !actual.has(e.id)).map((e) => e.id)));
  }

  limpiarSeleccion() {
    this.seleccion.set(new Set());
    this.ancla.set(null);
    this.foco.set(null);
  }

  private seleccionarRango(desde: number, hasta: number, sumar: boolean) {
    const ids = this.visibles().map((e) => e.id);
    const [a, b] = [ids.indexOf(desde), ids.indexOf(hasta)].sort((x, y) => x - y);
    if (a < 0) return this.seleccionarSolo(hasta);
    const rango = ids.slice(a, b + 1);
    this.seleccion.set(new Set(sumar ? [...this.seleccion(), ...rango] : rango));
    this.foco.set(hasta);
  }

  // Flechas: en lista se avanza de a uno; en cuadrícula arriba y abajo saltan una fila.
  moverFoco(tecla: string, extender: boolean) {
    const ids = this.visibles().map((e) => e.id);
    if (ids.length === 0) return;
    const filas = this.vista() === 'cuadricula' ? this.columnas() : 1;
    const pasos: Record<string, number> = {
      ArrowDown: filas,
      ArrowUp: -filas,
      ArrowRight: this.vista() === 'cuadricula' ? 1 : 0,
      ArrowLeft: this.vista() === 'cuadricula' ? -1 : 0,
      Home: -Infinity,
      End: Infinity,
    };
    const paso = pasos[tecla];
    if (!paso) return;
    const actual = ids.indexOf(this.foco() ?? -1);
    const destino = actual < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, actual + paso));
    const id = ids[destino];
    if (extender && this.ancla() !== null) this.seleccionarRango(this.ancla()!, id, false);
    else this.seleccionarSolo(id);
    document.querySelector(`[data-elemento="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // --- Comandos ---

  abrir(elemento: Elemento) {
    this.acciones.abrir(elemento, this.archivos());
  }

  abrirSeleccion() {
    const unico = this.unico();
    if (unico) this.abrir(unico);
  }

  cortar() {
    this.portapapeles.poner('cortar', this.seleccionados());
  }

  copiar() {
    this.portapapeles.poner('copiar', this.seleccionados());
  }

  async pegar(destino: Elemento | null = this.carpeta()) {
    const contenido = this.portapapeles.contenido();
    if (!contenido || !destino || this.buscando()) return;
    if (contenido.modo === 'cortar' && contenido.elementos.every((e) => e.padreId === destino.id)) return;
    const hecho = await this.acciones.moverOCopiar(contenido.elementos, destino, contenido.modo === 'copiar');
    if (hecho && contenido.modo === 'cortar') this.portapapeles.vaciar();
  }

  empezarRenombre() {
    const unico = this.unico();
    if (unico) this.renombrando.set(unico.id);
  }

  async confirmarRenombre(elemento: Elemento, nombre: string) {
    if (this.renombrando() !== elemento.id) return;
    this.renombrando.set(null);
    nombre = nombre.trim();
    if (!nombre || nombre === elemento.nombre) return;
    try {
      await this.api.renombrar(elemento.id, nombre);
      this.eventos.carpetas([elemento.padreId, elemento.id]);
      if (this.espacios.idsFavoritos().has(elemento.id)) this.eventos.avisar('favoritos');
    } catch (error) {
      this.notificar.error(error, 'No se pudo cambiar el nombre');
    }
  }

  eliminar() {
    return this.acciones.eliminar(this.seleccionados());
  }

  descargar() {
    this.acciones.descargar(this.seleccionados());
  }

  // Como en Windows: se crea "Nueva carpeta" (o "Nueva carpeta (2)") y queda lista para escribir el nombre.
  async nuevaCarpeta() {
    const carpeta = this.carpeta();
    if (!carpeta) return;
    let nombre = 'Nueva carpeta';
    for (let intento = 0; intento < 2; intento++) {
      try {
        const { elemento } = await this.api.crearCarpeta(carpeta.id, nombre);
        await this.trasCrear(elemento);
        return;
      } catch (error) {
        const sugerido = aErrorApi(error).detalles?.['conflictos']?.[0]?.nombreSugerido;
        if (!esCodigo(error, 'NOMBRE_EN_USO') || !sugerido) {
          this.notificar.error(error);
          return;
        }
        nombre = sugerido;
      }
    }
  }

  async nuevoDocumento() {
    const carpeta = this.carpeta();
    if (!carpeta) return;
    try {
      const archivo = new Blob([], { type: 'text/plain' });
      const respuesta = await lastValueFrom(
        this.api.subir(carpeta.id, 'Nuevo documento.txt', archivo, 'conservar').pipe(filter((e) => e.type === HttpEventType.Response)),
      );
      await this.trasCrear((respuesta.body as ResultadoSubida).elemento);
    } catch (error) {
      this.notificar.error(error);
    }
  }

  private async trasCrear(elemento: Elemento) {
    this.eventos.carpetas([elemento.padreId]);
    await this.cargar(true);
    this.seleccionarSolo(elemento.id);
    this.renombrando.set(elemento.id);
  }

  subir(seleccion: SeleccionLocal, destino: Elemento | null = this.carpeta()) {
    if (!destino) return;
    this.subidas.subir(destino.id, destino.espacioId, seleccion);
  }

  verVotacion(elemento: Elemento) {
    this.router.navigate(['/espacios', elemento.espacioId]);
  }

  // --- Arrastrar y soltar dentro del explorador ---

  alIniciarArrastre(elemento: Elemento, evento: DragEvent) {
    if (this.renombrando() === elemento.id) return;
    if (!this.seleccion().has(elemento.id)) this.seleccionarSolo(elemento.id);
    this.arrastre.iniciar(evento, this.seleccionados());
  }

  alTerminarArrastre() {
    this.arrastre.terminar();
    this.destinoArrastre.set(null);
  }

  alArrastrarSobre(elemento: Elemento, evento: DragEvent) {
    if (elemento.tipo !== 'CARPETA') return;
    const conArchivos = ArrastreService.traeArchivos(evento);
    if (!conArchivos && (!this.arrastre.sePuedeSoltarEn(elemento) || this.seleccion().has(elemento.id))) return;
    evento.preventDefault();
    evento.stopPropagation();
    if (evento.dataTransfer) {
      const otroEspacio = this.arrastre.arrastrando()?.espacioId !== elemento.espacioId;
      evento.dataTransfer.dropEffect = conArchivos || evento.ctrlKey || otroEspacio ? 'copy' : 'move';
    }
    this.destinoArrastre.set(elemento.id);
  }

  alSalirArrastre(elemento: Elemento, evento: DragEvent) {
    const hacia = evento.relatedTarget as Node | null;
    if (hacia && (evento.currentTarget as HTMLElement).contains(hacia)) return;
    if (this.destinoArrastre() === elemento.id) this.destinoArrastre.set(null);
  }

  async alSoltarEn(elemento: Elemento, evento: DragEvent, leer: (evento: DragEvent) => Promise<SeleccionLocal> | null) {
    if (elemento.tipo !== 'CARPETA') return;
    evento.preventDefault();
    evento.stopPropagation();
    this.destinoArrastre.set(null);
    const locales = leer(evento);
    if (locales) {
      this.subir(await locales, elemento);
      return;
    }
    const arrastrado = this.arrastre.arrastrando();
    const sePuede = this.arrastre.sePuedeSoltarEn(elemento) && !this.seleccion().has(elemento.id);
    this.arrastre.terminar();
    if (arrastrado && sePuede) await this.acciones.moverOCopiar(arrastrado.elementos, elemento, evento.ctrlKey);
  }
}
