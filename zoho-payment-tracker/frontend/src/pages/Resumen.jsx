import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, CheckCircle, XCircle, Layers, MapPin, Building, X, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
  AlertTriangle, Landmark, Warehouse, CalendarClock, BadgeCheck, PieChart, Wallet,
  Maximize2, Minimize2,
} from 'lucide-react';
import HelpTip from '../components/HelpTip';
import KpiCard from '../components/KpiCard';
import PlanVsRecaudoLineChart from '../components/stats/PlanVsRecaudoLineChart';
import EtapaRecaudoBars from '../components/stats/EtapaRecaudoBars';
import ConsolidadoCarteraEtapa from '../components/stats/ConsolidadoCarteraEtapa';
import {
  getStatsResumen,
  getStatsSync,
  getDashboardRecaudo,
  getResumenPorEtapa,
  getResumenEtapasMeses,
} from '../utils/api';
import { formatCOP, formatDateTime } from '../utils/format';
import { etiquetaEtapa } from '../utils/etapas';
import { useModoEnfocado } from '../hooks/useModoEnfocado';

// Filtro de alcance del plan: Cuota Inicial (~30%, todo el plan MENOS Saldo
// Contraentrega), Saldo Contraentrega (~70%, la última cuota), o Ambos (el
// plan completo, comportamiento de siempre).
const FILTROS_PORCENTAJE = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'inicial', label: 'Cuota inicial (30%)' },
  { key: 'contraentrega', label: 'Saldo contraentrega (70%)' },
];

// Ventanas del filtro de tendencia mensual -- trailing window de N meses
// anclada al mes actual (no al último mes de la serie, que puede ser futuro
// por cuotas del plan de pagos todavía sin vencer).
const RANGOS_TENDENCIA = [
  { key: 'ultimoMes', label: 'Último mes', meses: 1 },
  { key: 'ultimoSemestre', label: 'Último semestre', meses: 6 },
  { key: 'ultimoAnio', label: 'Último año', meses: 12 },
  { key: 'ultimos5Anios', label: 'Últimos 5 años', meses: 60 },
  { key: 'total', label: 'Totalidad', meses: null },
];

function mesKeyDeHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function diaKeyDeHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Retrocede `n` días desde `diaKey` ("YYYY-MM-DD") -- vía Date normal (a
// diferencia de restarMeses, un delta en días no tiene el lío de "mes
// absoluto" porque Date ya maneja bien el desborde de días entre meses.
function restarDias(diaKey, n) {
  const [anio, mes, dia] = diaKey.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Último día calendario de un mes ("YYYY-MM" -> "YYYY-MM-DD") -- día 0 del
// mes siguiente es el último día de este mes en JS Date.
function finDeMes(mesKey) {
  const [anio, mes] = mesKey.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Lista de meses ("YYYY-MM") entre desdeMes y hastaMes, ambos inclusive.
function mesesEntre(desdeMes, hastaMes) {
  const [dy, dm] = desdeMes.split('-').map(Number);
  const [hy, hm] = hastaMes.split('-').map(Number);
  const out = [];
  let idx = dy * 12 + (dm - 1);
  const idxFin = hy * 12 + (hm - 1);
  while (idx <= idxFin) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    idx += 1;
  }
  return out;
}

// Retrocede `n` meses desde `mesKey` ("YYYY-MM"), operando en índice de mes
// absoluto para no depender de Date (evita líos de zona horaria en el borde de mes).
function restarMeses(mesKey, n) {
  const [anio, mes] = mesKey.split('-').map(Number);
  const totalMeses = anio * 12 + (mes - 1) - n;
  const anioResultado = Math.floor(totalMeses / 12);
  const mesResultado = (totalMeses % 12) + 1;
  return `${anioResultado}-${String(mesResultado).padStart(2, '0')}`;
}

export default function Resumen() {
  const [resumen, setResumen] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [planRecaudo, setPlanRecaudo] = useState(null);
  // Consolidado de Cartera por Etapa -- navegable mes a mes como las hojas
  // del Excel. `mesesDisponibles` trae los meses ya cerrados (con foto
  // guardada) + el mes actual en vivo, siempre al final; `mesSeleccionado`
  // es la clave "YYYY-MM" del que se está mostrando.
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [resumenEtapas, setResumenEtapas] = useState(null);
  const [rangoTendencia, setRangoTendencia] = useState('total');
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [filtroPorcentaje, setFiltroPorcentaje] = useState('ambos');
  // Escondida por defecto -- se puede desplegar con un clic.
  const [etapaAbierta, setEtapaAbierta] = useState(false);
  // Modo enfocado: la gráfica de tendencia pasa a cubrir toda la pantalla.
  const [enfocado, toggleEnfocado] = useModoEnfocado();
  // Alto real de la ventana -- para calcular en píxeles (no en %, que con
  // Recharts anidado en flexbox se rompe fácil) cuánto le queda disponible al
  // gráfico en pantalla completa. En vez de adivinar cuánto ocupa el
  // encabezado (título/rango/filtros) con un número fijo, se MIDE de verdad
  // con un ref -- un valor fijo quedaba muy conservador en monitores
  // normales (terminaba dando prácticamente el mismo alto que el modo
  // normal, sin ninguna ganancia visible).
  const [altoVentana, setAltoVentana] = useState(() => window.innerHeight);
  const headerTendenciaRef = useRef(null);
  const [altoHeaderTendencia, setAltoHeaderTendencia] = useState(140);
  useEffect(() => {
    const onResize = () => setAltoVentana(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    const el = headerTendenciaRef.current;
    if (!el) return undefined;
    const medir = () => setAltoHeaderTendencia(el.getBoundingClientRect().height);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enfocado]);
  // 40px de margen de seguridad (padding inferior del contenedor + aire).
  const alturaGrafica = enfocado ? Math.max(400, altoVentana - altoHeaderTendencia - 40) : 640;

  // Filtro Etapa → Frente → Torre de la tendencia mensual -- mismo patrón en
  // cascada que ReportePlanRecaudo/CarteraMora.
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [etapasDisponibles, setEtapasDisponibles] = useState([]);
  const [frentesDisponibles, setFrentesDisponibles] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});

  useEffect(() => {
    Promise.allSettled([
      getStatsResumen().then(setResumen),
      getStatsSync(5).then(setSyncLogs),
      getResumenEtapasMeses().then((meses) => {
        setMesesDisponibles(meses);
        const actual = meses.find((m) => m.enVivo) ?? meses[meses.length - 1];
        if (actual) setMesSeleccionado(actual.mes);
      }),
    ]);
  }, []);

  // Se recarga cada vez que cambia el mes seleccionado en el navegador de
  // slides del Consolidado de Cartera por Etapa.
  useEffect(() => {
    if (!mesSeleccionado) return;
    setResumenEtapas(null);
    getResumenPorEtapa(mesSeleccionado).then(setResumenEtapas);
  }, [mesSeleccionado]);

  const idxMesSeleccionado = mesesDisponibles.findIndex((m) => m.mes === mesSeleccionado);
  const irMesAnterior = () => {
    if (idxMesSeleccionado > 0) setMesSeleccionado(mesesDisponibles[idxMesSeleccionado - 1].mes);
  };
  const irMesSiguiente = () => {
    if (idxMesSeleccionado >= 0 && idxMesSeleccionado < mesesDisponibles.length - 1) {
      setMesSeleccionado(mesesDisponibles[idxMesSeleccionado + 1].mes);
    }
  };

  // planRecaudo sí depende del filtro Etapa/Frente/Torre -- se recarga cada
  // vez que cambian (el backend recalcula meses/totales sobre el subconjunto
  // filtrado). limit=1: solo interesan los agregados (meses/totales/
  // totalesInicial/totalesContraentrega/totalesPorEtapa), no las filas.
  useEffect(() => {
    let vigente = true;
    getDashboardRecaudo({
      etapa: etapaFilter || undefined,
      frente: frenteFilter || undefined,
      torre: torreFilter || undefined,
      page: 1,
      limit: 1,
    }).then((res) => {
      if (!vigente) return;
      setPlanRecaudo(res);
      setEtapasDisponibles(res.etapasDisponibles ?? []);
      setFrentesDisponibles(res.frentesDisponibles ?? []);
      setFrentesPorEtapa(res.frentesPorEtapa ?? {});
      setTorresPorFrente(res.torresPorFrente ?? {});
      setTorresPorEtapaFrente(res.torresPorEtapaFrente ?? {});
    });
    return () => { vigente = false; };
  }, [etapaFilter, frenteFilter, torreFilter]);

  // Mismo criterio de cascada Etapa → Frente → Torre que ReportePlanRecaudo/CarteraMora.
  const handleEtapaChange = useCallback((value) => {
    setEtapaFilter(value);
    setFrenteFilter((prevFrente) => {
      if (value && prevFrente && !(frentesPorEtapa[value] || []).includes(prevFrente)) {
        setTorreFilter('');
        return '';
      }
      return prevFrente;
    });
  }, [frentesPorEtapa]);

  const handleFrenteChange = useCallback((value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  }, []);

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentesDisponibles;
  const torreOptions = frenteFilter
    ? (etapaFilter ? (torresPorEtapaFrente[`${etapaFilter}||${frenteFilter}`] || []) : (torresPorFrente[frenteFilter] || []))
    : [];
  const hayFiltrosUbicacion = etapaFilter || frenteFilter || torreFilter;
  const limpiarFiltrosUbicacion = () => { setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); };

  const lastSync = syncLogs[0];
  const syncOk = syncLogs.filter((s) => s.status === 'success').length;
  const syncErr = syncLogs.filter((s) => s.status === 'error').length;

  // Años calendario con datos, para el selector "Filtrar por año" -- solo
  // ofrece años que realmente aparecen en la serie (plan de pagos o recaudo).
  const aniosDisponibles = useMemo(() => {
    const anios = new Set((planRecaudo?.meses ?? []).map((m) => Number(m.slice(0, 4))));
    return [...anios].sort((a, b) => a - b);
  }, [planRecaudo]);

  // "Último mes" en granularidad mensual queda con un solo punto para
  // graficar (el mes en curso) -- para ese rango en particular se usa la
  // serie diaria (planRecaudo.dias/totalesDia*) en vez de la mensual.
  // "Último semestre" usa quincenas (agrupando esa misma serie diaria de a
  // 15 días) -- con granularidad mensual solo daba 6 puntos, muy poco
  // detalle para medio año.
  const granularidadTendencia = rangoTendencia === 'ultimoMes' ? 'dia'
    : rangoTendencia === 'ultimoSemestre' ? 'quincena'
    : 'mes';

  const mesesTendencia = useMemo(() => {
    const meses = planRecaudo?.meses ?? [];
    if (rangoTendencia === 'anio') {
      return meses.filter((m) => m.startsWith(`${anioSeleccionado}-`));
    }
    const opt = RANGOS_TENDENCIA.find((r) => r.key === rangoTendencia);
    if (!opt?.meses) return meses;
    // Ventana FIJA que termina en el mes actual -- rangos "trailing" puros:
    // no deben pasarse de hoy aunque el plan de pagos tenga cuotas futuras
    // más allá de esta ventana.
    const desde = restarMeses(mesKeyDeHoy(), opt.meses - 1);
    const hasta = mesKeyDeHoy();
    return meses.filter((m) => m >= desde && m <= hasta);
  }, [planRecaudo, rangoTendencia, anioSeleccionado]);

  const diasTendencia = useMemo(() => {
    if (granularidadTendencia !== 'dia') return [];
    const dias = planRecaudo?.dias ?? [];
    const hasta = diaKeyDeHoy();
    const desde = restarDias(hasta, 29); // últimos 30 días, terminando hoy
    return dias.filter((d) => d >= desde && d <= hasta);
  }, [planRecaudo, granularidadTendencia]);

  // Quincenas CALENDARIO (1 al 15, 16 a fin de mes) de los últimos 6 meses
  // -- no una ventana rodante de 15 días, sino los cortes de quincena reales
  // (1 y 15/16 de cada mes), terminando hoy (sin quincenas futuras).
  const quincenas = useMemo(() => {
    if (granularidadTendencia !== 'quincena') return [];
    const hasta = diaKeyDeHoy();
    const desdeMes = restarMeses(mesKeyDeHoy(), 5);
    const buckets = [];
    for (const m of mesesEntre(desdeMes, mesKeyDeHoy())) {
      const q1desde = `${m}-01`;
      const q1hastaCalendario = `${m}-15`;
      if (q1desde <= hasta) {
        buckets.push({ key: q1desde, desde: q1desde, hasta: q1hastaCalendario < hasta ? q1hastaCalendario : hasta });
      }
      const q2desde = `${m}-16`;
      const q2hastaCalendario = finDeMes(m);
      if (q2desde <= hasta) {
        buckets.push({ key: q2desde, desde: q2desde, hasta: q2hastaCalendario < hasta ? q2hastaCalendario : hasta });
      }
    }
    return buckets;
  }, [granularidadTendencia]);

  const totalesQuincena = useMemo(() => {
    if (granularidadTendencia !== 'quincena' || quincenas.length === 0) return {};
    const fuente = filtroPorcentaje === 'inicial' ? planRecaudo?.totalesDiaInicial
      : filtroPorcentaje === 'contraentrega' ? planRecaudo?.totalesDiaContraentrega
      : planRecaudo?.totalesDia;
    const dias = planRecaudo?.dias ?? [];
    const out = {};
    for (const q of quincenas) {
      let esperado = 0;
      let recaudado = 0;
      let porRecaudar = 0;
      for (const d of dias) {
        if (d >= q.desde && d <= q.hasta) {
          esperado += fuente?.[d]?.esperado ?? 0;
          recaudado += fuente?.[d]?.recaudado ?? 0;
          porRecaudar += fuente?.[d]?.porRecaudar ?? 0;
        }
      }
      out[q.key] = { esperado, recaudado, porRecaudar };
    }
    return out;
  }, [planRecaudo, quincenas, filtroPorcentaje, granularidadTendencia]);

  const puntosTendencia = granularidadTendencia === 'dia' ? diasTendencia
    : granularidadTendencia === 'quincena' ? quincenas.map((q) => q.key)
    : mesesTendencia;

  const totalesElegidos = useMemo(() => {
    if (granularidadTendencia === 'quincena') return totalesQuincena;
    if (granularidadTendencia === 'dia') {
      if (filtroPorcentaje === 'inicial') return planRecaudo?.totalesDiaInicial ?? {};
      if (filtroPorcentaje === 'contraentrega') return planRecaudo?.totalesDiaContraentrega ?? {};
      return planRecaudo?.totalesDia ?? {};
    }
    if (filtroPorcentaje === 'inicial') return planRecaudo?.totalesInicial ?? {};
    if (filtroPorcentaje === 'contraentrega') return planRecaudo?.totalesContraentrega ?? {};
    return planRecaudo?.totales ?? {};
  }, [planRecaudo, filtroPorcentaje, granularidadTendencia, totalesQuincena]);

  // KPIs de Recaudo (30%/70%) -- se recalculan sumando SOLO la ventana de
  // tiempo seleccionada arriba (mismo rango que ya usa la gráfica de
  // tendencia, sumando su serie diaria/mensual en vez de mostrar el
  // acumulado de toda la vida del portafolio). El resto de KPIs (mora,
  // disponibles, vendidos) son una foto del estado actual -- no una serie de
  // tiempo -- así que se calculan aparte, sin filtro de ventana.
  const kpisRecaudo = useMemo(() => {
    const sumarVentana = (fuenteDia, fuenteMes) => {
      let esperado = 0, recaudado = 0;
      if (granularidadTendencia === 'mes') {
        for (const m of mesesTendencia) {
          const t = fuenteMes?.[m];
          esperado += t?.esperado ?? 0;
          recaudado += t?.recaudado ?? 0;
        }
      } else {
        const dias = granularidadTendencia === 'dia'
          ? diasTendencia
          : (quincenas.length > 0
              ? (planRecaudo?.dias ?? []).filter((d) => d >= quincenas[0].desde && d <= quincenas[quincenas.length - 1].hasta)
              : []);
        for (const d of dias) {
          const t = fuenteDia?.[d];
          esperado += t?.esperado ?? 0;
          recaudado += t?.recaudado ?? 0;
        }
      }
      return { esperado, recaudado };
    };

    if (!planRecaudo) return null;
    const inicial = sumarVentana(planRecaudo.totalesDiaInicial, planRecaudo.totalesInicial);
    const contraentrega = sumarVentana(planRecaudo.totalesDiaContraentrega, planRecaudo.totalesContraentrega);
    return {
      totalidad30: inicial.esperado,
      recaudado30: inicial.recaudado,
      porRecaudar30: Math.max(0, inicial.esperado - inicial.recaudado),
      totalidad70: contraentrega.esperado,
      recaudado70: contraentrega.recaudado,
      pendienteContraentrega: Math.max(0, contraentrega.esperado - contraentrega.recaudado),
    };
  }, [planRecaudo, granularidadTendencia, mesesTendencia, diasTendencia, quincenas]);

  // KPIs de estado actual -- foto de hoy, sin filtro de tiempo (mora,
  // disponibles, vendidos no son una serie que tenga sentido acumular por
  // ventana).
  const kpisActuales = useMemo(() => {
    const t = planRecaudo?.totalesColumnasFijas;
    if (!t) return null;
    return {
      valorDisponible: t.valorDisponible,
      cantidadDisponible: t.cantidadDisponible,
      cuotasEnMoraInicial: t.cuotasEnMoraInicial,
      montoEnMoraInicial: t.montoEnMoraInicial,
      valorVendidos: t.valorVendidos,
      cantidadVendidos: t.cantidadVendidos,
    };
  }, [planRecaudo]);

  // Etiqueta legible de la ventana de tiempo seleccionada, para dejar claro
  // en los encabezados de KPI a qué periodo corresponden.
  const labelVentana = rangoTendencia === 'anio'
    ? `Año ${anioSeleccionado}`
    : (RANGOS_TENDENCIA.find((r) => r.key === rangoTendencia)?.label ?? '');

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[18px] font-bold text-slate-800">Resumen Gerencial</h1>
        <span className="text-[14px] text-slate-500">Cartera de cobranza</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Filtros globales Etapa/Frente/Torre -- afectan tanto los KPIs de
            abajo como la tendencia mensual, porque ambos salen del mismo
            getDashboardRecaudo(). Al vivir arriba de todo queda claro que
            son globales, no solo del gráfico. */}
        <div className="card p-3 flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Filtros</span>
          {etapasDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-[#7c3aed] flex-shrink-0" />
              <span className="text-[12px] font-semibold text-slate-500 whitespace-nowrap">Etapa</span>
              <select value={etapaFilter} onChange={(e) => handleEtapaChange(e.target.value)} className="input text-[12px] h-7 py-0 pr-2 leading-none">
                <option value="">Todas las etapas</option>
                {etapasDisponibles.map((et) => <option key={et} value={et}>{etiquetaEtapa(et)}</option>)}
              </select>
            </div>
          )}
          {frentesDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <MapPin size={12} className="text-[#7c3aed] flex-shrink-0" />
              <span className="text-[12px] font-semibold text-slate-500 whitespace-nowrap">Frente</span>
              <select value={frenteFilter} onChange={(e) => handleFrenteChange(e.target.value)} className="input text-[12px] h-7 py-0 pr-2 leading-none">
                <option value="">Todos los frentes</option>
                {frenteOptions.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
              </select>
            </div>
          )}
          {frenteFilter && torreOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building size={12} className="text-[#7c3aed] flex-shrink-0" />
              <span className="text-[12px] font-semibold text-slate-500 whitespace-nowrap">Torre</span>
              <select value={torreFilter} onChange={(e) => setTorreFilter(e.target.value)} className="input text-[12px] h-7 py-0 pr-2 leading-none">
                <option value="">Todas las torres</option>
                {torreOptions.map((tr) => <option key={tr} value={tr}>Torre {tr}</option>)}
              </select>
            </div>
          )}
          {hayFiltrosUbicacion && (
            <button onClick={limpiarFiltrosUbicacion} className="text-[12px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-7">
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {/* Filtro de tiempo (Último mes, Último año…) -- vive arriba, junto a
            los demás filtros globales, porque afecta tanto los KPIs de
            Recaudo de abajo como la gráfica de tendencia más adelante. */}
        <div className="card p-3 flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Periodo</span>
          <div className="flex items-center gap-1 flex-wrap">
            {RANGOS_TENDENCIA.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangoTendencia(r.key)}
                className={`text-[12px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                  rangoTendencia === r.key
                    ? 'bg-brand border-brand text-white'
                    : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
                }`}
              >
                {r.label}
              </button>
            ))}
            {aniosDisponibles.length > 0 && (
              <select
                value={rangoTendencia === 'anio' ? anioSeleccionado : ''}
                onChange={(e) => {
                  setAnioSeleccionado(Number(e.target.value));
                  setRangoTendencia('anio');
                }}
                className={`text-[12px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                  rangoTendencia === 'anio'
                    ? 'bg-brand border-brand text-white'
                    : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
                }`}
              >
                <option value="" disabled>Filtrar por año…</option>
                {aniosDisponibles.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* KPIs gerenciales -- Cuota Inicial (30%) y Saldo Contraentrega
            (70%) se recalculan según el filtro Etapa/Frente/Torre Y el
            periodo de tiempo de arriba. Mora/Disponibles/Vendidos son una
            foto del estado actual -- no cambian con el periodo, se marcan
            "(actual)" para que quede claro que no aplican ese filtro. */}
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Cuota inicial (30%) — {labelVentana}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={PieChart}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Totalidad del 30%"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.totalidad30) : '—'}
                hint={`Total esperado de la Cuota Inicial según el plan de pagos, dentro del periodo seleccionado (${labelVentana}).`}
              />
              <KpiCard
                icon={Wallet}
                iconBg="#f0fdf4"
                iconColor="#16a34a"
                label="Recaudado del 30%"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.recaudado30) : '—'}
                hint={`Lo realmente recaudado (movimientos) hacia la Cuota Inicial, dentro del periodo seleccionado (${labelVentana}).`}
              />
              <KpiCard
                icon={AlertTriangle}
                iconBg="#fef2f2"
                iconColor="#dc2626"
                label="Por recaudar (30%)"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.porRecaudar30) : '—'}
                hint={`Cuota Inicial esperada según el plan de pagos, menos lo recaudado real, dentro del periodo seleccionado (${labelVentana}).`}
              />
              <KpiCard
                icon={CalendarClock}
                iconBg="#fffbeb"
                iconColor="#d97706"
                label="Cuotas vencidas (30%) (actual)"
                value={kpisActuales ? kpisActuales.cuotasEnMoraInicial : '—'}
                sub={kpisActuales ? formatCOP(kpisActuales.montoEnMoraInicial) : undefined}
                hint="Cuotas atrasadas SOLO de la Cuota Inicial, a hoy (no incluye Saldo Contraentrega, y no cambia con el filtro de periodo) -- mismo criterio que Cartera en Gestión."
              />
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Saldo contraentrega (70%) — {labelVentana}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KpiCard
                icon={PieChart}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Totalidad del 70%"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.totalidad70) : '—'}
                hint={`Total esperado del Saldo Contraentrega según conciliación, dentro del periodo seleccionado (${labelVentana}).`}
              />
              <KpiCard
                icon={Wallet}
                iconBg="#f0fdf4"
                iconColor="#16a34a"
                label="Saldo recaudado contraentrega (70%)"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.recaudado70) : '—'}
                hint={`Lo realmente recaudado (movimientos) hacia el Saldo Contraentrega, sin contar excedentes/saldo a favor, dentro del periodo seleccionado (${labelVentana}).`}
              />
              <KpiCard
                icon={Landmark}
                iconBg="#faf5ff"
                iconColor="#7c3aed"
                label="Saldo pendiente contraentrega (70%)"
                value={kpisRecaudo ? formatCOP(kpisRecaudo.pendienteContraentrega) : '—'}
                hint={`Saldo Contraentrega (70%) según conciliación, menos lo recaudado real, dentro del periodo seleccionado (${labelVentana}).`}
              />
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Inventario y ventas (actual)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                icon={Warehouse}
                iconBg="#eff6ff"
                iconColor="#3b82f6"
                label="Inmuebles disponibles (actual)"
                value={kpisActuales ? formatCOP(kpisActuales.valorDisponible) : '—'}
                sub={kpisActuales ? `${kpisActuales.cantidadDisponible} unidades` : undefined}
                hint="Valor y cantidad de los inmuebles sin negocio vinculado o con estado Libre, a hoy -- no cambia con el filtro de periodo."
              />
              <KpiCard
                icon={BadgeCheck}
                iconBg="#f0fdf4"
                iconColor="#16a34a"
                label="Inmuebles vendidos (actual)"
                value={kpisActuales ? formatCOP(kpisActuales.valorVendidos) : '—'}
                sub={kpisActuales ? `${kpisActuales.cantidadVendidos} unidades` : undefined}
                hint="Valor y cantidad de los negocios con Estado = VENDIDO, a hoy -- no cambia con el filtro de periodo."
              />
            </div>
          </div>
        </div>

        {/* Tendencia: plan de pagos vs. recaudo real, mes a mes */}
        <div className={enfocado
          ? 'fixed inset-0 z-50 bg-aed-base p-5 overflow-auto'
          : 'card p-4'}
        >
          <div className={enfocado ? 'card p-4' : ''}>
          <div ref={headerTendenciaRef}>
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-700 flex items-center gap-1.5">
              Plan de pagos vs. Recaudo — tendencia mensual
              <HelpTip text="Compara, mes a mes y para todo el portafolio, cuánto se esperaba recaudar según el plan de pagos de cada negocio contra lo efectivamente recaudado. Incluye meses futuros del plan, por eso lo recaudado cae por debajo de lo esperado en los meses que aún no vencen." />
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {resumen && (
                <span className="text-[13px] text-slate-500 inline-flex items-center gap-1 flex-wrap">
                  Recaudado en el año
                  <b className="text-slate-600">{formatCOP(resumen.recaudoAnio)}</b>
                  <span className="mx-1">·</span>
                  Separaciones este mes
                  <b className="text-slate-600">{resumen.separacionesMes}</b>
                </span>
              )}
              <button
                onClick={toggleEnfocado}
                className="btn-secondary px-2.5 py-1 text-[13px] flex items-center gap-1.5"
              >
                {enfocado ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                {enfocado ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap flex-shrink-0">
            <span className="text-[12px] text-slate-400">Periodo:</span>
            <span className="text-[12px] font-semibold text-brand-strong bg-brand-tint px-2 py-0.5 rounded-md">
              {labelVentana}
            </span>
            <span className="text-[11px] text-slate-400 italic">— cambiar arriba, en "Periodo"</span>
          </div>

          <div className="flex items-end gap-2.5 flex-wrap mb-3 flex-shrink-0">
            <div className="flex gap-1">
              {FILTROS_PORCENTAJE.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFiltroPorcentaje(f.key)}
                  className={`text-[12px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                    filtroPorcentaje === f.key
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          </div>

          <PlanVsRecaudoLineChart
            meses={puntosTendencia}
            totales={totalesElegidos}
            granularidad={granularidadTendencia}
            altura={alturaGrafica}
          />
          </div>
        </div>

        {/* Consolidado de Cartera por Etapa -- réplica en vivo del Excel manual. Siempre visible, sin colapsar. */}
        <div className="card p-4">
          <h2 className="text-[15px] font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
            Consolidado de Cartera por Etapa
            <HelpTip text="Réplica en vivo del Excel 'CONSOLIDADO DE CARTERA' que arma Gerencia cada mes. Algunas columnas quedan marcadas Pendiente porque su criterio exacto no está confirmado todavía." />
          </h2>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={irMesAnterior}
              disabled={idxMesSeleccionado <= 0}
              className="p-3 rounded-full border-2 border-brand bg-brand-tint hover:bg-brand-soft disabled:opacity-30 disabled:cursor-not-allowed disabled:border-aed-border disabled:bg-transparent transition-colors shadow-sm"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={26} strokeWidth={2.75} className="text-brand" />
            </button>
            <span className="text-[16px] font-semibold text-slate-700 min-w-[190px] text-center">
              {resumenEtapas?.etiqueta ?? '—'}
              {resumenEtapas?.enVivo && (
                <span className="ml-1.5 text-[12px] font-bold text-success align-middle">● EN VIVO</span>
              )}
            </span>
            <button
              onClick={irMesSiguiente}
              disabled={idxMesSeleccionado < 0 || idxMesSeleccionado >= mesesDisponibles.length - 1}
              className="p-3 rounded-full border-2 border-brand bg-brand-tint hover:bg-brand-soft disabled:opacity-30 disabled:cursor-not-allowed disabled:border-aed-border disabled:bg-transparent transition-colors shadow-sm"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={26} strokeWidth={2.75} className="text-brand" />
            </button>
          </div>
          <ConsolidadoCarteraEtapa data={resumenEtapas} />
          {mesesDisponibles.length <= 1 && (
            <p className="text-[13px] text-slate-400 italic mt-2 text-center">
              Todavía no hay meses cerrados para navegar -- se va a ir guardando una foto automáticamente al cierre de cada mes.
            </p>
          )}
        </div>

        {/* Distribución por etapa constructiva */}
        <div className="card p-4">
          <button
            onClick={() => setEtapaAbierta((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-[15px] font-semibold text-slate-700 flex items-center gap-1.5">
              Recaudo por Etapa del proyecto
              <HelpTip text="Esperado vs. recaudado del plan de pagos, agrupado por Etapa constructiva (1, 2, 3…) — no confundir con la Etapa/Stage de Zoho del panel de la derecha." />
            </h2>
            {etapaAbierta ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {etapaAbierta && (
            <div className="mt-3">
              <EtapaRecaudoBars totalesPorEtapa={planRecaudo?.totalesPorEtapa ?? {}} />
            </div>
          )}
        </div>

        {/* Footer sync */}
        <div className="card p-4 flex items-center gap-4 text-[14px] text-slate-500">
          {lastSync ? (
            <>
              {lastSync.status === 'success' ? (
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              ) : lastSync.status === 'error' ? (
                <XCircle size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <Clock size={14} className="text-yellow-500 flex-shrink-0" />
              )}
              <span>
                Última sync Zoho: <strong>{formatDateTime(lastSync.startedAt)}</strong>
                {' · '}{lastSync.recordsSync} registros
              </span>
              <span className="ml-auto">
                Últimas 5: {syncOk} OK · {syncErr} errores
              </span>
            </>
          ) : (
            <span>Sin historial de sincronización</span>
          )}
        </div>
      </div>
    </div>
  );
}
