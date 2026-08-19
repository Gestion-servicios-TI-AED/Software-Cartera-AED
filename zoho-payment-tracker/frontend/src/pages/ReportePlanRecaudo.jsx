import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, memo, Fragment } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Search, Layers, MapPin, Building, X, Download, History, CalendarRange, Briefcase, ExternalLink, Warehouse, Maximize2, Minimize2 } from 'lucide-react';
import ExcelJS from 'exceljs';
import { getDashboardRecaudo } from '../utils/api';
import { formatCOP, formatDate } from '../utils/format';
import { etiquetaEtapa } from '../utils/etapas';
import { useModoEnfocado } from '../hooks/useModoEnfocado';
import Spinner from '../components/Spinner';

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
  textoPendiente: 'FFB45309', // amber-700
  textoVencido: 'FFDC2626', // red-600
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
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : `Torre ${v}`;
    },
  }),
  columnHelper.accessor('unidad', {
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
  columnHelper.accessor('valorCuotaInicial', {
    header: 'Valor cuota inicial',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
    },
  }),
  columnHelper.accessor('abonadoCuotaInicial', {
    header: 'Abonado cuota inicial',
    cell: (info) => {
      const v = info.getValue();
      return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px] text-emerald-700">{formatCOP(v)}</span>;
    },
  }),
  columnHelper.accessor('fechaSaldoContraentrega', {
    header: 'Terminación de obra',
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
  columnHelper.accessor(
    (row) => (row.valorInmueble != null && row.totalAbonado != null ? Math.max(0, row.valorInmueble - row.totalAbonado) : null),
    {
      id: 'pendienteRecaudar',
      header: 'Por recaudar',
      cell: (info) => {
        const v = info.getValue();
        return v == null ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px] text-amber-700">{formatCOP(v)}</span>;
      },
    }
  ),
  columnHelper.accessor('cuotasEnMora', {
    header: 'Cuotas vencidas (total)',
    cell: (info) => {
      const v = info.getValue();
      return !v ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px] text-red-600">{v}</span>;
    },
  }),
  columnHelper.accessor('montoEnMora', {
    header: 'Valor cuotas vencidas (total)',
    cell: (info) => {
      const v = info.getValue();
      return !v ? <span className="text-slate-300">—</span> : <span className="font-mono text-[13px] text-red-600">{formatCOP(v)}</span>;
    },
  }),
];

