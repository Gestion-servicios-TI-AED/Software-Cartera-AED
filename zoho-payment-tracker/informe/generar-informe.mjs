import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, VerticalAlign, PageBreak, TableOfContents,
  convertInchesToTwip, LevelFormat,
} from 'docx';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS  = (name) => path.join(__dirname, 'screenshots', name);
const OUT = path.join(__dirname, 'output');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const TODAY = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

// ── Color palette ──────────────────────────────────────────────────────────
const C = {
  azul:    '1E3A8A',
  azulMed: '2563EB',
  azulCla: 'DBEAFE',
  gris:    '64748B',
  grisCla: 'F1F5F9',
  verde:   '166534',
  verdeCla:'DCFCE7',
  ambar:   '92400E',
  ambarCla:'FEF3C7',
  blanco:  'FFFFFF',
  negro:   '0F172A',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function img(file, w = 590, h = 340) {
  try {
    const data = readFileSync(SS(file));
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 200 },
      children: [new ImageRun({ data, transformation: { width: w, height: h }, type: 'png' })],
    });
  } catch {
    return p(`[Imagen no disponible: ${file}]`, { color: C.gris, italics: true });
  }
}

function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 320 },
    children: [new TextRun({ text, size: 18, color: C.gris, italics: true })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { before: opts.before ?? 80, after: opts.after ?? 160, line: 320 },
    children: [new TextRun({
      text,
      size:   opts.size   ?? 22,
      bold:   opts.bold   ?? false,
      italics:opts.italics?? false,
      color:  opts.color  ?? C.negro,
      font:   'Calibri',
    })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color: C.azul, font: 'Calibri' })],
    border: { bottom: { color: C.azulMed, size: 8, style: BorderStyle.SINGLE } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: C.azulMed, font: 'Calibri' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: C.gris, font: 'Calibri' })],
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 60, after: 60, line: 300 },
    children: [new TextRun({ text, size: 22, bold, color: C.negro, font: 'Calibri' })],
  });
}

function subbullet(text) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { before: 40, after: 40, line: 280 },
    children: [new TextRun({ text, size: 20, color: C.gris, font: 'Calibri' })],
  });
}

function hr() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { color: C.azulCla, size: 4, style: BorderStyle.SINGLE } },
    children: [],
  });
}

function space(n = 1) {
  return Array.from({ length: n }, () => new Paragraph({ children: [], spacing: { before: 0, after: 80 } }));
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function badgeRow(items) {
  // Renders a colored badge-like row as a simple table
  const cells = items.map(({ label, color }) =>
    new TableCell({
      shading: { fill: color, type: ShadingType.CLEAR },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: label, size: 18, bold: true, color: C.blanco, font: 'Calibri' })],
      })],
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ cells })],
  });
}

function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 160, right: 160 },
    rows: rows.map(([label, value, highlight]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: C.grisCla, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ children: [new TextRun({ text: label, size: 20, bold: true, color: C.azulMed, font: 'Calibri' })] })],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            shading: { fill: highlight ? C.ambarCla : C.blanco, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, color: C.negro, font: 'Calibri' })] })],
          }),
        ],
      })
    ),
  });
}

function statusTable(modules) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['Módulo', 'Estado', 'Avance', 'Notas'].map((h) =>
          new TableCell({
            shading: { fill: C.azul, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, size: 20, bold: true, color: C.blanco, font: 'Calibri' })] })],
          })
        ),
      }),
      ...modules.map(([mod, estado, avance, nota], i) =>
        new TableRow({
          children: [mod, estado, avance, nota].map((val, ci) =>
            new TableCell({
              shading: { fill: i % 2 === 0 ? C.grisCla : C.blanco, type: ShadingType.CLEAR },
              margins: { top: 60, bottom: 60, left: 160, right: 160 },
              children: [new Paragraph({
                alignment: ci === 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: [new TextRun({
                  text: val,
                  size: 18,
                  color: ci === 2
                    ? (val.includes('100') || val.includes('95') ? C.verde : val.includes('70') || val.includes('80') ? C.ambar : C.gris)
                    : C.negro,
                  bold: ci === 2,
                  font: 'Calibri',
                })],
              })],
            })
          ),
        })
      ),
    ],
  });
}

