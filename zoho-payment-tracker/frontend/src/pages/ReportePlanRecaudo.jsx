import { useState, useEffect, useCallback, useMemo, memo, Fragment } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Search, Layers, MapPin, Building, X, Download, History, CalendarRange, Briefcase, ExternalLink } from 'lucide-react';
import ExcelJS from 'exceljs';
import { getDashboardRecaudo } from '../utils/api';
import { formatCOP, formatDate } from '../utils/format';

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

// Acota la lista de meses (ya calculada por el backend sobre todo el
// portafolio) a un rango Desde/Hasta -- puramente de presentación, no
// cambia los totales de cada mes, solo cuáles se muestran/exportan.
function filtrarRangoMeses(meses, desde, hasta) {
  return meses.filter((m) => (!desde || m >= desde) && (!hasta || m <= hasta));
}

// Mismos colores que la tabla en pantalla (Tailwind teal/slate/amber/emerald),
// como ARGB para que el Excel exportado se vea igual: columnas fijas en teal,
// meses pares/impares alternados, filas resaltadas en ámbar.
const COLOR_EXCEL = {
  headerFijaBg: 'FF0D9488', // teal-600
  headerTexto: 'FFFFFFFF',
  celdaFijaBg: 'FFCCFBF1', // teal-100
  bordeFuerte: 'FF0F766E', // teal-700
  headerMesImparBg: 'FFF1F5F9', // slate-100
  headerMesParBg: 'FFF8FAFC', // slate-50 (aprox. aed-base)
  celdaMesImparBg: 'FFF8FAFC', // slate-50
  celdaMesParBg: 'FFFFFFFF',
  textoHeaderMes: 'FF64748B', // slate-500
  resaltadaBg: 'FFFEF3C7', // amber-100
  bordeSuave: 'FFE2E8F0', // slate-200
  textoRecaudado: 'FF047857', // emerald-700
  textoTotalLabel: 'FF475569', // slate-600
};

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
  columnHelper.accessor('valorInmueble', {
    header: 'Valor del inmueble',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
    },
  }),
  columnHelper.accessor('fechaSaldoContraentrega', {
    header: 'Fecha saldo contraentrega',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="text-[13px]">{formatDate(v)}</span>;
    },
  }),
  columnHelper.accessor('valorSaldoContraentrega', {
    header: 'Valor saldo contraentrega',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
    },
  }),
  columnHelper.accessor('totalAbonado', {
    header: 'Total abonado del inmueble',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px] text-emerald-700">{formatCOP(v)}</span>;
    },
  }),
];

// Ids de las columnas fijas (todo lo que no es un mes) -- se pintan de un
// color distinto en el encabezado y en las celdas para diferenciarlas de
// un vistazo de las columnas de Esperado/Recaudado por mes.
const COLUMNAS_FIJAS_IDS = new Set([
  'etapa', 'frente', 'torre', 'nomenclatura', 'valorInmueble',
  'fechaSaldoContraentrega', 'valorSaldoContraentrega', 'totalAbonado',
]);

// Anchos fijos en px para table-layout:fixed (ver TablaDashboard) -- con
// cientos de columnas (hasta ~200 meses x2), table-layout:auto obliga al
// navegador a medir el contenido de TODAS las filas por cada columna antes
// de poder pintar nada; fixed solo mira estos anchos, mucho más liviano al
// renderizar/scrollear. Los que no están en el mapa (Esperado/Recaudado de
// cada mes) usan el default más abajo.
const ANCHOS_FIJOS = {
  etapa: 70,
  frente: 120,
  torre: 70,
  nomenclatura: 210,
  valorInmueble: 150,
  fechaSaldoContraentrega: 180,
  valorSaldoContraentrega: 180,
  totalAbonado: 210,
};
function anchoColumna(id) {
  return ANCHOS_FIJOS[id] ?? 120;
}

const COLUMNA_ESPERADO = (mes) =>
  columnHelper.accessor((row) => row.porMes[mes]?.esperado ?? 0, {
    id: `${mes}-esperado`,
    header: 'Esperado',
    cell: (info) => <span className="font-mono text-[13px]">{formatCOP(info.getValue())}</span>,
  });

const COLUMNA_RECAUDADO = (mes) =>
  columnHelper.accessor((row) => row.porMes[mes]?.recaudado ?? 0, {
    id: `${mes}-recaudado`,
    header: 'Recaudado',
    cell: (info) => <span className="font-mono text-[13px] text-emerald-700">{formatCOP(info.getValue())}</span>,
  });

