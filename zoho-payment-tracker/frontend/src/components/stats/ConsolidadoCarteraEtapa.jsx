import HelpTip from '../HelpTip';
import Spinner from '../Spinner';
import { etiquetaEtapa } from '../../utils/etapas';
import { categoricalColor } from '../../utils/estados';

// Réplica en vivo del Excel manual "CONSOLIDADO DE CARTERA" (Gerencia lo arma
// a mano cada mes) -- mismas columnas, misma agrupación por Etapa. Igual que
// el Excel, las cifras se muestran en miles de millones ("Cifras en miles de
// millones" es literalmente el título de esa hoja).
function formatMM(value) {
  if (value == null || isNaN(value)) return '—';
  return `$${(value / 1_000_000_000).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function formatPct(value) {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatInt(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('es-CO');
}

function formatFechaCorte(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const NOTA_VENDIDAS_FIDU = 'Cuenta Negocios (Excel de fiducia) en estado PROMETIDO, OPCIONADO, VENDIDO o ESCRITURA_AUTORIZADA -- confirmado con el usuario y verificado contra el Excel "CONSOLIDADO DE CARTERA" de abril 2026. Es un conteo distinto de "Vendidas CRM" (que cuenta por estado del inmueble en Inventario): clasifican universos distintos, negocio financiero vs. inmueble físico.';

// Esta sí se completa, pero con un criterio aproximado (no 100% igual al que
// describe el Excel) -- se marca con una notita en el encabezado en vez de
// con "Pendiente" en el cuerpo, para no esconder el número pero dejar claro
// que el criterio exacto no está confirmado.
const NOTA_CARTERA_5D = 'Mismo criterio de mora activa que usa Cartera en Gestión (Cuota Inicial, sin Saldo Contraentrega), pero SIN excluir "trámites pendientes" como pide el Excel -- no existe ese flag en el sistema.';

// Un color por grupo (mismos tokens semánticos que el resto de la app --
// ver ESTADO_TOKENS en utils/estados.js): info/azul para lo puramente
// informativo, success/verde para plata que ya entró, warning/ámbar para
// plata que falta por entrar. El tinte se repite en encabezado, subencabezado
// y celdas de datos de cada grupo para que la columna se identifique de un
// vistazo aunque se haga scroll y el encabezado quede fuera de vista.
const GRUPOS = [
  { label: 'Cifras generales', span: 8, bg: 'bg-info-bg', text: 'text-info', border: 'border-info-border' },
  { label: 'Recaudado', span: 5, bg: 'bg-success-bg', text: 'text-success', border: 'border-success-border' },
  { label: 'Por recaudar', span: 4, bg: 'bg-warning-bg', text: 'text-warning', border: 'border-warning-border' },
];

// Columnas EXACTAS pedidas -- mismo texto literal de los encabezados del
// Excel "CONSOLIDADO DE CARTERA" para las que sí se muestran, sin abreviar.
// A propósito NO incluye "RECAUDO (REAL+CARTERA)", "VALOR EN CUOTAS
// INICIALES (PLAN PAGOS) RECAUDADO", "VALOR CRÉDITOS CLIENTES
// (SUBROGACIONES) RECAUDADO", "# CLIENTES DESISTIDOS" ni "% DESISTIMIENTOS"
// -- esas quedaron fuera a pedido explícito, aunque el Excel completo sí
// las trae.
const COLUMNAS = [
  { key: 'uniTotales', grupo: 0, label: 'UNI TOTALES', render: (e) => formatInt(e.uniTotales) },
  { key: 'uniVendidasFidu', grupo: 0, label: 'UNI VENDIDAS (FIDU)', nota: NOTA_VENDIDAS_FIDU, render: (e) => formatInt(e.uniVendidasFidu) },
  { key: 'uniVendidasCRM', grupo: 0, label: 'UNIDADES VENDIDAS CRM (Estado: Vendido, reservado, separado)', render: (e) => formatInt(e.uniVendidasCRM) },
  { key: 'uniDisponible', grupo: 0, label: 'UNIDADES DISPONIBLE', render: (e) => formatInt(e.uniDisponible) },
  { key: 'valorTotalVenta', grupo: 0, label: 'VALOR TOTAL VENTA (FIDUCIARIA+DISPONIBLES)', render: (e) => formatMM(e.valorTotalVenta) },
  { key: 'valorTotalVentasFiduciaria', grupo: 0, label: 'VALOR TOTAL VENTAS FIDUCIARIA', render: (e) => formatMM(e.valorTotalVentasFiduciaria) },
  { key: 'valorCuotasIniciales', grupo: 0, label: 'VALOR CUOTAS INICIALES', render: (e) => formatMM(e.valorCuotasIniciales) },
  { key: 'valorTotalUnidadesDisponibles', grupo: 0, label: 'VALOR TOTAL($) UNIDADES DISPONIBLES', render: (e) => formatMM(e.valorTotalUnidadesDisponibles) },
  { key: 'recaudoReal', grupo: 1, label: 'VR. TOTAL RECAUDADO A LA FECHA', render: (e) => formatMM(e.recaudoReal) },
  { key: 'pctRecaudoSobreVentasFiduciaria', grupo: 1, label: '% DE RECAUDO SOBRE VENTAS TOTALES FIDUCIARIA', render: (e) => formatPct(e.pctRecaudoSobreVentasFiduciaria) },
  { key: 'pctRecaudoSobreCuotaInicial', grupo: 1, label: '% DE RECAUDO SOBRE LA CUOTA INICIAL', render: (e) => formatPct(e.pctRecaudoSobreCuotaInicial) },
  { key: 'carteraMas5Dias', grupo: 1, label: 'CARTERA > 5 DIAS (sin tramites pendientes)', nota: NOTA_CARTERA_5D, render: (e) => formatMM(e.carteraMas5Dias) },
  { key: 'pctCarteraMas5Dias', grupo: 1, label: '% DE CARTERA > 5 DIAS', nota: NOTA_CARTERA_5D, render: (e) => formatPct(e.pctCarteraMas5Dias) },
  { key: 'pendienteTotalFiduciaria', grupo: 2, label: 'VR. TOTAL PENDIENTE POR RECAUDAR UNIDADES EN FIDUCIARIA', render: (e) => formatMM(e.pendienteTotalFiduciaria) },
  { key: 'pendienteCuotaInicial', grupo: 2, label: 'VALOR EN CUOTAS INICIALES POR RECAUDAR EN FIDUCIARIA', render: (e) => formatMM(e.pendienteCuotaInicial) },
  { key: 'pendienteCredito', grupo: 2, label: 'VALOR EN CREDITO POR RECAUDAR EN FIDUCIARIA', render: (e) => formatMM(e.pendienteCredito) },
  { key: 'fechaCorte', grupo: 2, label: 'FECHA DE CORTE INFO', render: (e) => formatFechaCorte(e.fechaCorte) },
];

// Primera columna de cada grupo -- ahí va el borde grueso que separa un
// bloque del siguiente, en el color del grupo que empieza.
const INICIO_DE_GRUPO = new Set(GRUPOS.reduce((acc, g, i) => {
  const prevSpan = GRUPOS.slice(0, i).reduce((s, x) => s + x.span, 0);
  acc.push(COLUMNAS[prevSpan]?.key);
  return acc;
}, []));

function FilaEtapa({ fila, esTotal, color }) {
  return (
    <tr className={esTotal ? 'bg-aed-base font-semibold border-t-2 border-slate-400' : 'border-b border-slate-200 hover:bg-slate-50'}>
      <td
        className={`px-3 py-3 whitespace-nowrap sticky left-0 border-l-4 text-[14px] ${esTotal ? 'bg-aed-base border-l-slate-400' : 'bg-white'}`}
        style={esTotal ? undefined : { borderLeftColor: color }}
      >
        {!esTotal && (
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: color }} />
        )}
        {esTotal ? 'TOTAL GENERAL' : etiquetaEtapa(fila.etapa)}
      </td>
      {COLUMNAS.map((col) => {
        const g = GRUPOS[col.grupo];
        return (
          <td
            key={col.key}
            className={`px-2 py-3 whitespace-nowrap text-center text-[14px] ${esTotal ? '' : g.bg} ${INICIO_DE_GRUPO.has(col.key) ? `border-l-2 ${g.border}` : ''}`}
          >
            {col.render(fila)}
          </td>
        );
      })}
    </tr>
  );
}

export default function ConsolidadoCarteraEtapa({ data }) {
  // `data` llega en null mientras el mes seleccionado todavía se está
  // trayendo (ver Resumen.jsx) -- distinto de "ya llegó pero vino vacío".
  if (data === null) {
    return <Spinner label="Cargando Consolidado de Cartera…" />;
  }
  if (!data.etapas?.length) {
    return <p className="text-[14px] text-slate-400 italic">Sin datos.</p>;
  }

  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-3">
        Cifras en miles de millones de pesos (misma convención del Excel "CONSOLIDADO DE CARTERA"), calculadas en vivo sobre la conciliación real -- no una copia mensual a mano.
        Las columnas con un ⓘ junto al encabezado usan un criterio aproximado o recién confirmado, no necesariamente idéntico al del Excel original (pasa el mouse para ver el detalle).
      </p>
      <div className="overflow-x-auto">
        <table className="text-[14px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white" />
              {GRUPOS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.span}
                  className={`px-2 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide border-x-2 border-b-2 ${g.bg} ${g.text} ${g.border}`}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr className="border-b-2 border-slate-400">
              <th className="section-label px-3 py-2.5 text-left whitespace-nowrap sticky left-0 bg-aed-base align-bottom">Etapa</th>
              {COLUMNAS.map((col) => {
                const g = GRUPOS[col.grupo];
                return (
                  <th
                    key={col.key}
                    title={col.label}
                    className={`px-1.5 py-2.5 w-[135px] max-w-[135px] text-center whitespace-normal leading-tight text-[11px] font-semibold align-bottom ${g.bg} ${g.text} ${INICIO_DE_GRUPO.has(col.key) ? `border-l-2 ${g.border}` : ''}`}
                  >
                    {col.label}
                    {col.nota && <HelpTip text={col.nota} className="ml-1 normal-case" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.etapas.map((fila, i) => (
              <FilaEtapa key={fila.etapa} fila={fila} color={categoricalColor(i)} />
            ))}
            <FilaEtapa fila={data.total} esTotal />
          </tbody>
        </table>
      </div>
    </div>
  );
}
