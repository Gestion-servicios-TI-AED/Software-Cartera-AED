import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Search, Layers, MapPin, Building, X, Download, History } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getDashboardRecaudo } from '../utils/api';
import { formatCOP } from '../utils/format';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const columnHelper = createColumnHelper();

function formatMesLabel(mes) {
  const [anio, mesNum] = mes.split('-');
  const fecha = new Date(Date.UTC(Number(anio), Number(mesNum) - 1, 1));
  const etiqueta = fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

function claveFila(row) {
  return row.nomenclatura || `${row.etapa}-${row.frente}-${row.torre}`;
}

// Ancho de columna en Excel a partir del contenido más largo (encabezado o
// valores), para que no haya que expandir manualmente al abrir el archivo.
function calcularAnchoColumnas(filas, headers) {
  return headers.map((h) => {
    const maxLen = filas.reduce((max, row) => {
      const v = row[h];
      const len = v == null || v === '' ? 0 : String(v).length;
      return Math.max(max, len);
    }, h.length);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
}

const COLUMNAS_FIJAS = [
  columnHelper.accessor('etapa', {
    header: 'Etapa',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('frente', {
    header: 'Frente',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('torre', {
    header: 'Torre',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('nomenclatura', {
    header: 'Nomenclatura',
    cell: (info) => <span className="font-mono text-[13px]">{info.getValue() ?? '—'}</span>,
  }),
];

function construirColumnasMeses(meses) {
  return meses.map((mes) =>
    columnHelper.group({
      id: `mes-${mes}`,
      header: formatMesLabel(mes),
      columns: [
        columnHelper.accessor((row) => row.porMes[mes]?.esperado, {
          id: `${mes}-esperado`,
          header: 'Esperado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
          },
        }),
        columnHelper.accessor((row) => row.porMes[mes]?.recaudado, {
          id: `${mes}-recaudado`,
          header: 'Recaudado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px] text-emerald-700">{formatCOP(v)}</span>;
          },
        }),
      ],
    })
  );
}

export default function ReportePlanRecaudo() {
  const [filas, setFilas] = useState([]);
  const [meses, setMeses] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [conMovimientos, setConMovimientos] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [totales, setTotales] = useState({});
  const [filasResaltadas, setFilasResaltadas] = useState(() => new Set());

  const debouncedSearch = useDebounce(search);

  const toggleResaltado = (clave) => {
    setFilasResaltadas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  };

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await getDashboardRecaudo({
        search: debouncedSearch || undefined,
        etapa: etapaFilter || undefined,
        frente: frenteFilter || undefined,
        torre: torreFilter || undefined,
        conMovimientos: conMovimientos || undefined,
        page: p,
        limit: 50,
      });
      setFilas(res.data);
      setMeses(res.meses);
      setPagination(res.pagination);
      setEtapas(res.etapasDisponibles);
      setFrentes(res.frentesDisponibles);
      setFrentesPorEtapa(res.frentesPorEtapa);
      setTorresPorFrente(res.torresPorFrente);
      setTorresPorEtapaFrente(res.torresPorEtapaFrente);
      setTotales(res.totales);
      setPage(p);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, etapaFilter, frenteFilter, torreFilter, conMovimientos]);

  // Cargar página 1 cuando cambian los filtros (busqueda ya con debounce).
  // load ya no depende de `page` en su lista de dependencias -- por eso
  // cambiar un filtro mientras el usuario esta en la pagina 3, por ejemplo,
  // dispara un solo fetch (a pagina 1), no dos.
  useEffect(() => { load(1); }, [load]);

  // Cambiar Etapa limpia el Frente elegido solo si ya no pertenece a la
  // nueva etapa (y Torre se limpia con él); cambiar Frente siempre limpia
  // Torre -- mismo criterio de cascada ya usado en Negocios.jsx.
  const handleEtapaChange = (value) => {
    setEtapaFilter(value);
    if (value && frenteFilter && !(frentesPorEtapa[value] || []).includes(frenteFilter)) {
      setFrenteFilter('');
      setTorreFilter('');
    } else if (value && frenteFilter && torreFilter && !(torresPorEtapaFrente[`${value}||${frenteFilter}`] || []).includes(torreFilter)) {
      setTorreFilter('');
    }
  };

  const handleFrenteChange = (value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  };

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentes;
  const torreOptions = frenteFilter
    ? (etapaFilter ? (torresPorEtapaFrente[`${etapaFilter}||${frenteFilter}`] || []) : (torresPorFrente[frenteFilter] || []))
    : [];
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter || conMovimientos;
  const clearFilters = () => { setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setConMovimientos(false); };

  const columns = useMemo(() => [...COLUMNAS_FIJAS, ...construirColumnasMeses(meses)], [meses]);

  // Mapea el id de cada columna de mes (grupo y sus dos hijas) al indice del
  // mes dentro de `meses`, para poder alternar el contraste de fondo mes a mes.
  const mesIndexPorColumna = useMemo(() => {
    const map = {};
    meses.forEach((mes, i) => {
      map[`mes-${mes}`] = i;
      map[`${mes}-esperado`] = i;
      map[`${mes}-recaudado`] = i;
    });
    return map;
  }, [meses]);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await getDashboardRecaudo({
        search: search || undefined,
        etapa: etapaFilter || undefined,
        frente: frenteFilter || undefined,
        torre: torreFilter || undefined,
        conMovimientos: conMovimientos || undefined,
        page: 1,
        limit: 9999,
      });
      const headers = ['Etapa', 'Frente', 'Torre', 'Nomenclatura'];
      for (const mes of res.meses) {
        headers.push(`${mes} Esperado`, `${mes} Recaudado`);
      }
      const filas = res.data.map((n) => {
        const row = { Etapa: n.etapa ?? '', Frente: n.frente ?? '', Torre: n.torre ?? '', Nomenclatura: n.nomenclatura ?? '' };
        for (const mes of res.meses) {
          row[`${mes} Esperado`] = n.porMes[mes]?.esperado ?? '';
          row[`${mes} Recaudado`] = n.porMes[mes]?.recaudado ?? '';
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(filas, { header: headers });
      ws['!cols'] = calcularAnchoColumnas(filas, headers);

      // Formato con separador de miles en las columnas de Esperado/Recaudado
      // (columnas 4 en adelante, 0-indexadas) para que se lean como plata.
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (let c = 4; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && typeof cell.v === 'number') cell.z = '#,##0';
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dashboard');
      XLSX.writeFile(wb, `dashboard-plan-vs-recaudo-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [search, etapaFilter, frenteFilter, torreFilter, conMovimientos]);

  const table = useReactTable({
    data: filas,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-[19px] font-bold text-slate-800 flex-1">Dashboard: Plan de pagos vs. Recaudo</h1>
        {filasResaltadas.size > 0 && (
          <button
            onClick={() => setFilasResaltadas(new Set())}
            className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-8 px-1"
          >
            <X size={11} /> Quitar resaltado ({filasResaltadas.size})
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download size={13} /> Exportar a Excel
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="field">
          <label className="field-label"><Search size={13} className="text-brand" />Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomenclatura o Proyecto/Torre…"
            className="input text-[14px] h-8 py-0 w-56"
          />
        </div>
        {etapas.length > 0 && (
          <div className="field">
            <label className="field-label"><Layers size={13} className="text-[#7c3aed]" />Etapa</label>
            <select value={etapaFilter} onChange={(e) => handleEtapaChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las etapas</option>
              {etapas.map((et) => <option key={et} value={et}>Etapa {et}</option>)}
            </select>
          </div>
        )}
        {frentes.length > 0 && (
          <div className="field">
            <label className="field-label"><MapPin size={13} className="text-[#7c3aed]" />Frente</label>
            <select value={frenteFilter} onChange={(e) => handleFrenteChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todos los frentes</option>
              {frenteOptions.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
            </select>
          </div>
        )}
        {frenteFilter && torreOptions.length > 0 && (
          <div className="field">
            <label className="field-label"><Building size={13} className="text-[#7c3aed]" />Torre</label>
            <select value={torreFilter} onChange={(e) => setTorreFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las torres</option>
              {torreOptions.map((tr) => <option key={tr} value={tr}>Torre {tr}</option>)}
            </select>
          </div>
        )}
        <button
          onClick={() => setConMovimientos((v) => !v)}
          className={`h-8 flex items-center gap-2 px-2.5 rounded-md border text-[14px] font-medium transition-colors ${
            conMovimientos
              ? 'bg-success-bg border-success-border text-success'
              : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
          }`}
        >
          <History size={13} className={conMovimientos ? 'text-success' : 'text-slate-500'} />
          Solo con movimientos
        </button>

        {hasFilters && (
          <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-8">
            <X size={11} /> Limpiar filtros
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-aed-border bg-aed-base">
                  {headerGroup.headers.map((header) => {
                    const mesIdx = mesIndexPorColumna[header.column.id];
                    const esImpar = mesIdx !== undefined && mesIdx % 2 === 1;
                    const esInicioMes = header.column.id.startsWith('mes-') || header.column.id.endsWith('-esperado');
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`section-label px-3 py-2 text-left whitespace-nowrap ${esImpar ? 'bg-slate-100' : ''} ${
                          esInicioMes && mesIdx > 0 ? 'border-l border-aed-border' : ''
                        }`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Cargando…</td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Sin resultados.</td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const clave = claveFila(row.original);
                  const resaltada = filasResaltadas.has(clave);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => toggleResaltado(clave)}
                      className={`border-b border-aed-border cursor-pointer transition-colors ${
                        resaltada ? 'bg-amber-100 hover:bg-amber-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const mesIdx = mesIndexPorColumna[cell.column.id];
                        const esImpar = mesIdx !== undefined && mesIdx % 2 === 1;
                        const esInicioMes = cell.column.id.endsWith('-esperado');
                        return (
                          <td
                            key={cell.id}
                            className={`px-3 py-2 whitespace-nowrap ${!resaltada && esImpar ? 'bg-slate-50' : ''} ${
                              esInicioMes && mesIdx > 0 ? 'border-l border-aed-border' : ''
                            }`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
            {meses.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-aed-border bg-aed-base font-semibold">
                  <td colSpan={COLUMNAS_FIJAS.length} className="px-3 py-2 text-[13px] text-slate-600">Total del portafolio filtrado</td>
                  {meses.map((mes) => (
                    <Fragment key={mes}>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">
                        {formatCOP(totales[mes]?.esperado ?? 0)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700">
                        {formatCOP(totales[mes]?.recaudado ?? 0)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
            <p className="text-[14px] text-slate-400">
              {pagination.total} inmuebles · Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => load(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                <ChevronLeft size={13} /> Anterior
              </button>
              <button onClick={() => load(Math.min(pagination.totalPages, page + 1))} disabled={page === pagination.totalPages} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