// `vista` decide qué sub-columnas de cada mes se arman: ambas (por defecto),
// solo Esperado o solo Recaudado -- el grupo del mes se mantiene igual en
// los tres casos, solo cambian sus hijas.
function construirColumnasMeses(meses, vista = 'ambos') {
  return meses.map((mes) => {
    const hijas = [];
    if (vista !== 'recaudado') hijas.push(COLUMNA_ESPERADO(mes));
    if (vista !== 'esperado') hijas.push(COLUMNA_RECAUDADO(mes));
    return columnHelper.group({
      id: `mes-${mes}`,
      header: formatMesLabel(mes),
      columns: hijas,
    });
  });
}

// ── Tabla del Dashboard, memoizada ──────────────────────────────────────────
// Separada del componente principal para que abrir/cerrar el menú contextual
// (estado que vive en ReportePlanRecaudo) no obligue a React a recalcular y
// diffear un árbol de miles de celdas -- con React.memo, este componente solo
// vuelve a renderizar cuando alguna de SUS props realmente cambia (filas,
// columnas, filtros, resaltado...), no en cada clic derecho.
const TablaDashboard = memo(function TablaDashboard({
  filas, columns, pagination, loading, mesesFiltrados, mesIndexPorColumna,
  primeraColMes, filasResaltadas, toggleResaltado, abrirMenuContextual, vistaMeses, totales,
}) {
  const table = useReactTable({
    data: filas,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  const leafColumns = table.getAllLeafColumns();

  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="text-[14px] table-fixed">
        <colgroup>
          {leafColumns.map((col) => (
            <col key={col.id} style={{ width: anchoColumna(col.id) }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-aed-border bg-aed-base">
              {headerGroup.headers.map((header) => {
                const esFija = COLUMNAS_FIJAS_IDS.has(header.column.id);
                const mesIdx = mesIndexPorColumna[header.column.id];
                const esImpar = mesIdx !== undefined && mesIdx % 2 === 1;
                const esInicioMes = header.column.id.startsWith('mes-') || header.column.id.endsWith(`-${primeraColMes}`);
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={`section-label px-3 py-2 text-left whitespace-nowrap ${
                      esFija ? 'bg-teal-600 text-white' : esImpar ? 'bg-slate-100' : ''
                    } ${
                      header.column.id === 'totalAbonado' ? 'border-r-4 border-teal-700' : ''
                    } ${esInicioMes && mesIdx > 0 ? 'border-l border-aed-border' : ''}`}
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
                  onContextMenu={(e) => abrirMenuContextual(e, row.original)}
                  className={`border-b border-aed-border cursor-pointer transition-colors ${
                    resaltada ? 'bg-amber-100 hover:bg-amber-200' : 'hover:bg-slate-50'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const esFija = COLUMNAS_FIJAS_IDS.has(cell.column.id);
                    const mesIdx = mesIndexPorColumna[cell.column.id];
                    const esImpar = mesIdx !== undefined && mesIdx % 2 === 1;
                    const esInicioMes = cell.column.id.endsWith(`-${primeraColMes}`);
                    return (
                      <td
                        key={cell.id}
                        className={`px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis ${
                          resaltada
                            ? ''
                            : esFija ? 'bg-teal-100' : esImpar ? 'bg-slate-50' : ''
                        } ${cell.column.id === 'totalAbonado' ? 'border-r-4 border-teal-700' : ''} ${
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
        {mesesFiltrados.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-aed-border bg-aed-base font-semibold">
              <td colSpan={COLUMNAS_FIJAS.length} className="px-3 py-2 text-[13px] text-slate-600">Total del portafolio filtrado</td>
              {mesesFiltrados.map((mes) => (
                <Fragment key={mes}>
                  {vistaMeses !== 'recaudado' && (
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">
                      {formatCOP(totales[mes]?.esperado ?? 0)}
                    </td>
                  )}
                  {vistaMeses !== 'esperado' && (
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700">
                      {formatCOP(totales[mes]?.recaudado ?? 0)}
                    </td>
                  )}
                </Fragment>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
});

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
  const [mesDesde, setMesDesde] = useState('');
  const [mesHasta, setMesHasta] = useState('');
  const [vistaMeses, setVistaMeses] = useState('ambos'); // 'ambos' | 'esperado' | 'recaudado'
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [totales, setTotales] = useState({});
  const [filasResaltadas, setFilasResaltadas] = useState(() => new Set());
  const [menuContextual, setMenuContextual] = useState(null); // { x, y, fila } | null

  const debouncedSearch = useDebounce(search);

  // useCallback con deps vacías (solo usan setters/actualizaciones
  // funcionales) para que su referencia sea estable entre renders -- si no,
  // React.memo de TablaDashboard no serviría de nada, porque recibiría una
  // prop "nueva" (aunque haga lo mismo) en cada render del padre.
  const toggleResaltado = useCallback((clave) => {
    setFilasResaltadas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }, []);

  const abrirMenuContextual = useCallback((e, fila) => {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  }, []);

  // Cerrar el menú contextual al hacer clic afuera, con Escape, o al scrollear.
  useEffect(() => {
    if (!menuContextual) return;
    const cerrar = () => setMenuContextual(null);
    const cerrarConEscape = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('click', cerrar);
    document.addEventListener('scroll', cerrar, true);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('click', cerrar);
      document.removeEventListener('scroll', cerrar, true);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [menuContextual]);

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
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter || conMovimientos || mesDesde || mesHasta || vistaMeses !== 'ambos';
  const clearFilters = () => {
    setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setConMovimientos(false);
    setMesDesde(''); setMesHasta(''); setVistaMeses('ambos');
  };

  const mesesFiltrados = useMemo(() => filtrarRangoMeses(meses, mesDesde, mesHasta), [meses, mesDesde, mesHasta]);

  // Columna que abre cada mes (para el borde separador entre meses) -- cambia
  // según qué sub-columna quedó visible en la vista elegida.
  const primeraColMes = vistaMeses === 'recaudado' ? 'recaudado' : 'esperado';

  const columns = useMemo(
    () => [...COLUMNAS_FIJAS, ...construirColumnasMeses(mesesFiltrados, vistaMeses)],
    [mesesFiltrados, vistaMeses]
  );

  // Mapea el id de cada columna de mes (grupo y sus dos hijas) al indice del
  // mes dentro de `mesesFiltrados`, para poder alternar el contraste de fondo mes a mes.
  const mesIndexPorColumna = useMemo(() => {
    const map = {};
    mesesFiltrados.forEach((mes, i) => {
      map[`mes-${mes}`] = i;
      map[`${mes}-esperado`] = i;
      map[`${mes}-recaudado`] = i;
    });
    return map;
  }, [mesesFiltrados]);

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
      const mesesExport = filtrarRangoMeses(res.meses, mesDesde, mesHasta);

      // Aplana cada mes a 1 o 2 sub-columnas (Esperado/Recaudado) según la
      // vista elegida -- mismo criterio que construirColumnasMeses en pantalla.
      const colsMeses = [];
      mesesExport.forEach((mes, mesIdx) => {
        if (vistaMeses !== 'recaudado') colsMeses.push({ mes, tipo: 'esperado', mesIdx });
        if (vistaMeses !== 'esperado') colsMeses.push({ mes, tipo: 'recaudado', mesIdx });
      });

      const FIJAS = [
        { header: 'Etapa', key: 'etapa', width: 8 },
        { header: 'Frente', key: 'frente', width: 14 },
        { header: 'Torre', key: 'torre', width: 8 },
        { header: 'Nomenclatura', key: 'nomenclatura', width: 26 },
        { header: 'Valor del inmueble', key: 'valorInmueble', width: 18 },
        { header: 'Fecha saldo contraentrega', key: 'fechaSaldoContraentrega', width: 18 },
        { header: 'Valor saldo contraentrega', key: 'valorSaldoContraentrega', width: 18 },
        { header: 'Total abonado del inmueble', key: 'totalAbonado', width: 22 },
      ];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Dashboard');

      FIJAS.forEach((f, i) => { ws.getColumn(i + 1).width = f.width; });
      colsMeses.forEach((_, i) => { ws.getColumn(FIJAS.length + i + 1).width = 15; });

      const fillSolida = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
      const bordeIzq = { left: { style: 'thin', color: { argb: COLOR_EXCEL.bordeSuave } } };
      const bordeDerFuerte = { right: { style: 'medium', color: { argb: COLOR_EXCEL.bordeFuerte } } };

      // Encabezado: 2 filas, columnas fijas fusionadas verticalmente y cada
      // mes fusionado horizontalmente en la fila 1 (igual que <thead> en pantalla).
      const headerRow1 = ws.getRow(1);
      const headerRow2 = ws.getRow(2);

      FIJAS.forEach((f, i) => {
        const col = i + 1;
        ws.mergeCells(1, col, 2, col);
        const cell = headerRow1.getCell(col);
        cell.value = f.header.toUpperCase();
        cell.fill = fillSolida(COLOR_EXCEL.headerFijaBg);
        cell.font = { bold: true, color: { argb: COLOR_EXCEL.headerTexto }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        if (f.key === 'totalAbonado') cell.border = bordeDerFuerte;
      });

      let cursor = FIJAS.length + 1;
      mesesExport.forEach((mes, mesIdx) => {
        const hijas = colsMeses.filter((c) => c.mesIdx === mesIdx);
        const inicio = cursor;
        const fin = cursor + hijas.length - 1;
        const esImpar = mesIdx % 2 === 1;
        const bgHeader = esImpar ? COLOR_EXCEL.headerMesImparBg : COLOR_EXCEL.headerMesParBg;

        if (fin > inicio) ws.mergeCells(1, inicio, 1, fin);
        const cellMes = headerRow1.getCell(inicio);
        cellMes.value = formatMesLabel(mes).toUpperCase();
        cellMes.fill = fillSolida(bgHeader);
        cellMes.font = { bold: true, color: { argb: COLOR_EXCEL.textoHeaderMes }, size: 11 };
        cellMes.alignment = { vertical: 'middle', horizontal: 'left' };
        if (mesIdx > 0) cellMes.border = bordeIzq;

        hijas.forEach((h, j) => {
          const col = inicio + j;
          const cell = headerRow2.getCell(col);
          cell.value = h.tipo === 'esperado' ? 'ESPERADO' : 'RECAUDADO';
          cell.fill = fillSolida(bgHeader);
          cell.font = { bold: true, color: { argb: COLOR_EXCEL.textoHeaderMes }, size: 10 };
          if (j === 0 && mesIdx > 0) cell.border = bordeIzq;
        });

        cursor = fin + 1;
      });
      headerRow1.height = 20;
      headerRow2.height = 16;

      // Filas de datos -- mismos colores que la tabla en pantalla, incluyendo
      // el resaltado ámbar de las filas que el usuario marcó con clic.
      let rowNum = 3;
      for (const n of res.data) {
        const row = ws.getRow(rowNum);
        const resaltada = filasResaltadas.has(claveFila(n));
        const bgFija = resaltada ? COLOR_EXCEL.resaltadaBg : COLOR_EXCEL.celdaFijaBg;

        FIJAS.forEach((f, i) => {
          const col = i + 1;
          const cell = row.getCell(col);
          if (f.key === 'fechaSaldoContraentrega') {
            cell.value = n[f.key] ? new Date(n[f.key]) : null;
            cell.numFmt = 'dd/mm/yyyy';
          } else if (f.key === 'valorInmueble' || f.key === 'valorSaldoContraentrega' || f.key === 'totalAbonado') {
            cell.value = n[f.key] ?? 0;
            cell.numFmt = '#,##0';
            if (f.key === 'totalAbonado') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          } else {
            cell.value = n[f.key] ?? '';
          }
          cell.fill = fillSolida(bgFija);
          if (f.key === 'totalAbonado') cell.border = bordeDerFuerte;
        });

        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = row.getCell(col);
          cell.value = n.porMes[c.mes]?.[c.tipo] ?? 0;
          cell.numFmt = '#,##0';
          if (c.tipo === 'recaudado') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          const esImpar = c.mesIdx % 2 === 1;
          cell.fill = fillSolida(resaltada ? COLOR_EXCEL.resaltadaBg : (esImpar ? COLOR_EXCEL.celdaMesImparBg : COLOR_EXCEL.celdaMesParBg));
          const esInicioMes = j === 0 || colsMeses[j - 1].mesIdx !== c.mesIdx;
          if (esInicioMes && c.mesIdx > 0) cell.border = bordeIzq;
        });
        rowNum++;
      }

      // Fila de totales del portafolio filtrado, igual que el <tfoot> en pantalla.
      if (mesesExport.length > 0) {
        const totalRow = ws.getRow(rowNum);
        ws.mergeCells(rowNum, 1, rowNum, FIJAS.length);
        const bordeArriba = { top: { style: 'medium', color: { argb: COLOR_EXCEL.bordeSuave } } };

        const labelCell = totalRow.getCell(1);
        labelCell.value = 'Total del portafolio filtrado';
        labelCell.font = { bold: true, color: { argb: COLOR_EXCEL.textoTotalLabel } };
        labelCell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
        labelCell.border = bordeArriba;

        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = totalRow.getCell(col);
          cell.value = res.totales[c.mes]?.[c.tipo] ?? 0;
          cell.numFmt = '#,##0';
          cell.font = { bold: true, color: { argb: c.tipo === 'recaudado' ? COLOR_EXCEL.textoRecaudado : COLOR_EXCEL.textoTotalLabel } };
          cell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
          cell.border = bordeArriba;
        });
      }

      ws.views = [{ state: 'frozen', xSplit: FIJAS.length, ySplit: 2 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-plan-vs-recaudo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [search, etapaFilter, frenteFilter, torreFilter, conMovimientos, mesDesde, mesHasta, vistaMeses, filasResaltadas]);

  return (
    <div className="h-full flex flex-col gap-3 p-5 overflow-hidden">
      <div className="flex items-center gap-2 flex-shrink-0">
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

      <div className="flex flex-wrap items-end gap-2.5 flex-shrink-0">
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
        {meses.length > 0 && (
          <div className="field">
            <label className="field-label"><CalendarRange size={13} className="text-[#7c3aed]" />Desde</label>
            <input
              type="month"
              value={mesDesde}
              min={meses[0]}
              max={mesHasta || meses[meses.length - 1]}
              onChange={(e) => setMesDesde(e.target.value)}
              className="input text-[14px] h-8 py-0 pr-2 leading-none"
            />
          </div>
        )}
        {meses.length > 0 && (
          <div className="field">
            <label className="field-label"><CalendarRange size={13} className="text-[#7c3aed]" />Hasta</label>
            <input
              type="month"
              value={mesHasta}
              min={mesDesde || meses[0]}
              max={meses[meses.length - 1]}
              onChange={(e) => setMesHasta(e.target.value)}
              className="input text-[14px] h-8 py-0 pr-2 leading-none"
            />
          </div>
        )}
        <div className="field">
          <label className="field-label">Ver</label>
          <div className="flex h-8 rounded-md border border-aed-border overflow-hidden">
            {[
              { value: 'ambos', label: 'Ambos' },
              { value: 'esperado', label: 'Esperado' },
              { value: 'recaudado', label: 'Recaudado' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setVistaMeses(value)}
                className={`px-2.5 text-[14px] font-medium transition-colors border-r border-aed-border last:border-r-0 ${
                  vistaMeses === value
                    ? 'bg-brand text-white'
                    : 'bg-white text-slate-500 hover:bg-aed-base'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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

      {meses.length > 0 && mesesFiltrados.length === 0 && (
        <p className="text-[13px] text-amber-600 flex-shrink-0">No hay meses en el rango seleccionado — ajusta Desde/Hasta.</p>
      )}

      <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
        <TablaDashboard
          filas={filas}
          columns={columns}
          pagination={pagination}
          loading={loading}
          mesesFiltrados={mesesFiltrados}
          mesIndexPorColumna={mesIndexPorColumna}
          primeraColMes={primeraColMes}
          filasResaltadas={filasResaltadas}
          toggleResaltado={toggleResaltado}
          abrirMenuContextual={abrirMenuContextual}
          vistaMeses={vistaMeses}
          totales={totales}
        />

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between flex-shrink-0">
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

      {menuContextual && (
        <div
          className="fixed z-50 bg-white border border-aed-border rounded-md shadow-lg py-1 min-w-[200px]"
          style={{ top: menuContextual.y, left: menuContextual.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              window.open(`/?negocio=inv-${menuContextual.fila.id}`, '_blank');
              setMenuContextual(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2"
          >
            <Briefcase size={13} className="text-brand" /> Ver negocio
          </button>
          <button
            onClick={() => {
              if (!menuContextual.fila.opportunityId) return;
              window.open(`/opportunity/${menuContextual.fila.opportunityId}`, '_blank');
              setMenuContextual(null);
            }}
            disabled={!menuContextual.fila.opportunityId}
            title={menuContextual.fila.opportunityId ? undefined : 'No hay oportunidad vinculada a este inmueble'}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ExternalLink size={13} className="text-brand" /> Ver oportunidad
          </button>
        </div>
      )}
    </div>
  );
}
