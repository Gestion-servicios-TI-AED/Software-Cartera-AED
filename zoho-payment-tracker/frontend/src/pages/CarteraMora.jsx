import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Layers, MapPin, Building, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Briefcase, ExternalLink, Warehouse, Clock, Repeat, Check } from 'lucide-react';
import { getCarteraMora, actualizarFlagsNegocio } from '../utils/api';
import { formatCOP } from '../utils/format';
import { etiquetaEtapa } from '../utils/etapas';
import Spinner from '../components/Spinner';

// Encabezados ordenables -- 3 clics por columna: ascendente → descendente →
// sin ordenar. `key` es el campo que el backend usa para ordenar todo el
// conjunto filtrado (no solo la página visible).
const COLUMNAS = [
  { key: 'etapa', label: 'Etapa', align: 'left' },
  { key: 'frente', label: 'Frente', align: 'left' },
  { key: 'torre', label: 'Torre', align: 'left' },
  { key: 'unidad', label: 'Nomenclatura', align: 'left' },
  { key: 'referencia', label: 'Referencia', align: 'left' },
  { key: 'comprador', label: 'Comprador', align: 'left' },
  { key: 'valorInmueble', label: 'Valor apartamento', align: 'right' },
  { key: 'cuotasEnMora', label: 'Cuotas mora', align: 'right' },
  { key: 'maxDiasAtraso', label: 'Días atraso', align: 'right' },
  { key: 'montoEnMora', label: 'Valor vencido', align: 'right' },
  { key: 'pctEnMora', label: '% en mora', align: 'right' },
];

// Vista "Saldo Contraentrega vencido": a propósito mucho más simple que la
// tabla de mora de arriba -- el pedido fue algo demostrativo para que
// cartera vea rápido cuáles inmuebles tienen el plan de pagos desactualizado
// y cuánto suman, no un tablero analítico con antigüedad/porcentajes.
const COLUMNAS_CONTRAENTREGA = [
  { key: 'frente', label: 'Frente', align: 'left' },
  { key: 'torre', label: 'Torre', align: 'left' },
  { key: 'unidad', label: 'Nomenclatura', align: 'left' },
  { key: 'referencia', label: 'Referencia', align: 'left' },
  { key: 'comprador', label: 'Comprador', align: 'left' },
  { key: 'fechaSaldoContraentrega', label: 'Fecha vencida', align: 'right' },
  { key: 'montoEnMora', label: 'Valor pendiente', align: 'right' },
];

// Filtro de trámite/canje -- "Todos" (default) excluye los canjes, igual
// que en el backend: un canje no es una deuda real, no debe sumar a la
// cartera salvo que se pida verlos explícitamente.
const OPCIONES_TRAMITE = [
  { key: '', label: 'Todos' },
  { key: 'en_tramite', label: 'En trámite' },
  { key: 'no_en_tramite', label: 'No en trámite' },
  { key: 'canje', label: 'Canjes' },
];

// Misma regla que el backend (obtenerCarteraMora) -- se usa acá para saber,
// apenas se marca/desmarca un flag, si la fila debe seguir visible bajo el
// filtro de trámite actual sin tener que esperar una respuesta del servidor.
function cumpleFiltroTramite(fila, tramite) {
  if (tramite === 'canje') return !!fila.esCanje;
  if (fila.esCanje) return false; // canje nunca aparece en Todos/en_tramite/no_en_tramite
  if (tramite === 'en_tramite') return !!fila.enTramite;
  if (tramite === 'no_en_tramite') return !fila.enTramite;
  return true;
}

function formatFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// Color del chip de ranking según posición -- mismo criterio visual que el
// Top 10 morosos que ya existía en el Resumen Gerencial.
function rankColor(i) {
  if (i === 0) return 'bg-red-600 text-white';
  if (i === 1) return 'bg-red-500 text-white';
  if (i === 2) return 'bg-amber-500 text-white';
  return 'bg-slate-100 text-slate-600';
}