// ── Document ───────────────────────────────────────────────────────────────
const doc = new Document({
  title: 'Software de Cartera AED — Informe del Proyecto',
  description: 'Estado actual, arquitectura, módulos y plan de trabajo',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: C.negro } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) },
      },
    },
    children: [

      // ── PORTADA ──────────────────────────────────────────────────────────
      ...space(4),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: 'SOFTWARE DE CARTERA', size: 56, bold: true, color: C.azul, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'AED — Administración Estratégica de Datos', size: 28, color: C.azulMed, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: `Informe de Estado del Proyecto · ${TODAY}`, size: 22, italics: true, color: C.gris, font: 'Calibri' })],
      }),
      hr(),
      ...space(2),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'Versión 2.0 — Estado Actualizado', size: 24, bold: true, color: C.gris, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Confidencial — Uso interno', size: 20, italics: true, color: C.gris, font: 'Calibri' })],
      }),
      pageBreak(),

      // ── 1. RESUMEN EJECUTIVO ─────────────────────────────────────────────
      h1('1. Resumen Ejecutivo'),
      p('El Software de Cartera AED es una plataforma interna de gestión que centraliza la información de negocios inmobiliarios proveniente de tres fuentes de datos independientes: el CRM Zoho, archivos Excel de encargos fiduciarios y (en versiones anteriores) correos electrónicos de Outlook.'),
      p('El propósito central del proyecto es transformar datos no estructurados —dispersos en hojas de cálculo y sistemas externos— en información estructurada, confiable y consultable, que permita tomar decisiones de negocio con mayor agilidad y precisión.'),
      p('En términos de ingeniería de datos, el flujo es:'),
      bullet('Datos no estructurados (Excel, Zoho CRM) → Ingesta y normalización → Tablas estructuradas → Visualización y reportes'),
      ...space(1),
      infoTable([
        ['Total negocios registrados', '148 unidades (KALA TORRE 3 Y 4)', false],
        ['Con saldo pendiente',        '125 negocios activos con cartera vigente', true],
        ['Saldo total en cartera',     '$ 22.838.311.000 COP', true],
        ['Fuentes de datos activas',   'Zoho CRM (OAuth 2.0) + Fiducia Excel (manual)', false],
        ['Estado del proyecto',        'En desarrollo activo — 78% completado', false],
      ]),
      pageBreak(),

      // ── 2. CONTEXTO Y OBJETIVO ───────────────────────────────────────────
      h1('2. Contexto y Objetivo del Proyecto'),
      p('AED gestiona proyectos inmobiliarios con múltiples compradores por unidad, cada uno con cronogramas de pago, saldos pendientes y estados contractuales propios. Antes de este sistema, esa información vivía en:'),
      bullet('Archivos Excel de la fiducia (estado de cuentas por propietario)'),
      bullet('Zoho CRM (estado comercial y datos de oportunidades)'),
      bullet('Correos electrónicos con adjuntos de movimientos (ya no utilizados)'),
      ...space(1),
      p('La fragmentación impedía responder preguntas básicas como: ¿Cuántos negocios tienen saldo vencido hoy? ¿Cuál es la cartera total por proyecto? ¿Cuántos movimientos ha tenido este comprador?'),
      p('El objetivo del software es consolidar esas fuentes en una sola plataforma navegable, con datos actualizados y exportables, orientada al equipo de cartera y gerencia.'),
      h3('Enfoque de Ingeniería de Datos'),
      p('Este proyecto sigue el patrón clásico de ETL (Extract, Transform, Load) adaptado al contexto empresarial:'),
      bullet('Extract — Los datos se extraen de Zoho vía API REST (OAuth 2.0) y de la fiducia vía archivos Excel subidos manualmente.'),
      bullet('Transform — Un proceso de backfill normaliza los datos crudos (HojaFiduciaria → Negocio / NegocioComprador / NegocioMovimiento), resolviendo inconsistencias de formato, nombres duplicados y referencias numéricas.'),
      bullet('Load — Los datos estructurados se sirven a través de una API REST propia, consumida por el frontend React con filtros, búsqueda y exportación.'),
      pageBreak(),

      // ── 3. ARQUITECTURA TÉCNICA ──────────────────────────────────────────
      h1('3. Arquitectura Técnica'),
      h2('3.1 Stack Tecnológico'),
      infoTable([
        ['Frontend',  'React 18 + Vite + Tailwind CSS (puerto 5173)', false],
        ['Backend',   'Node.js + Express + Prisma ORM (puerto 3001)', false],
        ['Base de datos', 'PostgreSQL (Prisma migrations)', false],
        ['CRM externo',   'Zoho CRM — API REST con OAuth 2.0 + refresh token', false],
        ['Despliegue',    'NixPacks / Docker — listo para producción', false],
      ]),
      ...space(1),
      h2('3.2 Fuentes de Datos'),
      h3('Zoho CRM (Sincronización automática)'),
      bullet('Cron horario que descarga oportunidades nuevas o modificadas usando If-Modified-Since.'),
      bullet('Solo procesa oportunidades con el campo Pago_Separacion definido.'),
      bullet('Mapeo dinámico de campos: descarga los metadatos del CRM y construye reglas de extracción automáticamente.'),
      bullet('Subforms (forma de pago y propuesta de pago) se persisten en base de datos al primer acceso.'),
      ...space(1),
      h3('Fiducia Excel (Carga manual + backfill automático)'),
      bullet('El usuario sube el archivo Excel desde el módulo Fiducia.'),
      bullet('El sistema detecta el nombre del proyecto desde la columna "Fideicomiso".'),
      bullet('Las hojas "Movimientos" y "Mov_Por_Propietario" se procesan para extraer negocios, compradores y movimientos.'),
      bullet('Desde esta versión, el backfill se ejecuta automáticamente al terminar cada carga exitosa.'),
      ...space(1),
      h2('3.3 Modelo de Datos Principal'),
      infoTable([
        ['Opportunity',       'Oportunidad del CRM Zoho con campos financieros y subforms', false],
        ['EncargFiduciario',  'Encargo fiduciario subido (cabecera del archivo Excel)', false],
        ['HojaFiduciaria',    'Hoja individual del Excel — datos crudos como JSON', false],
        ['MovimientoFiduciario', 'Fila de movimiento cruda (staging layer)', false],
        ['Negocio',           'Unidad inmobiliaria estructurada — fuente de verdad', false],
        ['NegocioComprador',  'Compradores asociados a cada negocio, con cédula y %', false],
        ['NegocioMovimiento', 'Movimiento estructurado por negocio — origen del backfill', false],
        ['SyncLog',           'Historial de sincronizaciones Zoho', false],
        ['ZohoFieldMetadata', 'Metadatos de campos del CRM para mapeo dinámico', false],
      ]),
      pageBreak(),

      // ── 4. MÓDULOS ───────────────────────────────────────────────────────
      h1('4. Módulos del Sistema'),

      h2('4.1 Módulo Oportunidades (CRM Zoho)'),
      p('Centraliza las oportunidades comerciales sincronizadas desde Zoho CRM. Permite buscar, filtrar por etapa y consultar el detalle completo de cada negocio incluyendo sus subforms de forma de pago y propuesta de pago.'),
      img('01-oportunidades.png', 580, 330),
      caption('Figura 1 — Vista principal del módulo Oportunidades con tabla de negocios y filtros'),
      img('02-oportunidad-detalle.png', 580, 330),
      caption('Figura 2 — Detalle de oportunidad: información general, plan financiero y subforms de Zoho'),
      bullet('Sincronización automática cada hora vía cron + trigger manual.'),
      bullet('Campos financieros dinámicos: se adaptan automáticamente si Zoho cambia los nombres de campo.'),
      bullet('Subforms lazy: se cargan bajo demanda desde Zoho o desde caché en base de datos.'),
      pageBreak(),

      h2('4.2 Módulo Negocios'),
      p('Es el módulo central del sistema. Consolida toda la información estructurada extraída de los archivos Excel de la fiducia. Cada "negocio" representa una unidad inmobiliaria con su comprador, estado, estructura financiera e historial completo de movimientos.'),
      img('03-negocios-dashboard.png', 580, 330),
      caption('Figura 3 — Dashboard de Negocios: KPIs financieros, distribución por estado y por proyecto'),
      img('06-negocio-detalle.png', 580, 330),
      caption('Figura 4 — Detalle de negocio: comprador, info del apartamento, estructura financiera e historial de movimientos'),
      bullet('148 negocios activos — 125 con saldo pendiente — $ 22.838.311.000 en cartera.'),
      bullet('Panel izquierdo redimensionable con búsqueda por referencia, nomenclatura, comprador o cédula.'),
      bullet('Filtros por estado, proyecto y saldo pendiente.'),
      bullet('Dashboard automático con KPIs al abrir el módulo (sin seleccionar ningún negocio).'),
      bullet('Exportación a Excel (.xlsx), CSV y PDF de la vista filtrada.'),
      bullet('Backfill automático al subir un nuevo archivo Excel — no requiere acción manual.'),
      pageBreak(),

      h2('4.3 Módulo Fiducia'),
      p('Gestiona la carga de archivos Excel provenientes del encargo fiduciario. Permite cargar, consultar y eliminar encargos. Sirve como capa de ingesta antes de que los datos se estructuren en el módulo Negocios.'),
      img('04-fiducia-encargos.png', 580, 280),
      caption('Figura 5 — Vista de encargos fiduciarios cargados con sus hojas y estado'),
      bullet('Carga de archivos Excel protegidos con contraseña (configurable vía EXCEL_PASSWORD).'),
      bullet('Detección automática del nombre de proyecto desde la columna Fideicomiso.'),
      bullet('Vista drill-down: encargo → nomenclaturas → detalle por apartamento.'),
      bullet('El detalle por apartamento muestra datos estructurados del módulo Negocios (no datos crudos).'),
      pageBreak(),

      h2('4.4 Módulo Movimientos Fiduciarios'),
      p('Vista consolidada de todos los movimientos registrados en el sistema, con filtros avanzados por proyecto, estado, rango de fechas y búsqueda por comprador o referencia.'),
      img('05-fiducia-movimientos.png', 580, 330),
      caption('Figura 6 — Vista de movimientos: tabla filtrable con filas expandibles que muestran el detalle completo de cada transacción'),
      bullet('Lee directamente de NegocioMovimiento (capa estructurada, no datos crudos).'),
      bullet('Filas expandibles que muestran todos los campos del movimiento formateados.'),
      bullet('Filtros por fideicomiso, estado, rango de fechas y búsqueda libre.'),
      pageBreak(),

      // ── 5. PLANES DE PAGO ────────────────────────────────────────────────
      h1('5. Planes de Pago'),
      p('Uno de los ejes más importantes del módulo de cartera es la capacidad de visualizar y comparar planes de pago. En el sistema se contemplan dos enfoques complementarios:'),

      h2('5.1 Plan de Pago Extraído de Zoho CRM'),
      p('El CRM Zoho almacena, por cada oportunidad, los subforms de "Forma de Pago" y "Propuesta de Pago" tal como fueron registrados por el equipo comercial al momento de la separación. Estos datos se sincronizan al sistema y son visibles en el detalle de cada oportunidad.'),
      bullet('Datos directamente del CRM: cuotas, montos, fechas de pago pactadas, forma de financiación.'),
      bullet('Se persisten localmente para evitar consultas repetidas a la API de Zoho.'),
      bullet('Refleja el acuerdo comercial original — lo que se prometió al comprador.'),
      ...space(1),
      new Paragraph({
        spacing: { before: 120, after: 200 },
        shading: { fill: C.ambarCla, type: ShadingType.CLEAR },
        border: { left: { color: C.ambar, size: 16, style: BorderStyle.SINGLE } },
        children: [
          new TextRun({ text: '⚠  Limitación importante: ', size: 22, bold: true, color: C.ambar, font: 'Calibri' }),
          new TextRun({ text: 'Los datos extraídos de Zoho CRM representan lo que fue ingresado manualmente por el equipo comercial. No existe validación automática que confirme que estos valores son 100% correctos o que coincidan con los documentos legales firmados. El sistema trabaja para traer la información más actualizada posible, pero siempre debe contrastarse con la fuente oficial ante decisiones críticas.', size: 22, color: C.ambar, font: 'Calibri' }),
        ],
      }),

      h2('5.2 Plan de Pago Estimado (Calculado internamente)'),
      p('Como complemento al plan de Zoho —y para cubrir casos donde ese plan esté incompleto o desactualizado—, el sistema calculará un plan de pago estimado basado en los datos que sí conocemos con certeza:'),
      bullet('Fecha de separación o fecha de pago inicial registrada en el negocio.', true),
      bullet('Valor de venta total del inmueble.', true),
      bullet('Saldo actual pendiente según los archivos de la fiducia.', true),
      bullet('Historial de movimientos registrados en NegocioMovimiento.', true),
      ...space(1),
      p('Con estos insumos, el plan estimado proyecta:'),
      subbullet('El valor ya pagado acumulado (suma de movimientos contables aplicados).'),
      subbullet('El saldo restante a financiar.'),
      subbullet('Una proyección de cuotas mensuales a partir de la última fecha contable conocida.'),
      subbullet('Indicadores de mora o adelanto respecto al plan original de Zoho.'),
      ...space(1),
      new Paragraph({
        spacing: { before: 120, after: 200 },
        shading: { fill: C.verdeCla, type: ShadingType.CLEAR },
        border: { left: { color: C.verde, size: 16, style: BorderStyle.SINGLE } },
        children: [
          new TextRun({ text: '✓  Valor diferencial: ', size: 22, bold: true, color: C.verde, font: 'Calibri' }),
          new TextRun({ text: 'Al tener los dos planes en paralelo —el de Zoho (lo pactado) y el estimado (lo calculado a partir de movimientos reales)— el equipo de cartera puede identificar desviaciones, detectar compradores en mora y tomar decisiones de cobranza basadas en datos objetivos.', size: 22, color: C.verde, font: 'Calibri' }),
        ],
      }),

      h2('5.3 Recomendaciones sobre Planes de Pago'),
      bullet('Validación cruzada: antes de presentar el plan de Zoho a un cliente o a gerencia, verificar siempre contra el documento de promesa de compraventa firmado.'),
      bullet('Estandarización de ingreso en Zoho: definir un formato obligatorio para los subforms de pago (campos mínimos requeridos) para mejorar la calidad del dato en origen.'),
      bullet('Alerta de desviación: implementar una notificación automática cuando el saldo calculado difiera del saldo de la fiducia en más de un umbral definido (p.ej. 5%).'),
      bullet('Fecha de corte visible: mostrar siempre en el plan estimado la fecha a la que corresponde el cálculo para evitar confusiones con datos de periodos anteriores.'),
      pageBreak(),

      // ── 6. ESTADO ACTUAL ─────────────────────────────────────────────────
      h1('6. Estado Actual y Avance del Proyecto'),
      p('A continuación se presenta el estado de cada módulo y funcionalidad del sistema:'),
      ...space(1),
      statusTable([
        ['Oportunidades / Dashboard', 'Producción', '95%', 'Sync Zoho estable. Plan de pago estimado pendiente.'],
        ['Módulo Negocios', 'Producción', '90%', 'Dashboard KPIs, exportación, búsqueda. Plan estimado pendiente.'],
        ['Fiducia — Carga de archivos', 'Producción', '100%', 'Carga automática + backfill post-upload.'],
        ['Fiducia — Vista nomenclaturas', 'Producción', '100%', 'Datos estructurados. Detalle por apartamento completo.'],
        ['Movimientos Fiduciarios', 'Producción', '95%', 'Capa estructurada. Exportación pendiente.'],
        ['Plan de pago Zoho', 'Disponible', '70%', 'Datos extraídos. Visualización básica. Sin validación.'],
        ['Plan de pago Estimado', 'En diseño', '20%', 'Lógica definida. Implementación pendiente.'],
        ['Reportes gerenciales PDF', 'Pendiente', '10%', 'Exportación básica lista. Dashboard dedicado pendiente.'],
        ['Alertas y notificaciones', 'Pendiente', '0%', 'Roadmap definido. No iniciado.'],
      ]),
      ...space(1),
      p('Avance general estimado del proyecto: 78% completado para los módulos de consulta y visualización. El eje de planificación de pagos y alertas representa el 22% restante.'),
      pageBreak(),

      // ── 7. PRÓXIMOS PASOS ────────────────────────────────────────────────
      h1('7. Próximos Pasos y Recomendaciones'),

      h2('7.1 Prioridad Alta'),
      bullet('Implementar el plan de pago estimado en el detalle de cada oportunidad y negocio, mostrando los dos planes en paralelo (Zoho vs. calculado).', true),
      bullet('Agregar validación visual de desviación entre plan Zoho y saldo fiducia, con semáforo de colores.', true),
      bullet('Definir y documentar los campos mínimos requeridos en los subforms de Zoho para garantizar calidad del dato.', true),

      h2('7.2 Prioridad Media'),
      bullet('Dashboard gerencial dedicado con gráficos de recaudo mensual, mora acumulada y proyección de ingresos.'),
      bullet('Exportación de movimientos desde el módulo FiduciaMovimientos (actualmente solo Negocios tiene exportación).'),
      bullet('Filtro de rango de fechas en el módulo Negocios para análisis histórico.'),
      bullet('Automatizar la carga de archivos Excel de la fiducia via correo (reintegrando IMAP/Graph si se desea).'),

      h2('7.3 Prioridad Baja / Roadmap Futuro'),
      bullet('Sistema de alertas: notificación por correo cuando un negocio entra en mora según el plan estimado.'),
      bullet('Integración bidireccional con Zoho: escribir de vuelta al CRM cuando se detecten inconsistencias.'),
      bullet('Portal del comprador: vista simplificada para que el cliente consulte su propio estado de cartera.'),
      bullet('API pública documentada con Swagger para consumo desde otras herramientas de la empresa.'),
      pageBreak(),

      // ── 8. CONCLUSIÓN ────────────────────────────────────────────────────
      h1('8. Conclusión'),
      p('El Software de Cartera AED ha transitado desde una fase de prototipo hasta un sistema de producción con datos reales, módulos funcionales y un pipeline de datos confiable. El mayor logro de la etapa actual es la unificación de las fuentes de datos bajo un modelo estructurado (Negocio/NegocioMovimiento) que sirve como fuente única de verdad para todos los módulos.'),
      p('El siguiente gran hito es el módulo de planes de pago comparados, que cerrará el ciclo entre lo que se prometió (plan Zoho) y lo que efectivamente ha sucedido (movimientos reales de la fiducia). Ese contraste es la base para una gestión de cartera verdaderamente proactiva.'),
      p('El proyecto tiene una base técnica sólida, datos reales cargados y un equipo que ha demostrado capacidad para iterar rápidamente. Las recomendaciones de este informe están ordenadas por impacto de negocio, y el equipo está abierto a sugerencias y ajustes según las prioridades que defina la gerencia.', { bold: false }),
      ...space(2),
      hr(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 0 },
        children: [new TextRun({ text: `Documento generado el ${TODAY} · Software de Cartera AED · Confidencial`, size: 18, italics: true, color: C.gris, font: 'Calibri' })],
      }),
    ],
  }],
});

// ── Output ─────────────────────────────────────────────────────────────────
const buffer = await Packer.toBuffer(doc);
const fecha  = new Date().toISOString().slice(0, 10);
const outPath = path.join(OUT, `informe-cartera-aed-${fecha}.docx`);
writeFileSync(outPath, buffer);
console.log(`\n✅ Informe generado: ${outPath}`);
console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(0)} KB`);
