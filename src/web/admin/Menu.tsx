import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';

const VACIO = { categoria_id: '', nombre: '', descripcion: '', precio: '', controla_stock: false, stock_actual: '' };

export function Menu() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [nuevaCat, setNuevaCat] = useState('');
  const [form, setForm] = useState<any>(VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historialDe, setHistorialDe] = useState<any | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  // automatica: la recarga la disparó un aviso en vivo, no la persona, y no
  // renueva la sesión (spec 4.3). La carga inicial sí cuenta como uso.
  const cargar = async (automatica = false) => {
    setCategorias(await api.get('/api/admin/categorias', { automatica }));
    setProductos(await api.get('/api/admin/productos', { automatica }));
  };
  useEffect(() => { cargar(); }, []);
  useEventos(['catalogo', 'stock'], () => cargar(true));
  const verHistorial = async (p: any) => {
    setError(null);
    try { setHistorial(await api.get(`/api/admin/productos/${p.id}/precios`)); setHistorialDe(p); }
    catch (err: any) { setError(err.message); }
  };

  const crearCategoria = async (e: Event) => {
    e.preventDefault(); setError(null);
    try { await api.post('/api/admin/categorias', { nombre: nuevaCat, orden: categorias.length + 1 }); setNuevaCat(''); }
    catch (err: any) { setError(err.message); }
  };
  const guardarProducto = async (e: Event) => {
    e.preventDefault(); setError(null);
    const necesitaStockInicial = (!editandoId && form.controla_stock) ||
      (!!editandoId && form.controla_stock && !productos.find((p) => p.id === editandoId)?.controla_stock);
    let stockInicial: number | undefined;
    if (necesitaStockInicial) {
      const limpio = String(form.stock_actual).trim();
      if (!/^\d+$/.test(limpio)) { setError('Escribe el stock, un número entero'); return; }
      stockInicial = Number(limpio);
    }
    const cuerpo: any = { categoria_id: form.categoria_id, nombre: form.nombre, descripcion: form.descripcion || null, precio: form.precio, controla_stock: form.controla_stock };
    if (necesitaStockInicial) cuerpo.stock_actual = stockInicial;
    try {
      if (editandoId) await api.patch(`/api/admin/productos/${editandoId}`, cuerpo);
      else await api.post('/api/admin/productos', cuerpo);
      setForm(VACIO); setEditandoId(null);
    } catch (err: any) { setError(err.message); }
  };
  const editar = (p: any) => { setEditandoId(p.id); setForm({ categoria_id: p.categoria_id, nombre: p.nombre, descripcion: p.descripcion ?? '', precio: p.precio, controla_stock: p.controla_stock, stock_actual: p.stock_actual ?? '' }); };
  const ajustarStock = async (p: any) => {
    setError(null);
    const stock = prompt(`Nuevo stock de ${p.nombre} (actual ${p.stock_actual})`); if (stock === null) return;
    const stockLimpio = stock.trim();
    if (!/^\d+$/.test(stockLimpio)) { setError('Escribe el stock, un número entero'); return; }
    const motivo = prompt('Motivo del ajuste'); if (motivo === null) return;
    try { await api.post(`/api/admin/productos/${p.id}/stock`, { stock: Number(stockLimpio), motivo }); }
    catch (err: any) { setError(err.message); }
  };
  const alternarActivo = async (p: any) => {
    setError(null);
    try { await api.patch(`/api/admin/productos/${p.id}`, { activo: !p.activo }); } catch (err: any) { setError(err.message); }
  };
  const subirFoto = async (p: any, archivo: File | undefined) => {
    if (!archivo) return;
    setError(null);
    try { await api.subirArchivo(`/api/admin/productos/${p.id}/foto`, 'foto', archivo); } catch (err: any) { setError(err.message); }
  };
  const nombreCat = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? '';

  return (
    <div style="display:grid;gap:24px">
      <section class="tarjeta">
        <h2>Categorías</h2>
        <form onSubmit={crearCategoria} class="fila">
          <label>Nueva categoría<input value={nuevaCat} onInput={(e) => setNuevaCat((e.target as HTMLInputElement).value)} /></label>
          <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
        </form>
        <p>{categorias.map((c) => <span key={c.id} class={`pill ${c.activa ? 'ok' : ''}`} style="margin-right:6px">{c.nombre}</span>)}</p>
      </section>

      <section class="tarjeta">
        <h2>{editandoId ? 'Editar producto' : 'Nuevo producto'}</h2>
        <form onSubmit={guardarProducto} style="display:grid;gap:12px">
          <div class="fila">
            <label>Categoría<select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: (e.target as HTMLSelectElement).value })}>
              <option value="">Elige…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <label>Nombre<input value={form.nombre} onInput={(e) => setForm({ ...form, nombre: (e.target as HTMLInputElement).value })} /></label>
            <label>Precio<input type="number" step="0.01" min="0" value={form.precio} onInput={(e) => setForm({ ...form, precio: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <label>Descripción<input value={form.descripcion} onInput={(e) => setForm({ ...form, descripcion: (e.target as HTMLInputElement).value })} /></label>
          <div class="fila">
            <label style="display:flex;gap:8px;align-items:center;color:inherit"><input type="checkbox" style="width:auto;min-height:0" checked={form.controla_stock} onChange={(e) => setForm({ ...form, controla_stock: (e.target as HTMLInputElement).checked })} />Controla stock</label>
            {form.controla_stock && (!editandoId || !productos.find((p) => p.id === editandoId)?.controla_stock) &&
              <label>Stock inicial<input type="number" min="0" step="1" value={form.stock_actual} onInput={(e) => setForm({ ...form, stock_actual: (e.target as HTMLInputElement).value })} /></label>}
          </div>
          <Aviso tipo="error" texto={error} />
          <div class="fila" style="align-items:center">
            <button class="primario" type="submit" style="flex:0 0 auto">{editandoId ? 'Guardar cambios' : 'Crear producto'}</button>
            {editandoId && <button type="button" style="flex:0 0 auto" onClick={() => { setEditandoId(null); setForm(VACIO); }}>Cancelar</button>}
          </div>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Productos</h2>
        <table><thead><tr><th>Foto</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
          <tbody>{productos.map((p) => (
            <tr key={p.id}>
              <td>{p.foto ? <img src={p.foto} alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px" /> : '—'}<br />
                <input type="file" accept="image/*" style="min-height:0;font-size:12px;width:120px" onChange={(e) => subirFoto(p, (e.target as HTMLInputElement).files?.[0])} /></td>
              <td>{p.nombre}</td><td>{nombreCat(p.categoria_id)}</td><td>{p.precio}</td>
              <td>{p.controla_stock ? <span>{p.stock_actual} <button onClick={() => ajustarStock(p)}>Ajustar</button></span> : <span class="pill">Sin control</span>}</td>
              <td><span class={`pill ${p.activo ? 'ok' : ''}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td><button onClick={() => editar(p)}>Editar</button> <button onClick={() => verHistorial(p)}>Precios</button> <button onClick={() => alternarActivo(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          ))}</tbody></table>
      </section>

      {historialDe && (
        <section class="tarjeta">
          <h2>Historial de precios · {historialDe.nombre} <button type="button" onClick={() => setHistorialDe(null)}>Cerrar</button></h2>
          {historial.length === 0 ? <p>Este producto nunca cambió de precio.</p> : (
            <table><thead><tr><th>Cuándo</th><th>Antes</th><th>Después</th><th>Quién</th></tr></thead>
              <tbody>{historial.map((h) => (
                <tr key={h.id}><td>{new Date(h.creado_en).toLocaleString('es-EC')}</td><td>{h.precio_anterior}</td><td>{h.precio_nuevo}</td><td>{h.usuario_nombre}</td></tr>
              ))}</tbody></table>
          )}
        </section>
      )}
    </div>
  );
}
