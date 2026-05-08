import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEncargos, uploadFiducia, deleteEncargo, updateEncargo } from '../utils/api';
import { formatDateTime } from '../utils/format';

function UploadModal({ onClose, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setResults(null);

    const out = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('archivo', file);
        const res = await uploadFiducia(fd);
        out.push({ file: file.name, hojas: res.hojas?.length || 0, ok: true });
      } catch (err) {
        out.push({ file: file.name, error: err.response?.data?.error || err.message, ok: false });
      }
    }

    setResults(out);
    setUploading(false);
    if (out.every((r) => r.ok)) {
      onUploaded();
      setTimeout(onClose, 1200);
    } else {
      onUploaded();
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles([...e.dataTransfer.files].filter((f) => /\.xlsx?$/i.test(f.name)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-[1px]">
      <div className="bg-white rounded-2xl border border-aed-border shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-slate-800">Importar Excel</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base text-slate-400"
          >
            ×
          </button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-aed-border hover:border-blue-300 hover:bg-aed-base'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => handleFiles([...e.target.files])}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-blue-500 text-[13px]">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Procesando archivo(s)...
            </div>
          ) : (
            <>
              <svg className="w-9 h-9 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-[13px] font-medium text-slate-600">Arrastra los Excel aquí o haz clic</p>
              <p className="text-[11px] text-slate-400 mt-1">Archivos .xlsx o .xls — puedes subir varios</p>
            </>
          )}
        </div>

        {results && (
          <div className="mt-3 flex flex-col gap-1.5">
            {results.map((r, i) => (
              <div
                key={i}
                className={`text-[12px] px-3 py-2 rounded-lg flex items-center gap-2 ${
                  r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}
              >
                {r.ok ? (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><strong>{r.file}</strong> — {r.hojas} hoja{r.hojas !== 1 ? 's' : ''} importada{r.hojas !== 1 ? 's' : ''}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>{r.file}</strong> — {r.error}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FiduciaModule() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', codigo: '' });
  const [showUpload, setShowUpload] = useState(false);

  async function load(s = search, p = page) {
    setLoading(true);
    try {
      const res = await getEncargos({ search: s || undefined, page: p, limit: 20 });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSearch(e) {
    const v = e.target.value;
    setSearch(v);
    setPage(1);
    load(v, 1);
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar el encargo "${nombre}"? Se borrarán todas sus hojas.`)) return;
    setDeleting(id);
    try {
      await deleteEncargo(id);
      load();
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(e, enc) {
    e.stopPropagation();
    setEditingId(enc.id);
    setEditForm({ nombre: enc.nombre || '', codigo: enc.codigo || '' });
  }

  async function handleSaveEdit(e, id) {
    e.stopPropagation();
    try {
      await updateEncargo(id, { nombre: editForm.nombre, codigo: editForm.codigo });
      setEditingId(null);
      load();
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    }
  }

  function handleCancelEdit(e) {
    e.stopPropagation();
    setEditingId(null);
  }

  const pagination = data?.pagination;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setPage(1); load(search, 1); }}
        />
      )}

      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Movimientos Fiduciarios</h1>
        <span className="text-xs text-slate-400">Encargos</span>
        <div className="ml-auto">
          <button onClick={() => setShowUpload(true)} className="btn-primary text-[12px] px-3 py-1.5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importar Excel
          </button>
        </div>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Buscar encargo, código o archivo..."
              className="input w-full pl-9 pr-4 py-2 text-[13px]"
            />
          </div>
          {pagination && (
            <span className="text-[12px] text-slate-400">{pagination.total} encargo{pagination.total !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[13px] font-medium">Sin encargos importados</p>
            <p className="text-[12px] mt-1">Usa "Importar Excel" arriba para comenzar</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-aed-border bg-aed-base">
                  <th className="section-label px-4 py-3 text-left">Nombre / Código</th>
                  <th className="section-label px-4 py-3 text-left">Archivo</th>
                  <th className="section-label px-4 py-3 text-left">Hojas</th>
                  <th className="section-label px-4 py-3 text-left">Importado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((enc) => (
                  <tr
                    key={enc.id}
                    className="border-b border-aed-border hover:bg-blue-50/60 cursor-pointer transition-colors"
                    onClick={() => navigate(`/fiducia/${enc.id}/nomenclaturas`)}
                  >
                    <td className="px-4 py-3">
                      {editingId === enc.id ? (
                        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editForm.nombre}
                            onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                            className="input text-[12px] px-2 py-1"
                            placeholder="Nombre del encargo"
                          />
                          <input
                            type="text"
                            value={editForm.codigo}
                            onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })}
                            className="input text-[12px] px-2 py-1 font-mono w-28"
                            placeholder="Código"
                          />
                          <div className="flex gap-1.5 mt-1">
                            <button onClick={(e) => handleSaveEdit(e, enc.id)} className="btn-primary text-[11px] px-2 py-1">Guardar</button>
                            <button onClick={handleCancelEdit} className="btn-secondary text-[11px] px-2 py-1">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-slate-800 truncate max-w-xs">{enc.nombre}</p>
                          {enc.codigo && (
                            <span className="text-[10px] font-mono text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{enc.codigo}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[12px] truncate max-w-xs">{enc.archivoNombre}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {enc.hojas.map((h) => (
                          <span key={h.id} className="text-[10px] bg-aed-base border border-aed-border text-slate-500 px-2 py-0.5 rounded-full">
                            {h.nombreHoja} ({h.totalFilas})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">{formatDateTime(enc.createdAt)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {editingId !== enc.id && (
                        <button
                          onClick={(e) => startEdit(e, enc)}
                          className="text-slate-300 hover:text-blue-500 transition-colors p-1 rounded mr-1"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(enc.id, enc.nombre)}
                        disabled={deleting === enc.id}
                        className="text-slate-300 hover:text-red-400 transition-colors p-1 rounded"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
                <span className="text-[12px] text-slate-400">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1}
                    onClick={() => { const p = page - 1; setPage(p); load(search, p); }}
                    className="btn-secondary text-[11px] py-1 px-2 disabled:opacity-40"
                  >Anterior</button>
                  <button
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => { const p = page + 1; setPage(p); load(search, p); }}
                    className="btn-secondary text-[11px] py-1 px-2 disabled:opacity-40"
                  >Siguiente</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