// Ids de las columnas fijas (todo lo que no es un mes) -- se pintan de un
// color distinto en el encabezado y en las celdas para diferenciarlas de
// un vistazo de las columnas de Esperado/Recaudado por mes.
const COLUMNAS_FIJAS_IDS = new Set([
  'etapa', 'frente', 'torre', 'unidad', 'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial',
  'fechaSaldoContraentrega', 'valorSaldoContraentrega', 'totalAbonado', 'pendienteRecaudar',
  'cuotasEnMora', 'montoEnMora',
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
  unidad: 210,
  valorInmueble: 150,
  valorCuotaInicial: 170,
  abonadoCuotaInicial: 190,
  fechaSaldoContraentrega: 180,
  valorSaldoContraentrega: 180,
  totalAbonado: 210,
  pendienteRecaudar: 190,
  cuotasEnMora: 130,
  montoEnMora: 190,
};
function anchoColumna(id) {
  return ANCHOS_FIJOS[id] ?? 120;
}

// Identidad de la fila (dónde está el inmueble) -- se quedan fijas (sticky)
// al hacer scroll horizontal, para no perder de vista a qué torre/unidad
// pertenece cada valor aunque haya cientos de columnas de mes a la derecha.
const COLUMNAS_STICKY_IZQ = ['etapa', 'frente', 'torre', 'unidad'];
const STICKY_LEFT = (() => {
  const mapa = {};
  let acumulado = 0;
  for (const id of COLUMNAS_STICKY_IZQ) {
    mapa[id] = acumulado;
    acumulado += anchoColumna(id);
  }
  return mapa;
})();

// Elige qué desglose de cada fila usar según el filtro Plan (30%/70%/Ambos):
// Cuota Inicial (~30%, todo el plan MENOS Saldo Contraentrega), Saldo
// Contraentrega (~70%, la última cuota), o el total combinado -- mismos tres
// desgloses que ya calcula el backend por fila (porMes/porMesInicial/
// porMesContraentrega), reutilizados tal cual sin pedir nada más al servidor.
function fuentePorMes(row, alcancePlan) {
  if (alcancePlan === 'inicial') return row.porMesInicial;
  if (alcancePlan === 'contraentrega') return row.porMesContraentrega;
  return row.porMes;
}

// Solo se deja la celda vacía cuando Esperado Y Recaudado del mes son
// AMBOS $0 -- con cientos de columnas de mes, un "$0" repetido en casi
// todas las celdas es puro ruido visual. Si cualquiera de los dos tiene
// movimiento real, el otro sigue mostrando "$0" (no puede quedar vacío al
// lado de un valor real, se vería como que falta un dato).
function ambosEnCero(row, mes, alcancePlan) {
  const m = fuentePorMes(row, alcancePlan)?.[mes];
  return (m?.esperado ?? 0) === 0 && (m?.recaudado ?? 0) === 0;
}

const COLUMNA_ESPERADO = (mes, alcancePlan) =>
  columnHelper.accessor((row) => fuentePorMes(row, alcancePlan)?.[mes]?.esperado ?? 0, {
    id: `${mes}-esperado`,
    header: 'Proyectado',
    cell: (info) => {
      if (ambosEnCero(info.row.original, mes, alcancePlan)) return null;
      return <span className="font-mono text-[13px]">{formatCOP(info.getValue())}</span>;
    },
  });

const COLUMNA_RECAUDADO = (mes, alcancePlan) =>
  columnHelper.accessor((row) => fuentePorMes(row, alcancePlan)?.[mes]?.recaudado ?? 0, {
    id: `${mes}-recaudado`,
    header: 'Recaudado',
    cell: (info) => {
      if (ambosEnCero(info.row.original, mes, alcancePlan)) return null;
      return <span className="font-mono text-[13px] text-emerald-700">{formatCOP(info.getValue())}</span>;
    },
  });

// "Por recaudar" de un mes = Diferencia (Valor de la cuota - Valor pagado) de
// la conciliación, sumada sobre las cuotas de esos negocios cuya fecha
// esperada cae en ese mes -- mismo campo que la columna "Diferencia" en
// Negocios → Conciliación. Siempre visible (no depende del filtro "Ver"),
// porque complementa tanto a Proyectado como a Recaudado.
const COLUMNA_POR_RECAUDAR = (mes, alcancePlan) =>
  columnHelper.accessor((row) => fuentePorMes(row, alcancePlan)?.[mes]?.porRecaudar ?? 0, {
    id: `${mes}-porRecaudar`,
    header: 'Por recaudar',
    cell: (info) => {
      if (ambosEnCero(info.row.original, mes, alcancePlan)) return null;
      return <span className="font-mono text-[13px] text-amber-700">{formatCOP(info.getValue())}</span>;
    },
  });

// `vista` decide qué sub-columnas de cada mes se arman: ambas (por defecto),
// solo Esperado o solo Recaudado. `alcancePlan` decide de qué desglose salen
// los valores (30%/70%/Ambos) -- el grupo del mes se mantiene igual en todos
// los casos, solo cambian sus hijas. "Por recaudar" siempre se agrega.
function construirColumnasMeses(meses, vista = 'ambos', alcancePlan = 'ambos') {
  return meses.map((mes) => {
    const hijas = [];
    if (vista !== 'recaudado') hijas.push(COLUMNA_ESPERADO(mes, alcancePlan));
    if (vista !== 'esperado') hijas.push(COLUMNA_RECAUDADO(mes, alcancePlan));
    hijas.push(COLUMNA_POR_RECAUDAR(mes, alcancePlan));
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
  totalesColumnasFijas, sortBy, sortDir, onSort,
}) {
  const table = useReactTable({
    data: filas,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  // El ancho REAL renderizado de cada columna no siempre coincide con
  // ANCHOS_FIJOS (el algoritmo de table-fixed con tantas columnas de mes no
  // los respeta 1:1) -- así que el offset `left` de cada columna sticky se
  // mide del DOM real en vez de asumirlo, o quedan huecos/superposiciones
  // entre columnas fijas.
  const stickyRefs = useRef({});
  const [stickyLefts, setStickyLefts] = useState(() => ({ ...STICKY_LEFT }));
  useLayoutEffect(() => {
    let acumulado = 0;
    const next = {};
    for (const id of COLUMNAS_STICKY_IZQ) {
      next[id] = acumulado;
      const el = stickyRefs.current[id];
      acumulado += el ? el.getBoundingClientRect().width : anchoColumna(id);
    }
    setStickyLefts(next);
  }, [columns]);

  const leafColumns = table.getAllLeafColumns();

  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="text-[14px] table-fixed">
        <colgroup>
          {leafColumns.map((col) => (
            <col key={col.id} style={{ width: anchoColumna(col.id) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-aed-border bg-aed-base">
              {headerGroup.headers.map((header) => {
                const esFija = COLUMNAS_FIJAS_IDS.has(header.column.id);
                const mesIdx = mesIndexPorColumna[header.column.id];
                const esImpar = mesIdx !== undefined && mesIdx % 2 === 1;
                const esInicioMes = header.column.id.startsWith('mes-') || header.column.id.endsWith(`-${primeraColMes}`);
                const ordenActivo = esFija && sortBy === header.column.id;
                const Icono = ordenActivo ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                const stickyLeft = stickyLefts[header.column.id];
                const esSticky = stickyLeft !== undefined;
                return (
                  <th
                    key={header.id}
                    ref={esSticky ? (el) => { stickyRefs.current[header.column.id] = el; } : undefined}
                    colSpan={header.colSpan}
                    onClick={esFija ? () => onSort(header.column.id) : undefined}
                    className={`section-label px-3 py-2 text-left whitespace-nowrap ${
                      esFija ? 'bg-teal-600 text-white cursor-pointer select-none hover:bg-teal-700' : esImpar ? 'bg-slate-100' : ''
                    } ${
                      header.column.id === 'montoEnMora' ? 'border-r-4 border-teal-700' : ''
                    } ${esInicioMes && mesIdx > 0 ? 'border-l border-aed-border' : ''} ${
                      esSticky ? 'sticky z-30' : ''
                    } ${header.column.id === 'unidad' ? 'shadow-[2px_0_4px_rgba(0,0,0,0.08)]' : ''}`}
                    style={esSticky ? { left: stickyLeft } : undefined}
                  >
                    {header.isPlaceholder ? null : esFija ? (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <Icono size={12} className={ordenActivo ? 'text-white' : 'text-teal-100'} />
                      </span>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        {mesesFiltrados.length > 0 && (
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t-2 border-aed-border bg-aed-base font-semibold shadow-[0_-2px_4px_rgba(0,0,0,0.06)]">
              <td
                colSpan={4}
                className="px-3 py-2 text-[13px] text-slate-600 bg-aed-base sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.08)]"
              >
                Total del portafolio filtrado
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] bg-aed-base">
                {formatCOP(totalesColumnasFijas?.valorInmueble ?? 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] bg-aed-base">
                {formatCOP(totalesColumnasFijas?.valorCuotaInicial ?? 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700 bg-aed-base">
                {formatCOP(totalesColumnasFijas?.abonadoCuotaInicial ?? 0)}
              </td>
              <td className="px-3 py-2 bg-aed-base" />
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] bg-aed-base">
                {formatCOP(totalesColumnasFijas?.valorSaldoContraentrega ?? 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700 bg-aed-base">
                {formatCOP(totalesColumnasFijas?.totalAbonado ?? 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-amber-700 bg-aed-base">
                {formatCOP(totalesColumnasFijas?.pendienteRecaudar ?? 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-red-600 bg-aed-base">
                {totalesColumnasFijas?.cuotasEnMora ?? 0}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-red-600 bg-aed-base">
                {formatCOP(totalesColumnasFijas?.montoEnMora ?? 0)}
              </td>
              {mesesFiltrados.map((mes) => (
                <Fragment key={mes}>
                  {vistaMeses !== 'recaudado' && (
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] bg-aed-base">
                      {formatCOP(totales[mes]?.esperado ?? 0)}
                    </td>
                  )}
                  {vistaMeses !== 'esperado' && (
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700 bg-aed-base">
                      {formatCOP(totales[mes]?.recaudado ?? 0)}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-amber-700 bg-aed-base">
                    {formatCOP(totales[mes]?.porRecaudar ?? 0)}
                  </td>
                </Fragment>
              ))}
            </tr>
          </tfoot>
        )}
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}><Spinner label="Cargando plan de pagos…" /></td>
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
                    const stickyLeft = stickyLefts[cell.column.id];
                    const esSticky = stickyLeft !== undefined;
                    return (
                      <td
                        key={cell.id}
                        className={`px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis ${
                          // Las columnas sticky necesitan un fondo opaco explícito
                          // (no pueden depender del bg de la fila mostrando "a
                          // través" de ellas) porque quedan fijas mientras el
                          // resto de la fila se desplaza por debajo.
                          esSticky
                            ? (resaltada ? 'bg-amber-100' : 'bg-teal-100')
                            : resaltada ? '' : esFija ? 'bg-teal-100' : esImpar ? 'bg-slate-50' : ''
                        } ${cell.column.id === 'montoEnMora' ? 'border-r-4 border-teal-700' : ''} ${
                          esInicioMes && mesIdx > 0 ? 'border-l border-aed-border' : ''
                        } ${esSticky ? 'sticky z-10' : ''} ${
                          cell.column.id === 'unidad' ? 'shadow-[2px_0_4px_rgba(0,0,0,0.08)]' : ''
                        }`}
                        style={esSticky ? { left: stickyLeft } : undefined}
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
  // Qué porción del plan mostrar en las columnas mensuales -- Ambos (100%,
  // por defecto), Cuota Inicial (~30%) o Saldo Contraentrega (~70%). El
  // backend ya manda las tres versiones en cada carga (porMes/porMesInicial/
  // porMesContraentrega por fila, totales/totalesInicial/totalesContraentrega
  // en general), así que cambiar esto es puramente de presentación -- no
  // dispara un nuevo fetch (no está en las deps de `load`).
  const [alcancePlan, setAlcancePlan] = useState('ambos'); // 'ambos' | 'inicial' | 'contraentrega'
  // Modo enfocado: la tabla pasa a cubrir toda la pantalla -- útil con
  // cientos de columnas de mes, donde el layout normal deja poco espacio.
  const [enfocado, toggleEnfocado] = useModoEnfocado();
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [totales, setTotales] = useState({});
  const [totalesInicial, setTotalesInicial] = useState({});
  const [totalesContraentrega, setTotalesContraentrega] = useState({});
  const [totalesColumnasFijas, setTotalesColumnasFijas] = useState(null);
  const [filasResaltadas, setFilasResaltadas] = useState(() => new Set());
  const [menuContextual, setMenuContextual] = useState(null); // { x, y, fila } | null
  // Un solo estado para los dos campos -- así el ciclo de 3 clics se resuelve
  // en una sola actualización funcional (lee el valor previo), sin depender
  // de leer sortBy/sortDir del closure -- necesario para que handleSort
  // pueda ir en un useCallback con deps vacías (TablaDashboard está memoizado).
  const [sort, setSort] = useState({ by: null, dir: null });
  const { by: sortBy, dir: sortDir } = sort;

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

  // Clic en un encabezado: 1er clic ordena ascendente, 2do descendente, 3ro
  // quita el orden -- se resuelve en el backend sobre todo el conjunto
  // filtrado, no solo la página que se ve (mismo criterio que Cartera en Gestión).
  const handleSort = useCallback((campo) => {
    setSort((prev) => {
      if (prev.by !== campo) return { by: campo, dir: 'asc' };
      if (prev.dir === 'asc') return { by: campo, dir: 'desc' };
      return { by: null, dir: null };
    });
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
        sortBy: sortBy || undefined,
        sortDir: sortDir || undefined,
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
      setTotalesInicial(res.totalesInicial);
      setTotalesContraentrega(res.totalesContraentrega);
      setTotalesColumnasFijas(res.totalesColumnasFijas);
      setPage(p);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, etapaFilter, frenteFilter, torreFilter, conMovimientos, sortBy, sortDir]);

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
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter || conMovimientos || mesDesde || mesHasta || vistaMeses !== 'ambos' || alcancePlan !== 'ambos';
  const clearFilters = () => {
    setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setConMovimientos(false);
    setMesDesde(''); setMesHasta(''); setVistaMeses('ambos'); setAlcancePlan('ambos');
  };

  const mesesFiltrados = useMemo(() => filtrarRangoMeses(meses, mesDesde, mesHasta), [meses, mesDesde, mesHasta]);

  // Columna que abre cada mes (para el borde separador entre meses) -- cambia
  // según qué sub-columna quedó visible en la vista elegida.
  const primeraColMes = vistaMeses === 'recaudado' ? 'recaudado' : 'esperado';

  const columns = useMemo(
    () => [...COLUMNAS_FIJAS, ...construirColumnasMeses(mesesFiltrados, vistaMeses, alcancePlan)],
    [mesesFiltrados, vistaMeses, alcancePlan]
  );

  // Totales del pie de tabla según el mismo filtro Plan (30%/70%/Ambos) --
  // las tres versiones ya vinieron en la carga, acá solo se elige cuál mostrar.
  const totalesActivos = useMemo(() => {
    if (alcancePlan === 'inicial') return totalesInicial;
    if (alcancePlan === 'contraentrega') return totalesContraentrega;
    return totales;
  }, [alcancePlan, totales, totalesInicial, totalesContraentrega]);

  // Mapea el id de cada columna de mes (grupo y sus dos hijas) al indice del
  // mes dentro de `mesesFiltrados`, para poder alternar el contraste de fondo mes a mes.
  const mesIndexPorColumna = useMemo(() => {
    const map = {};
    mesesFiltrados.forEach((mes, i) => {
      map[`mes-${mes}`] = i;
      map[`${mes}-esperado`] = i;
      map[`${mes}-recaudado`] = i;
      map[`${mes}-porRecaudar`] = i;
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
        sortBy: sortBy || undefined,
        sortDir: sortDir || undefined,
        page: 1,
        limit: 9999,
      });
      const mesesExport = filtrarRangoMeses(res.meses, mesDesde, mesHasta);

      // Aplana cada mes a sus sub-columnas (Esperado/Recaudado según la vista
      // elegida, más "Por recaudar" que siempre se incluye) -- mismo criterio
      // que construirColumnasMeses en pantalla.
      const colsMeses = [];
      mesesExport.forEach((mes, mesIdx) => {
        if (vistaMeses !== 'recaudado') colsMeses.push({ mes, tipo: 'esperado', mesIdx });
        if (vistaMeses !== 'esperado') colsMeses.push({ mes, tipo: 'recaudado', mesIdx });
        colsMeses.push({ mes, tipo: 'porRecaudar', mesIdx });
      });

      const FIJAS = [
        { header: 'Etapa', key: 'etapa', width: 8 },
        { header: 'Frente', key: 'frente', width: 14 },
        { header: 'Torre', key: 'torre', width: 8 },
        { header: 'Nomenclatura', key: 'unidad', width: 26 },
        { header: 'Valor del inmueble', key: 'valorInmueble', width: 18 },
        { header: 'Valor cuota inicial', key: 'valorCuotaInicial', width: 18 },
        { header: 'Abonado cuota inicial', key: 'abonadoCuotaInicial', width: 20 },
        { header: 'Terminación de obra', key: 'fechaSaldoContraentrega', width: 18 },
        { header: 'Valor saldo contraentrega', key: 'valorSaldoContraentrega', width: 18 },
        { header: 'Total abonado del inmueble', key: 'totalAbonado', width: 22 },
        { header: 'Por recaudar', key: 'pendienteRecaudar', width: 20 },
        { header: 'Cuotas vencidas (total)', key: 'cuotasEnMora', width: 14 },
        { header: 'Valor cuotas vencidas (total)', key: 'montoEnMora', width: 20 },
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
        if (f.key === 'montoEnMora') cell.border = bordeDerFuerte;
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
          cell.value = h.tipo === 'esperado' ? 'PROYECTADO' : h.tipo === 'recaudado' ? 'RECAUDADO' : 'POR RECAUDAR';
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
          } else if (f.key === 'torre') {
            cell.value = n.torre != null ? `Torre ${n.torre}` : '';
          } else if (f.key === 'pendienteRecaudar') {
            cell.value = n.valorInmueble != null && n.totalAbonado != null ? Math.max(0, n.valorInmueble - n.totalAbonado) : 0;
            cell.numFmt = '#,##0';
            cell.font = { color: { argb: COLOR_EXCEL.textoPendiente } };
          } else if (f.key === 'cuotasEnMora') {
            cell.value = n.cuotasEnMora ?? 0;
            cell.font = { color: { argb: COLOR_EXCEL.textoVencido } };
          } else if (f.key === 'montoEnMora') {
            cell.value = n.montoEnMora ?? 0;
            cell.numFmt = '#,##0';
            cell.font = { color: { argb: COLOR_EXCEL.textoVencido } };
          } else if (
            f.key === 'valorInmueble' || f.key === 'valorSaldoContraentrega' || f.key === 'totalAbonado' ||
            f.key === 'valorCuotaInicial' || f.key === 'abonadoCuotaInicial'
          ) {
            cell.value = n[f.key] ?? 0;
            cell.numFmt = '#,##0';
            if (f.key === 'totalAbonado' || f.key === 'abonadoCuotaInicial') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          } else {
            cell.value = n[f.key] ?? '';
          }
          cell.fill = fillSolida(bgFija);
          if (f.key === 'montoEnMora') cell.border = bordeDerFuerte;
        });

        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = row.getCell(col);
          const valorMes = fuentePorMes(n, alcancePlan)?.[c.mes]?.[c.tipo] ?? 0;
          // A diferencia de la pantalla (que deja el mes en blanco cuando
          // Esperado Y Recaudado son ambos $0, por limpieza visual), acá
          // siempre se escribe 0 -- una columna con celdas realmente vacías
          // (no "0") rompe el autosuma de Excel: al pararse en una celda
          // vacía y sumar hacia arriba, Excel corta el rango justo ahí y
          // deja fuera el resto de la columna en vez de sumarla completa.
          cell.value = valorMes;
          cell.numFmt = '#,##0';
          if (c.tipo === 'recaudado') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          else if (c.tipo === 'porRecaudar') cell.font = { color: { argb: COLOR_EXCEL.textoPendiente } };
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
        ws.mergeCells(rowNum, 1, rowNum, 4);
        const bordeArriba = { top: { style: 'medium', color: { argb: COLOR_EXCEL.bordeSuave } } };

        const labelCell = totalRow.getCell(1);
        labelCell.value = 'Total del portafolio filtrado';
        labelCell.font = { bold: true, color: { argb: COLOR_EXCEL.textoTotalLabel } };
        labelCell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
        labelCell.border = bordeArriba;

        const totalesFijos = res.totalesColumnasFijas || {};
        const colorPorClave = {
          totalAbonado: COLOR_EXCEL.textoRecaudado,
          abonadoCuotaInicial: COLOR_EXCEL.textoRecaudado,
          pendienteRecaudar: COLOR_EXCEL.textoPendiente,
          cuotasEnMora: COLOR_EXCEL.textoVencido,
          montoEnMora: COLOR_EXCEL.textoVencido,
        };
        FIJAS.forEach((f, i) => {
          if (i < 4) return; // ya cubiertas por la celda fusionada del label
          const cell = totalRow.getCell(i + 1);
          cell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
          cell.border = bordeArriba;
          if (f.key === 'fechaSaldoContraentrega') return; // no aplica un total de fechas
          cell.value = totalesFijos[f.key] ?? 0;
          cell.numFmt = '#,##0';
          cell.font = { bold: true, color: { argb: colorPorClave[f.key] ?? COLOR_EXCEL.textoTotalLabel } };
        });

        const totalesExport = alcancePlan === 'inicial' ? res.totalesInicial
          : alcancePlan === 'contraentrega' ? res.totalesContraentrega
          : res.totales;
        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = totalRow.getCell(col);
          cell.value = totalesExport[c.mes]?.[c.tipo] ?? 0;
          cell.numFmt = '#,##0';
          cell.font = {
            bold: true,
            color: { argb: c.tipo === 'recaudado' ? COLOR_EXCEL.textoRecaudado : c.tipo === 'porRecaudar' ? COLOR_EXCEL.textoPendiente : COLOR_EXCEL.textoTotalLabel },
          };
          cell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
          cell.border = bordeArriba;
        });
      }

      ws.views = [{ state: 'frozen', xSplit: FIJAS.length, ySplit: 2 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const sufijoAlcance = alcancePlan === 'inicial' ? '-30pct' : alcancePlan === 'contraentrega' ? '-70pct' : '';
      a.href = url;
      a.download = `dashboard-plan-vs-recaudo${sufijoAlcance}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [search, etapaFilter, frenteFilter, torreFilter, conMovimientos, sortBy, sortDir, mesDesde, mesHasta, vistaMeses, alcancePlan, filasResaltadas]);

  return (
    <div className={enfocado
      ? 'fixed inset-0 z-50 bg-aed-base flex flex-col gap-3 p-5 overflow-hidden'
      : 'h-full flex flex-col gap-3 p-5 overflow-hidden'}
    >
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
          onClick={toggleEnfocado}
          className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1.5"
        >
          {enfocado ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {enfocado ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </button>
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
              {etapas.map((et) => <option key={et} value={et}>{etiquetaEtapa(et)}</option>)}
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
              { value: 'esperado', label: 'Proyectado' },
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
        <div className="field">
          <label className="field-label">Plan</label>
          <div className="flex h-8 rounded-md border border-aed-border overflow-hidden">
            {[
              { value: 'ambos', label: 'Ambos (100%)' },
              { value: 'inicial', label: 'Cuota inicial (30%)' },
              { value: 'contraentrega', label: 'Contraentrega (70%)' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setAlcancePlan(value)}
                className={`px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors border-r border-aed-border last:border-r-0 ${
                  alcancePlan === value
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
          totales={totalesActivos}
          totalesColumnasFijas={totalesColumnasFijas}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
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
          className="fixed z-50 bg-white border border-aed-border rounded-md shadow-[var(--shadow-overlay)] py-1 min-w-[200px]"
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
              window.open(`/inventario?item=${menuContextual.fila.id}`, '_blank');
              setMenuContextual(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2"
          >
            <Warehouse size={13} className="text-brand" /> Ver inmueble
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
