import React, { useState, useEffect, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  Settings, RefreshCw, Check, ChevronDown, Building2, Building, Rows3,
  CalendarClock, Lock, XCircle, Search, ChevronsUpDown, ChevronsDownUp,
  FileSearch, Download, AlertTriangle,
} from 'lucide-react';
import { NAV_ITEMS_BAIA_KRISTAL, NAV_ITEMS_ALEGRA } from '../config/navItems';
import { useHiddenNav } from '../utils/navPrefs';
import { useProyectoActivo, PROYECTOS } from '../utils/proyectoActivo';
import {
  triggerSubformsBackfill, getSubformsBackfillStatus, getInconsistenciasProjectCode,
  getConfiguracionesFrentes, actualizarFechaEntregaProyecto, actualizarFechaEntregaTorre, actualizarFechaEntregaPiso,
} from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';
import logoAlegra from '../assets/alegra-logo.svg';

const LOGOS_PROYECTO = { 'baia-kristal': logoBaiaKristal, alegra: logoAlegra };

function formatDuracion(segundos) {
  if (segundos == null) return null;
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min} min${seg > 0 ? ` ${seg}s` : ''}`;
}

// Pill de estado con los colores de dominio de index.css (un color = un
// significado) -- evita reintroducir tonos de Tailwind sueltos por toda la
// página.
const BADGE_TONES = {
  success: { color: 'var(--success-text)', backgroundColor: 'var(--success-bg)', borderColor: 'var(--success-border)' },
  neutral: { color: 'var(--neutral-text)', backgroundColor: 'var(--neutral-bg)', borderColor: 'var(--neutral-border)' },
  warning: { color: 'var(--warning-text)', backgroundColor: 'var(--warning-bg)', borderColor: 'var(--warning-border)' },
};

function Badge({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span
      className="badge text-[11.5px] px-2 py-0.5 leading-none whitespace-nowrap flex-shrink-0"
      style={BADGE_TONES[tone]}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

function SubformsBackfillCard() {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getSubformsBackfillStatus();
        setStatus(res);
        if (!res.running) stopPolling();
      } catch {
        // seguir intentando en el próximo tick
      }
    }, 2000);
  }, [stopPolling]);

  // Al cargar la página, revisa si ya hay un backfill corriendo (ej. lo
  // disparó otra persona, u otra pestaña) para reflejarlo sin necesidad
  // de hacer clic.
  useEffect(() => {
    getSubformsBackfillStatus()
      .then((res) => {
        setStatus(res);
        if (res.running) startPolling();
      })
      .catch(() => {});
    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerSubformsBackfill();
      startPolling();
    } catch (err) {
      console.error('Error al iniciar el backfill:', err);
    } finally {
      setTriggering(false);
    }
  };

  const running = status?.running;
  const result = status?.result;
  const enCurso = running && result?.running;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Plan de pagos desde Zoho</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Trae el plan de pagos (Forma de Pago / Propuesta de Pago) de Zoho para las oportunidades
          que todavía no lo tengan guardado — necesario para que el Dashboard de plan vs. recaudo
          muestre datos completos. Es seguro correrlo varias veces: solo procesa lo pendiente.
        </p>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-3">
        <button
          onClick={handleTrigger}
          disabled={triggering || enCurso}
          className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={enCurso ? 'animate-spin' : ''} />
          {enCurso ? 'Sincronizando…' : 'Sincronizar planes de pago'}
        </button>

        {enCurso && (
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2 rounded-full bg-aed-base overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${result.porcentaje}%`, backgroundColor: 'var(--brand)' }}
              />
            </div>
            <p className="text-[13px] text-slate-500">
              {result.porcentaje}% · {result.procesadas} de {result.total} oportunidades
              {result.segundosRestantesEstimados != null && (
                <> · faltan ~{formatDuracion(result.segundosRestantesEstimados)}</>
              )}
              {result.errores > 0 && <span style={{ color: 'var(--warning-text)' }}> · {result.errores} errores</span>}
            </p>
          </div>
        )}

        {!enCurso && result?.ok === true && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--success-text)' }}>
            <Check size={14} className="flex-shrink-0" />
            <span>
              Listo: {result.actualizadas} de {result.total} oportunidades actualizadas en {result.elapsed}
              {result.errores > 0 && <span style={{ color: 'var(--warning-text)' }}> ({result.errores} errores)</span>}
            </span>
          </div>
        )}

        {!enCurso && result?.ok === false && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--danger-text)' }}>
            <XCircle size={14} className="flex-shrink-0" />
            <span>Error: {result.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Reporte on-demand: inmuebles cuyo Project_Code de Zoho no le pertenece
// (fue copiado de otro apartamento del mismo frente) -- problema de datos
// en Zoho, no del sync. Este botón solo lo detecta y lo deja descargar en
// Excel para pasárselo a quien administra Zoho; no corrige nada acá.
function ProjectCodeReportCard() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleVerificar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await getInconsistenciasProjectCode();
      setReporte(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleDescargar = async () => {
    if (!reporte) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Project Code inconsistentes');
    ws.columns = [
      { header: 'Frente', key: 'frente', width: 16 },
      { header: 'Torre', key: 'torre', width: 8 },
      { header: 'Unidad (Product Name)', key: 'productName', width: 20 },
      { header: 'Project Code actual (incorrecto)', key: 'projectCodeActual', width: 30 },
      { header: 'Estado del inmueble', key: 'estado', width: 16 },
      { header: 'Referencia de recaudo', key: 'referenciaRecaudo', width: 18 },
      { header: 'Zoho ID', key: 'zohoId', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const inc of reporte.inconsistencias) {
      ws.addRow({
        frente: inc.frente ?? '',
        torre: inc.torre ?? '',
        productName: inc.productName,
        projectCodeActual: inc.projectCodeActual,
        estado: inc.estado ?? '',
        referenciaRecaudo: inc.referenciaRecaudo ?? '',
        zohoId: inc.zohoId,
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-code-inconsistentes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Project Code inconsistentes</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Detecta inmuebles cuyo Project_Code de Zoho no coincide con su propia unidad -- señal de que
          fue copiado por error de otro apartamento del mismo frente. Es un problema de datos en Zoho,
          no de la sincronización: este reporte solo lo detecta para que se corrija en el origen.
        </p>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-3">
        <button
          onClick={handleVerificar}
          disabled={cargando}
          className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <FileSearch size={14} className={cargando ? 'animate-pulse' : ''} />
          {cargando ? 'Verificando…' : 'Verificar Project Code'}
        </button>

        {error && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--danger-text)' }}>
            <XCircle size={14} className="flex-shrink-0" />
            <span>Error: {error}</span>
          </div>
        )}

        {reporte && reporte.total === 0 && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--success-text)' }}>
            <Check size={14} className="flex-shrink-0" />
            <span>Sin inconsistencias -- todos los Project_Code coinciden con su propia unidad.</span>
          </div>
        )}

        {reporte && reporte.total > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--warning-text)' }}>
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{reporte.total} inmuebles con Project_Code copiado de otra unidad.</span>
            </div>

            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {reporte.porTorre.map((t) => (
                <div key={t.torre} className="flex items-center justify-between text-[13px] px-2 py-1 rounded bg-aed-base">
                  <span className="text-slate-600">{t.torre}</span>
                  <Badge tone="warning">{t.count}</Badge>
                </div>
              ))}
            </div>

            <button
              onClick={handleDescargar}
              className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5"
            >
              <Download size={13} /> Descargar Excel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Fecha en formato yyyy-mm-dd para el <input type="date">, sin líos de
// timezone (la fecha viene en UTC medianoche desde el backend).
function toInputDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

// Fila genérica de fecha configurable, usada para "todo el proyecto", "toda
// la torre" o un piso puntual. `bloqueada` la deshabilita porque un nivel
// distinto (proyecto/torre/piso) ya tiene una fecha configurada -- los tres
// son mutuamente excluyentes entre sí, hay que borrar uno para usar otro.
// `indent` controla la sangría visual según la profundidad (0 = proyecto,
// 1 = torre, 2 = piso); el borde izquierdo se enciende en verde cuando esta
// fila específica tiene una fecha activa, para que resalte entre docenas de
// filas vacías sin tener que leer cada una.
function FilaFecha({ Icon, etiqueta, subtitulo, fechaEntrega, bloqueada, motivoBloqueo, onGuardar, indent = 0 }) {
  const [valor, setValor] = useState(toInputDate(fechaEntrega));
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(null);
  const dirty = valor !== toInputDate(fechaEntrega);
  const configurada = !!fechaEntrega;

  useEffect(() => {
    setValor(toInputDate(fechaEntrega));
  }, [fechaEntrega]);

  const handleGuardar = async () => {
    setSaving(true);
    setGuardado(false);
    setError(null);
    try {
      await onGuardar(valor || null);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const marginNota = Icon ? '23.5px' : 0;

  return (
    <div
      className="py-2.5 pr-4 border-l-[3px] transition-colors"
      style={{ paddingLeft: `${16 + indent * 20}px`, borderLeftColor: configurada ? 'var(--success-border)' : 'transparent' }}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <Icon size={15} strokeWidth={2} className={`flex-shrink-0 ${configurada ? 'text-emerald-600' : 'text-slate-300'}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-slate-800">{etiqueta}</p>
          <p className="text-[13px] text-slate-500">{subtitulo}</p>
        </div>
        <input
          type="date"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={bloqueada}
          className="input text-[14px] h-8 py-0 w-40 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleGuardar}
          disabled={bloqueada || saving || !dirty}
          className="btn-secondary px-2.5 py-1.5 text-[13px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {guardado ? <Check size={13} style={{ color: 'var(--success-text)' }} /> : <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />}
          {guardado ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      {bloqueada && (
        <p className="text-[12px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--warning-text)', marginLeft: marginNota }}>
          <Lock size={11} className="flex-shrink-0" /> {motivoBloqueo}
        </p>
      )}
      {error && (
        <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: 'var(--danger-text)', marginLeft: marginNota }}>
          <XCircle size={11} className="flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function GrupoTorre({ frente, torre, torreWide, pisos, expandido, onToggle, onGuardadoTorre, onGuardadoPiso }) {
  const configuradas = pisos.filter((p) => p.fechaEntrega).length;
  const torreConfigurada = !!torreWide.fechaEntrega;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2 pr-4 hover:bg-aed-base transition-colors text-left"
        style={{ paddingLeft: '20px' }}
      >
        <ChevronDown
          size={13}
          className={`text-slate-400 transition-transform flex-shrink-0 ${expandido ? '' : '-rotate-90'}`}
        />
        <Building size={14} className="text-slate-400 flex-shrink-0" />
        <span className="text-[14px] font-medium text-slate-700 flex-1">Torre {torre}</span>
        {torreConfigurada ? (
          <Badge tone="success" icon={CalendarClock}>Toda la torre</Badge>
        ) : configuradas > 0 ? (
          <Badge tone="success">{configuradas}/{pisos.length} pisos</Badge>
        ) : (
          <Badge tone="neutral">{pisos.length > 0 ? `${pisos.length} pisos` : 'Sin pisos'}</Badge>
        )}
      </button>
      {expandido && (
        <div className="border-t border-aed-border">
          <FilaFecha
            Icon={Building}
            indent={1}
            etiqueta="Toda la torre"
            subtitulo={torreWide.fechaEntrega ? 'Fecha configurada para todos los pisos' : 'Sin configurar — usa la fecha inferida del plan'}
            fechaEntrega={torreWide.fechaEntrega}
            bloqueada={configuradas > 0}
            motivoBloqueo="Ya hay fechas configuradas por piso — bórralas para usar una fecha única para esta torre."
            onGuardar={(fecha) => onGuardadoTorre(frente, torre, fecha)}
          />
          {pisos.length > 0 && (
            <div className="divide-y divide-aed-border border-t border-aed-border">
              {pisos.map((p) => (
                <FilaFecha
                  key={`${p.frente}-${p.torre}-${p.piso}`}
                  Icon={Rows3}
                  indent={2}
                  etiqueta={`Piso ${p.piso}`}
                  subtitulo={p.fechaEntrega ? 'Fecha configurada' : 'Sin configurar — usa la fecha inferida del plan'}
                  fechaEntrega={p.fechaEntrega}
                  bloqueada={torreConfigurada}
                  motivoBloqueo="Toda la torre usa una fecha única (arriba) — bórrala para configurar este piso por separado."
                  onGuardar={(fecha) => onGuardadoPiso(frente, torre, p.piso, fecha)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoFrente({
  frente, proyecto, torres, expandido, onToggle,
  torresExpandidas, onToggleTorre, onGuardadoTorre, onGuardadoProyecto, onGuardadoPiso,
}) {
  const torresConFecha = [...torres.values()].filter(
    (t) => t.torreWide.fechaEntrega || t.pisos.some((p) => p.fechaEntrega)
  ).length;
  const proyectoConfigurado = !!proyecto.fechaEntrega;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-aed-base transition-colors text-left"
      >
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform flex-shrink-0 ${expandido ? '' : '-rotate-90'}`}
        />
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--brand-tint)', color: 'var(--brand-strong)' }}
        >
          <Building2 size={14} strokeWidth={2} />
        </span>
        <span className="text-[14px] font-semibold text-slate-800 flex-1">{frente}</span>
        {proyectoConfigurado ? (
          <Badge tone="success" icon={CalendarClock}>Todo el proyecto</Badge>
        ) : torresConFecha > 0 ? (
          <Badge tone="success">{torresConFecha}/{torres.size} torres</Badge>
        ) : (
          <Badge tone="neutral">Sin configurar</Badge>
        )}
      </button>
      {expandido && (
        <div className="border-t border-aed-border">
          <FilaFecha
            Icon={Building2}
            indent={0}
            etiqueta="Todo el proyecto"
            subtitulo={proyecto.fechaEntrega ? 'Fecha configurada para todas las torres' : 'Sin configurar — usa la fecha inferida del plan'}
            fechaEntrega={proyecto.fechaEntrega}
            bloqueada={torresConFecha > 0}
            motivoBloqueo="Ya hay fechas configuradas por torre o por piso — bórralas para usar una fecha única aquí."
            onGuardar={(fecha) => onGuardadoProyecto(frente, fecha)}
          />
          <div className="divide-y divide-aed-border border-t border-aed-border">
            {[...torres.entries()].map(([torre, grupoTorre]) => (
              <GrupoTorre
                key={`${frente}-${torre}`}
                frente={frente}
                torre={torre}
                torreWide={grupoTorre.torreWide}
                pisos={grupoTorre.pisos}
                expandido={torresExpandidas.has(`${frente}||${torre}`)}
                onToggle={() => onToggleTorre(frente, torre)}
                onGuardadoTorre={onGuardadoTorre}
                onGuardadoPiso={onGuardadoPiso}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonFrentes() {
  return (
    <div className="divide-y divide-aed-border">
      {[96, 130, 110].map((w, i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-3 animate-pulse">
          <div className="w-3.5 h-3.5 rounded bg-slate-200" />
          <div className="w-7 h-7 rounded-lg bg-slate-200" />
          <div className="h-3.5 rounded bg-slate-200" style={{ width: `${w}px` }} />
          <div className="flex-1" />
          <div className="h-5 w-20 rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function FechaEntregaFrenteCard() {
  const [configs, setConfigs] = useState(null);
  const [error, setError] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set());
  const [torresExpandidas, setTorresExpandidas] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    getConfiguracionesFrentes()
      .then((res) => {
        setConfigs(res.data);
        // Expandir por defecto solo los frentes/torres que ya tienen alguna
        // fecha configurada (a cualquier nivel), para que se vean de
        // inmediato sin abrir todo.
        const conFecha = new Set();
        const torresConFecha = new Set();
        for (const c of res.data) {
          if (!c.fechaEntrega) continue;
          conFecha.add(c.frente);
          if (c.torre !== null) torresConFecha.add(`${c.frente}||${c.torre}`);
        }
        setExpandidos(conFecha);
        setTorresExpandidas(torresConFecha);
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleGuardadoProyecto = async (frente, fecha) => {
    const actualizado = await actualizarFechaEntregaProyecto(frente, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === null ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const handleGuardadoTorre = async (frente, torre, fecha) => {
    const actualizado = await actualizarFechaEntregaTorre(frente, torre, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === torre && c.piso === null ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const handleGuardadoPiso = async (frente, torre, piso, fecha) => {
    const actualizado = await actualizarFechaEntregaPiso(frente, torre, piso, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === torre && c.piso === piso ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const toggleFrente = (frente) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(frente)) next.delete(frente);
      else next.add(frente);
      return next;
    });
  };

  const toggleTorre = (frente, torre) => {
    const key = `${frente}||${torre}`;
    setTorresExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const porFrente = configs?.reduce((acc, c) => {
    if (!acc.has(c.frente)) acc.set(c.frente, { proyecto: null, torres: new Map() });
    const grupo = acc.get(c.frente);
    if (c.torre === null) {
      grupo.proyecto = c;
      return acc;
    }
    if (!grupo.torres.has(c.torre)) grupo.torres.set(c.torre, { torreWide: null, pisos: [] });
    const grupoTorre = grupo.torres.get(c.torre);
    if (c.piso === null) grupoTorre.torreWide = c;
    else grupoTorre.pisos.push(c);
    return acc;
  }, new Map());

  const frentesFiltrados = porFrente
    ? [...porFrente.entries()].filter(([frente]) => frente.toLowerCase().includes(busqueda.toLowerCase()))
    : [];

  const totalConfigurados = configs?.filter((c) => c.fechaEntrega).length ?? 0;

  const expandirTodo = () => {
    if (!porFrente) return;
    setExpandidos(new Set(porFrente.keys()));
    const todasTorres = new Set();
    for (const [frente, grupo] of porFrente) {
      for (const torre of grupo.torres.keys()) todasTorres.add(`${frente}||${torre}`);
    }
    setTorresExpandidas(todasTorres);
  };

  const colapsarTodo = () => {
    setExpandidos(new Set());
    setTorresExpandidas(new Set());
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Fecha de entrega por Frente, Torre y Piso</h2>
            <p className="text-[13px] text-slate-500 mt-0.5 max-w-2xl">
              Reemplaza la fecha estimada de la cuota "Saldo Contraentrega" (que por defecto se infiere
              a partir de las cuotas anteriores) por la fecha real de entrega cuando se conozca. Se puede
              configurar una fecha única para todo el proyecto, para una torre completa, o para un piso
              específico — solo un nivel a la vez para cada torre. Afecta la conciliación de todos los
              negocios correspondientes, tanto en el detalle de cada negocio como en el Dashboard y
              Cartera en Gestión.
            </p>
          </div>
          {totalConfigurados > 0 && (
            <Badge tone="success" icon={CalendarClock}>{totalConfigurados} configuradas</Badge>
          )}
        </div>

        {configs && configs.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1 max-w-[220px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar frente…"
                className="input h-8 py-0 pl-8 text-[13px]"
              />
            </div>
            <button onClick={expandirTodo} className="btn-secondary px-2.5 py-1.5 text-[12.5px] flex items-center gap-1">
              <ChevronsUpDown size={12} /> Expandir todo
            </button>
            <button onClick={colapsarTodo} className="btn-secondary px-2.5 py-1.5 text-[12.5px] flex items-center gap-1">
              <ChevronsDownUp size={12} /> Colapsar todo
            </button>
          </div>
        )}
      </div>

      {error && <p className="px-4 py-3 text-[13px] text-red-500">Error: {error}</p>}

      {!error && !configs && <SkeletonFrentes />}

      {porFrente && frentesFiltrados.length === 0 && (
        <p className="px-4 py-6 text-[14px] text-slate-400 text-center">
          Ningún frente coincide con "{busqueda}".
        </p>
      )}

      {porFrente && frentesFiltrados.length > 0 && (
        <div className="divide-y divide-aed-border">
          {frentesFiltrados.map(([frente, grupo]) => (
            <GrupoFrente
              key={frente}
              frente={frente}
              proyecto={grupo.proyecto}
              torres={grupo.torres}
              expandido={expandidos.has(frente)}
              onToggle={() => toggleFrente(frente)}
              torresExpandidas={torresExpandidas}
              onToggleTorre={toggleTorre}
              onGuardadoTorre={handleGuardadoTorre}
              onGuardadoProyecto={handleGuardadoProyecto}
              onGuardadoPiso={handleGuardadoPiso}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Seccion({ title, icon: Icon, color, children }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        {Icon && (
          <span
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icon size={12} strokeWidth={2.5} />
          </span>
        )}
        <h2 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)] focus:ring-offset-2 ${
        checked ? 'bg-brand' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export default function Ajustes() {
  const { hidden, setVisible } = useHiddenNav();
  const { proyecto, setProyecto } = useProyectoActivo();
  const proyectoActual = PROYECTOS.find((p) => p.key === proyecto) ?? PROYECTOS[0];
  const itemsMenuProyecto = proyecto === 'alegra' ? NAV_ITEMS_ALEGRA : NAV_ITEMS_BAIA_KRISTAL;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-2.5 flex-shrink-0 sticky top-0 z-10">
        <Settings size={18} className="text-slate-500" />
        <h1 className="text-[18px] font-bold text-slate-800">Ajustes</h1>
      </header>

      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Seccion title="Apariencia" icon={Settings} color="#64748b">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-aed-border">
                <h2 className="text-[15px] font-semibold text-slate-800">Proyecto activo</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Elige qué cartera ver en el menú lateral. Cada proyecto tiene su propio
                  CRM y su propia lógica -- esto solo cambia qué módulos aparecen abajo.
                </p>
              </div>
              <div className="divide-y divide-aed-border">
                {PROYECTOS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setProyecto(p.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-aed-base transition-colors"
                  >
                    <div className="flex-1 min-w-0 flex items-center h-9">
                      <img
                        src={LOGOS_PROYECTO[p.key]}
                        alt={p.label}
                        title={p.label}
                        className="h-full w-auto max-w-[150px] object-contain object-left"
                      />
                    </div>
                    {proyecto === p.key && <Check size={16} className="text-brand flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-aed-border">
                <h2 className="text-[15px] font-semibold text-slate-800">
                  Elementos del menú -- {proyectoActual.label}
                </h2>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Decide qué secciones se muestran en el menú lateral de este proyecto. Las
                  que ocultes desaparecen de la barra, pero siguen funcionando si tienes su
                  enlace. Cada proyecto guarda su propia lista -- ocultar algo acá no
                  afecta al otro.
                </p>
              </div>

              <div className="divide-y divide-aed-border">
                {itemsMenuProyecto.map((item) => {
                  const visible = !hidden.has(item.key);
                  return (
                    <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${item.color}14`, color: item.color }}
                      >
                        <item.Icon size={16} strokeWidth={2} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-slate-800">{item.label}</p>
                        <p className="text-[13px] text-slate-500">
                          {visible ? 'Visible en el menú' : 'Oculto'}
                        </p>
                      </div>
                      <Toggle
                        checked={visible}
                        label={`Mostrar ${item.label}`}
                        onChange={() => setVisible(item.key, !visible)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Seccion>

          <Seccion title="Sincronización de datos" icon={RefreshCw} color="#1d4ed8">
            <SubformsBackfillCard />
            <ProjectCodeReportCard />
          </Seccion>

          <div className="xl:col-span-2">
            <Seccion title="Conciliación" icon={CalendarClock} color="#0e7581">
              <FechaEntregaFrenteCard />
            </Seccion>
          </div>
        </div>
      </div>
    </div>
  );
}