// Top 10 de la Cuota Inicial en mora: mismos filtros que la tabla de abajo
// (search/etapa/frente/torre/rango), pero SIEMPRE ordenado por urgencia
// (días de atraso descendente, el orden por defecto del backend) sin
// importar qué columna haya ordenado el usuario en la tabla completa --
// es un ranking ejecutivo fijo, no una vista más de la tabla.
function TopCarteraInicial({ filas }) {
  if (filas.length === 0) {
    return <p className="text-[14px] text-slate-500 px-1">Sin negocios en mora con los filtros actuales 🎉</p>;
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
      {filas.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2 py-1 border-b border-slate-50">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${rankColor(i)}`}>
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-slate-700 truncate" title={f.comprador ?? ''}>{f.comprador ?? '—'}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {f.frente}{f.torre != null ? ` Torre ${f.torre}` : ''}{f.unidad ? ` ${f.unidad}` : ''}
            </p>
          </div>
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap bg-amber-50 text-amber-700">
            {f.maxDiasAtraso}d
          </span>
          <span className="text-[13px] font-semibold text-slate-800 tabular-nums whitespace-nowrap flex-shrink-0 w-24 text-right">
            {formatCOP(f.montoEnMora)}
          </span>
        </div>
      ))}
    </div>
  );
}

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CarteraMora() {
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [rangoFilter, setRangoFilter] = useState('');
  // '' (Todos, sin canjes) | 'en_tramite' | 'no_en_tramite' | 'canje'
  const [tramiteFilter, setTramiteFilter] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [porRangoMora, setPorRangoMora] = useState([]);
  const [menuContextual, setMenuContextual] = useState(null); // { x, y, fila } | null
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState(null); // 'asc' | 'desc' | null
  const [vista, setVista] = useState('inicial'); // 'inicial' | 'contraentrega'
  const [conteos, setConteos] = useState({ inicial: 0, contraentrega: 0 });
  const [topFilas, setTopFilas] = useState([]);
  const [topAbierto, setTopAbierto] = useState(false); // escondido por defecto

  const debouncedSearch = useDebounce(search);

  // Clic en un encabezado: 1er clic ordena ascendente, 2do descendente, 3ro
  // quita el orden -- se resuelve en el backend sobre todo el conjunto
  // filtrado, no solo la página que se ve.
  const handleSort = (campo) => {
    if (sortBy !== campo) { setSortBy(campo); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortBy(null); setSortDir(null); }
  };

  const paramsActuales = useCallback((p) => ({
    search: debouncedSearch || undefined,
    etapa: etapaFilter || undefined,
    frente: frenteFilter || undefined,
    torre: torreFilter || undefined,
    rango: rangoFilter || undefined,
    vista,
    tramite: tramiteFilter || undefined,
    sortBy: sortBy || undefined,
    sortDir: sortDir || undefined,
    page: p,
    limit: 50,
  }), [debouncedSearch, etapaFilter, frenteFilter, torreFilter, rangoFilter, tramiteFilter, vista, sortBy, sortDir]);

  const aplicarResultado = (res, p) => {
    setFilas(res.data);
    setResumen(res.resumen);
    setPagination(res.pagination);
    setEtapas(res.etapasDisponibles);
    setFrentes(res.frentesDisponibles);
    setFrentesPorEtapa(res.frentesPorEtapa);
    setTorresPorFrente(res.torresPorFrente);
    setTorresPorEtapaFrente(res.torresPorEtapaFrente);
    setPorRangoMora(res.porRangoMora);
    setConteos(res.conteos);
    setPage(p);
  };

  // Contador compartido entre load() y loadSilencioso() -- como esta pantalla
  // puede tener varias peticiones en vuelo a la vez (cambiar de pestaña de
  // trámite, el refresco de fondo tras marcar un flag, etc.) y no siempre
  // responden en el mismo orden en que se pidieron, cada petición se marca
  // con un número correlativo y, al volver, solo se aplica si sigue siendo
  // la más reciente. Sin esto, una respuesta vieja y lenta (ej. de "Todos")
  // podía llegar después de una más nueva (ej. "Canjes") y pisarla con datos
  // del filtro equivocado.
  const ultimaPeticionRef = useRef(0);

  const load = useCallback(async (p) => {
    const miId = ++ultimaPeticionRef.current;
    setLoading(true);
    try {
      const res = await getCarteraMora(paramsActuales(p));
      if (miId !== ultimaPeticionRef.current) return; // ya hay algo más nuevo en curso
      aplicarResultado(res, p);
    } catch (err) {
      if (miId !== ultimaPeticionRef.current) return;
      console.error('Error cargando cartera en gestión:', err);
    } finally {
      if (miId === ultimaPeticionRef.current) setLoading(false);
    }
  }, [paramsActuales]);

  // Igual que load(), pero SIN spinner ni bloquear la tabla -- para refrescar
  // los KPIs/contadores en segundo plano después de marcar en trámite/canje,
  // cuando la fila ya se actualizó de forma optimista en pantalla y no hace
  // falta esperar al servidor para verla reflejada.
  const loadSilencioso = useCallback(async (p) => {
    const miId = ++ultimaPeticionRef.current;
    try {
      const res = await getCarteraMora(paramsActuales(p));
      if (miId !== ultimaPeticionRef.current) return;
      aplicarResultado(res, p);
    } catch (err) {
      if (miId !== ultimaPeticionRef.current) return;
      console.error('Error refrescando cartera en segundo plano:', err);
    }
  }, [paramsActuales]);

  useEffect(() => { load(1); }, [load]);

  // Top 10 de la pestaña Cuota Inicial -- se adapta a los mismos filtros de
  // arriba (búsqueda/etapa/frente/torre/rango), pero es una carga aparte de
  // `load()`: SIEMPRE en orden de urgencia (sin sortBy, el default del
  // backend), sin importar qué columna haya ordenado el usuario en la tabla
  // completa, y sin paginar (limit=10).
  useEffect(() => {
    if (vista !== 'inicial') return;
    let vigente = true;
    getCarteraMora({
      search: debouncedSearch || undefined,
      etapa: etapaFilter || undefined,
      frente: frenteFilter || undefined,
      torre: torreFilter || undefined,
      rango: rangoFilter || undefined,
      vista: 'inicial',
      tramite: tramiteFilter || undefined,
      page: 1,
      limit: 10,
    })
      .then((res) => { if (vigente) setTopFilas(res.data); })
      .catch((err) => console.error('Error cargando top 10:', err));
    return () => { vigente = false; };
  }, [debouncedSearch, etapaFilter, frenteFilter, torreFilter, rangoFilter, tramiteFilter, vista]);

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

  const abrirMenuContextual = (e, fila) => {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  };

  // Marca/quita "en trámite" o "canje" desde el clic derecho -- actualización
  // optimista: la fila cambia (o desaparece, si deja de cumplir el filtro de
  // trámite actual) al toque, sin spinner ni recargar toda la tabla. El PATCH
  // real y el refresco de los KPIs/contadores pasan de fondo. Si algo falla,
  // recién ahí se recarga de verdad para no quedar en un estado inconsistente.
  const handleToggleFlag = async (fila, campo) => {
    setMenuContextual(null);
    if (!fila.negocioId) return;
    const nuevoValor = !fila[campo];
    const filaActualizada = { ...fila, [campo]: nuevoValor };
    const siguesCumpliendo = cumpleFiltroTramite(filaActualizada, tramiteFilter);

    setFilas((prev) => siguesCumpliendo
      ? prev.map((f) => (f.id === fila.id ? filaActualizada : f))
      : prev.filter((f) => f.id !== fila.id));
    if (!siguesCumpliendo) {
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    }

    try {
      await actualizarFlagsNegocio(fila.negocioId, { [campo]: nuevoValor });
      loadSilencioso(page);
    } catch (err) {
      console.error('Error actualizando el negocio:', err);
      load(page); // revertir a lo que de verdad hay en el servidor
      if (err.response?.status === 404) {
        // El negocioId que tenía esta fila en pantalla ya no existe -- suele
        // pasar si se cargó un Excel de fiducia nuevo (recrea los negocios
        // con otro id) mientras esta página seguía abierta desde antes.
        window.alert('No se pudo actualizar: esta fila quedó desactualizada (probablemente se recargó la cartera desde Excel). Actualiza la página (F5) e intenta de nuevo.');
      } else {
        window.alert(`No se pudo actualizar el negocio: ${err.response?.data?.error || err.message}`);
      }
    }
  };

  // Mismo criterio de cascada Etapa → Frente → Torre que ReportePlanRecaudo.
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
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter || rangoFilter || tramiteFilter;
  const clearFilters = () => { setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setRangoFilter(''); setTramiteFilter(''); };

  return (
    <div className="min-h-screen flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <h1 className="text-[19px] font-bold text-slate-800 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          Cartera en Gestión
        </h1>
        <span className="text-[13px] text-slate-500">
          {vista === 'contraentrega'
            ? 'Inmuebles cuyo Saldo Contraentrega ya venció — puede reflejar que aún no se ha escriturado, no necesariamente mora activa de cobranza.'
            : 'Negocios con cuotas atrasadas de la Cuota Inicial — no incluye Saldo Contraentrega, calculado en vivo contra los movimientos reales.'}
        </span>
      </div>

      <div className="flex gap-1 flex-shrink-0">
        {[
          { key: 'inicial', label: 'Cuota Inicial (mora activa)' },
          { key: 'contraentrega', label: 'Saldo Contraentrega vencido' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setVista(t.key); setRangoFilter(''); }}
            className={`text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
              vista === t.key
                ? 'bg-brand border-brand text-white'
                : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
            }`}
          >
            {t.label}
            <span
              className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                vista === t.key ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
              }`}
            >
              {conteos[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {resumen && vista === 'contraentrega' && (
        <div className="card p-4 flex-shrink-0 flex items-center gap-4 bg-red-50 border-red-200">
          <AlertTriangle size={28} className="text-red-500 flex-shrink-0" />
          <p className="text-[15px] text-slate-700">
            <b className="text-[20px] text-red-600 tabular-nums">{resumen.negociosEnMora}</b> inmuebles con Saldo Contraentrega vencido —
            suman <b className="text-[20px] text-red-600 tabular-nums">{formatCOP(resumen.totalMontoEnMora)}</b> pendientes.
            Hay que actualizar el plan de pagos de cada uno en Zoho.
          </p>
        </div>
      )}

      {resumen && vista !== 'contraentrega' && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 flex-shrink-0">
          <div className="card p-4">
            <p className="section-label mb-1">Negocios en mora</p>
            <p className="text-[28px] font-bold text-slate-800 tabular-nums">{resumen.negociosEnMora}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Cuotas en mora</p>
            <p className="text-[28px] font-bold text-amber-600 tabular-nums">{resumen.totalCuotasEnMora}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Valor vencido</p>
            <p className="text-[20px] font-bold text-red-600 tabular-nums leading-tight mt-1">{formatCOP(resumen.totalMontoEnMora)}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">% vencido sobre lo esperado</p>
            <p className="text-[28px] font-bold text-red-600 tabular-nums">
              {resumen.pctMoraPortafolio != null ? `${resumen.pctMoraPortafolio.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[12px] text-slate-400 mt-0.5">de {formatCOP(resumen.totalEsperadoAFecha)} que ya debía estar recaudado</p>
          </div>
        </div>
      )}

      {vista !== 'contraentrega' && porRangoMora.length > 0 && (
        <div className="card p-3 flex-shrink-0">
          <p className="section-label mb-2 px-1">Antigüedad de la mora — mismo criterio que las hojas de la fiduciaria</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
            {porRangoMora.map((r) => (
              <button
                key={r.rango}
                onClick={() => setRangoFilter((prev) => (prev === r.rango ? '' : r.rango))}
                className={`text-left px-3 py-2 rounded-md border transition-colors ${
                  rangoFilter === r.rango
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-aed-border hover:bg-aed-base'
                }`}
              >
                <p className="text-[12px] text-slate-500">{r.label}</p>
                <p className="text-[16px] font-bold text-slate-800 tabular-nums">{r.count}</p>
                <p className="text-[12px] font-medium text-red-600 tabular-nums">{formatCOP(r.monto)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2.5 flex-shrink-0">
        <div className="field">
          <label className="field-label"><Search size={13} className="text-brand" />Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Torre, comprador o referencia…"
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
        {hasFilters && (
          <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-8">
            <X size={11} /> Limpiar filtros
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
        <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-[0.4px] mr-0.5">Trámite / Canje</span>
        {OPCIONES_TRAMITE.map((o) => (
          <button
            key={o.key}
            onClick={() => setTramiteFilter(o.key)}
            className={`text-[13px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              tramiteFilter === o.key
                ? 'bg-brand border-brand text-white'
                : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {vista === 'inicial' && (
        <div className="card p-3 flex-shrink-0">
          <button
            onClick={() => setTopAbierto((v) => !v)}
            className="w-full flex items-center justify-between px-1 py-0.5"
          >
            <p className="section-label">Top 10 — prioridad de gestión (se adapta a los filtros de arriba)</p>
            {topAbierto ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {topAbierto && (
            <div className="mt-1.5">
              <TopCarteraInicial filas={topFilas} />
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden flex flex-col flex-shrink-0">
        <div className="overflow-x-auto">
          <table className="text-[14px] w-full">
            <thead>
              <tr className="border-b border-aed-border bg-aed-base">
                {(vista === 'contraentrega' ? COLUMNAS_CONTRAENTREGA : COLUMNAS).map((col) => {
                  const activa = sortBy === col.key;
                  const Icono = activa ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`section-label px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${activa ? 'text-brand' : ''}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {col.label}
                        <Icono size={12} className={activa ? 'text-brand' : 'text-slate-300'} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={vista === 'contraentrega' ? 7 : 11}><Spinner label="Cargando cartera en gestión…" /></td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={vista === 'contraentrega' ? 7 : 11} className="px-4 py-12 text-center text-slate-400">Sin resultados.</td></tr>
              ) : vista === 'contraentrega' ? (
                filas.map((f) => (
                  <tr
                    key={f.id}
                    onContextMenu={(e) => abrirMenuContextual(e, f)}
                    className="border-b border-aed-border hover:bg-slate-50 cursor-context-menu"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{f.frente ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.torre != null ? `Torre ${f.torre}` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">{f.unidad ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-slate-500">{f.referencia ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" title={f.comprador ?? ''}>{f.comprador ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-amber-600">{formatFechaCorta(f.fechaSaldoContraentrega)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-red-600">{formatCOP(f.montoEnMora)}</td>
                  </tr>
                ))
              ) : (
                filas.map((f) => (
                  <tr
                    key={f.id}
                    onContextMenu={(e) => abrirMenuContextual(e, f)}
                    className="border-b border-aed-border hover:bg-slate-50 cursor-context-menu"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{f.etapa ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.frente ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.torre != null ? `Torre ${f.torre}` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">{f.unidad ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-slate-500">{f.referencia ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" title={f.comprador ?? ''}>{f.comprador ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px]">
                      {f.valorInmueble != null ? formatCOP(f.valorInmueble) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px]">{f.cuotasEnMora}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-amber-600">{f.maxDiasAtraso}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-red-600">{formatCOP(f.montoEnMora)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-red-600">
                      {f.pctEnMora != null ? `${f.pctEnMora.toFixed(1)}%` : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between flex-shrink-0">
            <p className="text-[14px] text-slate-400">
              {pagination.total} negocios · Página {pagination.page} de {pagination.totalPages}
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
          <div className="h-px bg-aed-border my-1" />
          <button
            onClick={() => handleToggleFlag(menuContextual.fila, 'enTramite')}
            disabled={!menuContextual.fila.negocioId}
            title={menuContextual.fila.negocioId ? undefined : 'No hay negocio vinculado a este inmueble'}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Clock size={13} className="text-amber-500" />
            {menuContextual.fila.enTramite ? 'Quitar en trámite' : 'Marcar en trámite'}
            {menuContextual.fila.enTramite && <Check size={13} className="text-emerald-600 ml-auto" />}
          </button>
          <button
            onClick={() => handleToggleFlag(menuContextual.fila, 'esCanje')}
            disabled={!menuContextual.fila.negocioId}
            title={menuContextual.fila.negocioId ? undefined : 'No hay negocio vinculado a este inmueble'}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Repeat size={13} className="text-violet-500" />
            {menuContextual.fila.esCanje ? 'Quitar canje' : 'Marcar canje'}
            {menuContextual.fila.esCanje && <Check size={13} className="text-emerald-600 ml-auto" />}
          </button>
        </div>
      )}
    </div>
  );
}
