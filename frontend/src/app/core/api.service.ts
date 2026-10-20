import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import {
  Actividad,
  Aviso,
  ColorPredeterminado,
  ConflictoNombre,
  Contenido,
  Detalles,
  DetallesEspacio,
  Elemento,
  ElementoPapelera,
  Espacios,
  InvitacionRecibida,
  PoliticaConflicto,
  Propuesta,
  ResumenAvisos,
  ResumenVersion,
  Sesion,
  TipoPropuesta,
  UsoEspacio,
  Usuario,
  Version,
} from './modelos';

export interface ResultadoSubida {
  accion: 'creado' | 'reemplazado' | 'omitido';
  elemento: Elemento;
}

export interface ResultadoTexto {
  accion: 'guardado' | 'sin-cambios';
  version: ResumenVersion;
  elemento: Elemento;
}

// Todas las rutas del backend en un solo lugar. Las URL de descarga y vista se usan directamente
// en enlaces, imágenes y reproductores, por eso también están aquí.
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(url: string, params?: Record<string, string | number | undefined>) {
    let httpParams = new HttpParams();
    for (const [clave, valor] of Object.entries(params ?? {})) {
      if (valor !== undefined) httpParams = httpParams.set(clave, String(valor));
    }
    return firstValueFrom(this.http.get<T>(url, { params: httpParams }));
  }
  private post<T>(url: string, cuerpo: unknown = {}) {
    return firstValueFrom(this.http.post<T>(url, cuerpo));
  }
  private put<T>(url: string, cuerpo: unknown) {
    return firstValueFrom(this.http.put<T>(url, cuerpo));
  }
  private patch<T>(url: string, cuerpo: unknown) {
    return firstValueFrom(this.http.patch<T>(url, cuerpo));
  }
  private delete<T>(url: string, cuerpo?: unknown) {
    return firstValueFrom(this.http.delete<T>(url, { body: cuerpo }));
  }

  // Autenticación
  me() {
    return this.get<{ usuario: Usuario }>('/api/auth/me');
  }
  login(correo: string, contrasena: string) {
    return this.post<{ usuario: Usuario }>('/api/auth/login', { correo, contrasena });
  }
  registro(nombre: string, correo: string, contrasena: string) {
    return this.post<{ usuario: Usuario }>('/api/auth/registro', { nombre, correo, contrasena });
  }
  logout() {
    return this.post<void>('/api/auth/logout');
  }

  // Explorador
  contenido(id: number) {
    return this.get<Contenido>(`/api/nodos/${id}/contenido`);
  }
  subcarpetas(id: number) {
    return this.get<{ subcarpetas: Elemento[] }>(`/api/nodos/${id}/subcarpetas`);
  }
  detalles(id: number) {
    return this.get<Detalles>(`/api/nodos/${id}`);
  }
  buscar(id: number, q: string) {
    return this.get<{ resultados: Elemento[] }>(`/api/nodos/${id}/buscar`, { q });
  }
  crearCarpeta(padreId: number, nombre: string) {
    return this.post<{ elemento: Elemento }>(`/api/nodos/${padreId}/carpetas`, { nombre });
  }
  crearRuta(padreId: number, ruta: string) {
    return this.post<{ elemento: Elemento }>(`/api/nodos/${padreId}/carpetas`, { ruta });
  }
  renombrar(id: number, nombre: string) {
    return this.patch<{ elemento: Elemento }>(`/api/nodos/${id}`, { nombre });
  }
  mover(ids: number[], destinoId: number, conflicto: PoliticaConflicto = 'preguntar') {
    return this.post<{ elementos: Elemento[]; omitidos: number }>('/api/nodos/mover', { ids, destinoId, conflicto });
  }
  copiar(ids: number[], destinoId: number, conflicto: PoliticaConflicto = 'preguntar') {
    return this.post<{ elementos: Elemento[]; omitidos: number }>('/api/nodos/copiar', { ids, destinoId, conflicto });
  }
  enviarAPapelera(ids: number[]) {
    return this.post<{ eliminados: number }>('/api/nodos/papelera', { ids });
  }
  marcarVisto(ids: number[], incluirContenido = false) {
    return this.post<void>('/api/nodos/visto', { ids, incluirContenido });
  }
  cambiarColor(id: number, datos: { color: string | null; paraTodos?: boolean; nota?: string }) {
    return this.put<{ elemento: Elemento }>(`/api/nodos/${id}/color`, datos);
  }
  colores() {
    return this.get<{ predeterminados: ColorPredeterminado[] }>('/api/colores');
  }
  verificarNombres(carpetaId: number, rutas: string[]) {
    return this.post<{ conflictos: ConflictoNombre[] }>(`/api/nodos/${carpetaId}/verificar-nombres`, { rutas });
  }
  subir(carpetaId: number, ruta: string, archivo: Blob, conflicto: PoliticaConflicto): Observable<HttpEvent<ResultadoSubida>> {
    const params = new HttpParams().set('ruta', ruta).set('conflicto', conflicto);
    return this.http.post<ResultadoSubida>(`/api/subidas/${carpetaId}`, archivo, {
      params,
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      reportProgress: true,
      observe: 'events',
    });
  }

  urlDescarga(id: number, versionId?: number) {
    return versionId ? `/api/nodos/${id}/versiones/${versionId}/descarga` : `/api/nodos/${id}/descarga`;
  }
  urlVista(id: number, versionId?: number) {
    return versionId ? `/api/nodos/${id}/versiones/${versionId}/vista` : `/api/nodos/${id}/vista`;
  }
  urlZip(id: number) {
    return `/api/nodos/${id}/zip`;
  }

  // Versiones y texto
  versiones(id: number) {
    return this.get<{ versiones: Version[] }>(`/api/nodos/${id}/versiones`);
  }
  restaurarVersion(id: number, versionId: number) {
    return this.post<{ version: Version; elemento: Elemento }>(`/api/nodos/${id}/versiones/${versionId}/restaurar`);
  }
  eliminarVersion(id: number, versionId: number) {
    return this.delete<{ versiones: Version[] }>(`/api/nodos/${id}/versiones/${versionId}`);
  }
  leerTexto(id: number) {
    return this.get<{ texto: string; version: ResumenVersion }>(`/api/nodos/${id}/texto`);
  }
  guardarTexto(id: number, texto: string, sha256: string | '*') {
    return firstValueFrom(
      this.http.put<ResultadoTexto>(`/api/nodos/${id}/texto`, texto, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'If-Match': sha256 === '*' ? '*' : `"${sha256}"`,
        },
      }),
    );
  }

  // Accesos rápidos
  favoritos() {
    return this.get<{ favoritos: Elemento[] }>('/api/favoritos');
  }
  fijar(nodoId: number) {
    return this.post<{ favoritos: Elemento[] }>('/api/favoritos', { nodoId });
  }
  desfijar(nodoId: number) {
    return this.delete<{ favoritos: Elemento[] }>(`/api/favoritos/${nodoId}`);
  }
  reordenarFavoritos(ids: number[]) {
    return this.put<{ favoritos: Elemento[] }>('/api/favoritos/orden', { ids });
  }

  // Papelera de Mi espacio
  papelera() {
    return this.get<{ elementos: ElementoPapelera[] }>('/api/papelera');
  }
  restaurar(ids: number[]) {
    return this.post<{ elementos: Elemento[] }>('/api/papelera/restaurar', { ids });
  }
  eliminarDefinitivamente(ids: number[]) {
    return this.post<{ eliminados: number }>('/api/papelera/eliminar', { ids });
  }
  vaciarPapelera() {
    return this.post<{ eliminados: number }>('/api/papelera/vaciar');
  }

  // Espacios compartidos
  espacios() {
    return this.get<Espacios>('/api/espacios');
  }
  crearEspacio(nombre: string) {
    return this.post<DetallesEspacio>('/api/espacios', { nombre });
  }
  espacio(id: number) {
    return this.get<DetallesEspacio>(`/api/espacios/${id}`);
  }
  renombrarEspacio(id: number, nombre: string) {
    return this.patch<DetallesEspacio>(`/api/espacios/${id}`, { nombre });
  }
  invitar(id: number, correo: string) {
    return this.post<DetallesEspacio>(`/api/espacios/${id}/invitaciones`, { correo });
  }
  cancelarInvitacion(id: number, invitacionId: number) {
    return this.delete<DetallesEspacio>(`/api/espacios/${id}/invitaciones/${invitacionId}`);
  }
  expulsar(id: number, usuarioId: number) {
    return this.delete<DetallesEspacio>(`/api/espacios/${id}/miembros/${usuarioId}`);
  }
  salir(id: number, confirmar = false) {
    return this.post<{ eliminado: boolean }>(`/api/espacios/${id}/salir`, { confirmar });
  }
  actividad(id: number, antesDe?: number) {
    return this.get<{ actividad: Actividad[] }>(`/api/espacios/${id}/actividad`, { antesDe, limite: 50 });
  }
  papeleraEspacio(id: number) {
    return this.get<{ elementos: ElementoPapelera[] }>(`/api/espacios/${id}/papelera`);
  }
  propuestasEspacio(id: number, cerradas = false) {
    return this.get<{ propuestas: Propuesta[] }>(`/api/espacios/${id}/propuestas`, { estado: cerradas ? 'cerradas' : undefined });
  }
  proponer(espacioId: number, datos: { tipo: TipoPropuesta; ids?: number[]; todos?: boolean; motivo?: string }) {
    return this.post<{ propuesta: Propuesta }>(`/api/espacios/${espacioId}/propuestas`, {
      ...datos,
      tipo: datos.tipo.toLowerCase(),
    });
  }
  invitaciones() {
    return this.get<{ invitaciones: InvitacionRecibida[] }>('/api/invitaciones');
  }
  aceptarInvitacion(id: number) {
    return this.post<DetallesEspacio>(`/api/invitaciones/${id}/aceptar`);
  }
  rechazarInvitacion(id: number) {
    return this.post<{ invitaciones: InvitacionRecibida[] }>(`/api/invitaciones/${id}/rechazar`);
  }

  // Votaciones
  propuestasPendientes() {
    return this.get<{ propuestas: Propuesta[] }>('/api/propuestas/pendientes');
  }
  propuesta(id: number) {
    return this.get<{ propuesta: Propuesta }>(`/api/propuestas/${id}`);
  }
  votar(id: number, voto: 'si' | 'no') {
    return this.post<{ propuesta: Propuesta }>(`/api/propuestas/${id}/voto`, { voto });
  }
  retirarPropuesta(id: number) {
    return this.post<{ propuesta: Propuesta }>(`/api/propuestas/${id}/retirar`);
  }

  // Avisos
  avisos() {
    return this.get<{ avisos: Aviso[]; noLeidos: number }>('/api/avisos');
  }
  resumenAvisos() {
    return this.get<ResumenAvisos>('/api/avisos/resumen');
  }
  marcarAvisosLeidos(ids?: number[]) {
    return this.post<{ noLeidos: number }>('/api/avisos/leidos', ids ? { ids } : {});
  }

  // Cuenta
  cambiarNombre(nombre: string) {
    return this.patch<{ usuario: Usuario }>('/api/cuenta', { nombre });
  }
  cambiarContrasena(actual: string, nueva: string) {
    return this.put<{ sesionesCerradas: number }>('/api/cuenta/contrasena', { actual, nueva });
  }
  eliminarCuenta(contrasena: string) {
    return this.delete<void>('/api/cuenta', { contrasena });
  }
  sesiones() {
    return this.get<{ sesiones: Sesion[] }>('/api/cuenta/sesiones');
  }
  cerrarSesionRemota(id: string) {
    return this.delete<{ sesiones: Sesion[] }>(`/api/cuenta/sesiones/${id}`);
  }
  cerrarOtrasSesiones() {
    return this.post<{ sesionesCerradas: number }>('/api/cuenta/sesiones/cerrar-otras');
  }
  espacioUsado() {
    return this.get<{ personal: UsoEspacio; compartidos: UsoEspacio[] }>('/api/cuenta/espacio-usado');
  }
}
