# Prompt para Claude Code — App de Seguimiento de Planes de Pago (Zoho CRM)

## Contexto del proyecto

Construir una aplicación web de seguimiento de **planes de pago e información de oportunidades** conectada a Zoho CRM. La app está pensada para el área financiera de una empresa inmobiliaria. Debe funcionar primero en local y luego desplegarse en un VPS con Ubuntu 24.04 en Hostinger.

---

## Stack tecnológico a usar

- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL (via `pg` o Prisma ORM)
- **Frontend:** React + Vite + TailwindCSS
- **Autenticación Zoho:** OAuth 2.0 con Refresh Token (Self Client)
- **Scheduler de sincronización:** node-cron
- **ORM:** Prisma
- **Comunicación frontend↔backend:** REST API interna

> **Justificación del stack:** Node.js maneja bien las llamadas HTTP a APIs externas, PostgreSQL es robusto para datos financieros estructurados, y React+Tailwind permite construir tablas e interfaces de lectura rápidas. Todo funciona en Ubuntu 24.04 sin configuración especial.

---

## Estructura de carpetas a generar

```
zoho-payment-tracker/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── zoho.js          # Configuración OAuth y tokens
│   │   ├── services/
│   │   │   ├── zohoAuth.js      # Lógica de refresh token
│   │   │   └── zohoSync.js      # Llamadas a API de Zoho CRM
│   │   ├── routes/
│   │   │   └── opportunities.js # Endpoints REST internos
│   │   ├── models/              # Modelos Prisma (auto-generados)
│   │   └── index.js             # Entry point Express
│   ├── prisma/
│   │   └── schema.prisma        # Schema de base de datos
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── OpportunityCard.jsx
│   │   │   ├── PaymentPlanTable.jsx
│   │   │   └── FilterBar.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   └── OpportunityDetail.jsx
│   │   └── App.jsx
│   ├── index.html
│   └── package.json
├── .gitignore
└── README.md
```

---

## Variables de entorno requeridas (.env)

```env
# Zoho OAuth
ZOHO_CLIENT_ID=tu_client_id
ZOHO_CLIENT_SECRET=tu_client_secret
ZOHO_REFRESH_TOKEN=tu_refresh_token
ZOHO_API_BASE=https://www.zohoapis.com/crm/v2
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com

# Base de datos
DATABASE_URL=postgresql://usuario:password@localhost:5432/zoho_tracker

# App
PORT=3001
FRONTEND_URL=http://localhost:5173
```

> **IMPORTANTE:** El `ZOHO_REFRESH_TOKEN` se obtiene una sola vez desde Zoho API Console (Self Client → Generate Code → intercambiar por tokens). No expira. Guardarlo de forma segura.

---

## Lógica de autenticación con Zoho (zohoAuth.js)

Implementar un módulo que:

1. Use el `ZOHO_REFRESH_TOKEN` para obtener un nuevo `access_token` via POST a:
   ```
   POST https://accounts.zoho.com/oauth/v2/token
   grant_type=refresh_token&client_id=...&client_secret=...&refresh_token=...
   ```
2. Cachée el `access_token` en memoria con su tiempo de expiración (1 hora)
3. Exponga una función `getAccessToken()` que renueve automáticamente si está por vencer
4. Todas las llamadas a Zoho deben pasar por esta función antes de ejecutarse

---

## Sincronización con Zoho CRM (zohoSync.js)

### Filtro principal de oportunidades

Traer SOLO las oportunidades donde el campo custom `Pago_separacion` (tipo fecha) tenga algún valor (no sea null/vacío).

Llamada a la API:
```
GET https://www.zohoapis.com/crm/v2/Deals
  ?fields=<lista_de_campos>
  &criteria=(Pago_separacion:is_not_empty)
  &per_page=200
```

> **Nota:** El `api_name` exacto del campo `Pago separación` debe verificarse en:
> `GET /crm/v2/settings/fields?module=Deals`
> Buscar el campo por su label y usar su `api_name` en todas las consultas.

### Campos a traer de cada oportunidad

Construir la query con todos estos campos (ajustar `api_name` según lo que devuelva `/settings/fields`):

**Identificación y estado:**
- `Deal_Name` — Nombre de la oportunidad
- `Stage` — Etapa del negocio
- `Contact_Name` — Nombre del contacto relacionado
- `Account_Name` — Empresa/cuenta

**Información de contacto** (hacer llamada adicional a `/Contacts/{id}` si es necesario):
- Email del contacto
- Teléfono del contacto
- Identificación/cédula (si existe campo custom)

**Campos financieros en pesos (CO$)** — traer TODOS los campos que contengan montos:
Hacer primero `GET /crm/v2/settings/fields?module=Deals` y filtrar todos los campos donde `data_type === "currency"`. Guardar sus `api_name` y traerlos todos.

Campos financieros esperados (verificar nombres exactos):
- `Amount` — Valor total del negocio
- `Pago_separacion` — Fecha de pago separación *(campo tipo fecha, el filtro principal)*
- Todos los campos con prefijo o nombre relacionado a: cuota, abono, valor, precio, pago, saldo

**Referencia de recaudo:**
- Buscar campo custom con label similar a "Referencia de Recaudo" o "Referencia Recaudo"

**Sección Inmueble/Deal** — traer todos los campos del grupo/sección "Inmueble" o "Deal Info":
Usar `GET /crm/v2/settings/fields?module=Deals` y agrupar por `field_label` o `section_name`. Traer todos los campos de la sección que contenga "Inmueble".

Campos esperados en esta sección (verificar):
- Torre / Bloque
- Número de apartamento / unidad
- Área
- Piso
- Tipo de inmueble
- Proyecto
- Cualquier otro campo en esa sección

**Sección Cotización** — traer todos los campos de la sección "Cotización":
- Valor del inmueble
- Descuentos
- Forma de financiación
- Cualquier otro campo en esa sección

**Campos de tipo texto largo (formularios):**
- `Forma_de_pago` — campo tipo textarea o longtext con el detalle de la forma de pago
- `Propuesta_de_pago` — campo tipo textarea o longtext con la propuesta detallada

> **Estrategia recomendada:** Al iniciar la app por primera vez, ejecutar `GET /crm/v2/settings/fields?module=Deals` y guardar el JSON completo de campos en la base de datos (tabla `zoho_field_metadata`). Esto permite mapear correctamente los `api_name` y sus labels en español para mostrar en la UI.

---

## Schema de base de datos (Prisma)

```prisma
model Opportunity {
  id                    String   @id @default(uuid())
  zohoId                String   @unique
  dealName              String
  stage                 String?
  contactName           String?
  contactEmail          String?
  contactPhone          String?
  referenciaRecaudo     String?
  pagoSeparacion        DateTime?

  // Campos financieros (guardar como JSONB para flexibilidad)
  camposFinancieros     Json?    // { "Amount": 250000000, "Cuota_inicial": 50000000, ... }

  // Secciones completas como JSONB
  seccionInmueble       Json?    // Todos los campos de la sección Inmueble
  seccionCotizacion     Json?    // Todos los campos de la sección Cotización

  // Formularios de texto
  formaPago             String?  @db.Text
  propuestaPago         String?  @db.Text

  // Control de sincronización
  lastSyncedAt          DateTime @default(now())
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model ZohoFieldMetadata {
  id          String   @id @default(uuid())
  apiName     String   @unique
  fieldLabel  String
  dataType    String
  sectionName String?
  isCustom    Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model SyncLog {
  id          String   @id @default(uuid())
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  status      String   // 'success' | 'error' | 'running'
  recordsSync Int      @default(0)
  errorMsg    String?
}
```

---

## API REST interna (backend → frontend)

Implementar estos endpoints en Express:

```
GET  /api/opportunities          — Lista paginada con filtros
GET  /api/opportunities/:id      — Detalle completo de una oportunidad
POST /api/sync                   — Disparar sincronización manual
GET  /api/sync/status            — Último estado de sincronización
GET  /api/fields/metadata        — Lista de campos disponibles con sus labels
```

**Parámetros de filtro para GET /api/opportunities:**
- `?stage=` — filtrar por etapa
- `?search=` — buscar por nombre o referencia
- `?page=` y `?limit=` — paginación

---

## Sincronización automática

Usar `node-cron` para sincronizar cada hora:
```javascript
cron.schedule('0 * * * *', () => {
  syncOpportunitiesFromZoho();
});
```

Al iniciar el servidor, ejecutar una sincronización inicial si la base de datos está vacía.

---

## Diseño del frontend (área financiera)

### Dashboard principal

Mostrar una tabla con las siguientes columnas visibles por defecto:
1. Nombre de oportunidad
2. Contacto
3. Stage (con badge de color según etapa)
4. Pago separación (fecha formateada dd/mm/yyyy)
5. Valor total (CO$ formateado)
6. Referencia de recaudo
7. Última sincronización

Incluir:
- Barra de búsqueda por nombre o referencia
- Filtro por Stage (dropdown)
- Botón "Sincronizar ahora" con indicador de estado
- Indicador de última sincronización exitosa

### Vista detalle de oportunidad

Al hacer clic en una oportunidad mostrar una página de detalle organizada en **secciones colapsables**:

**Sección 1 — Resumen del negocio**
- Nombre, Stage (badge), Contacto con email y teléfono

**Sección 2 — Información del Inmueble**
- Todos los campos de `seccionInmueble` en formato grid 2 columnas
- Etiquetas en español (usar `ZohoFieldMetadata.fieldLabel`)

**Sección 3 — Cotización**
- Todos los campos de `seccionCotizacion` en formato grid 2 columnas
- Campos monetarios con formato `CO$ 1.250.000`

**Sección 4 — Plan de Pagos**
- Todos los `camposFinancieros` mostrados en tabla de 2 columnas: Campo | Valor
- Referencia de Recaudo destacada con fondo diferente
- Fecha Pago Separación destacada

**Sección 5 — Forma de Pago**
- Contenido de `formaPago` en área de texto con scroll, fondo gris claro
- Formato preservado (saltos de línea respetados)

**Sección 6 — Propuesta de Pago**
- Contenido de `propuestaPago` igual que anterior

---

## Formateo de valores monetarios

Implementar una función utilitaria `formatCOP(value)`:
```javascript
// Resultado esperado: "CO$ 1.250.000" o "CO$ 1.250.000.000"
const formatCOP = (value) => {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};
```

---

## Pasos de implementación sugeridos (en orden)

1. **Setup inicial:** Crear estructura de carpetas, instalar dependencias, configurar `.env`
2. **Base de datos:** Correr `prisma init`, definir schema, ejecutar `prisma migrate dev`
3. **Zoho Auth:** Implementar `zohoAuth.js` con refresh token y caché del access token
4. **Exploración de campos:** Llamar a `/crm/v2/settings/fields?module=Deals`, imprimir resultado en consola, identificar `api_name` exactos de todos los campos requeridos y guardarlos en `ZohoFieldMetadata`
5. **Sincronización:** Implementar `zohoSync.js` con el criterio de filtro y todos los campos identificados en el paso anterior
6. **API REST:** Implementar endpoints de Express con Prisma
7. **Frontend base:** Crear app React+Vite+Tailwind, implementar tabla del Dashboard
8. **Vista detalle:** Implementar página de detalle con secciones
9. **Cron job:** Agregar sincronización automática horaria
10. **README:** Documentar cómo levantar en local y cómo hacer deploy en Ubuntu 24.04

---

## Instrucciones importantes para Claude Code

- **Antes de hardcodear ningún `api_name`**, ejecutar `GET /crm/v2/settings/fields?module=Deals` y mostrar el resultado. Los nombres de campos custom en Zoho CRM suelen tener sufijos como `_c` o estar en formato `snake_case`. Nunca asumir el nombre — siempre verificarlo primero.

- **Para los campos de tipo currency**, filtrar del resultado anterior todos los campos donde `data_type === "currency"` y traerlos dinámicamente. No hardcodear lista de campos monetarios.

- **Para las secciones Inmueble y Cotización**, identificar los campos agrupados por `section_name` en la respuesta de `/settings/fields`. Traer y almacenar todos los campos de esas secciones como JSONB para no perder información.

- **Manejar paginación de Zoho:** La API devuelve máximo 200 registros por página. Implementar loop con `page` hasta que `info.more_records === false`.

- **Manejo de errores:** Si el access token expira (error 401 de Zoho), el módulo `zohoAuth.js` debe renovarlo automáticamente y reintentar la llamada una vez.

- **No exponer credenciales:** El `.env` nunca va al repositorio. Incluir `.env.example` con los nombres de las variables sin valores.

---

## Deploy en Ubuntu 24.04 (para cuando esté listo)

El README debe incluir estos pasos:
```bash
# Instalar Node.js 20, PostgreSQL, PM2
# Clonar repo, configurar .env
# cd backend && npm install && npx prisma migrate deploy && npm start (via PM2)
# cd frontend && npm install && npm run build (servir con Nginx)
```

Configurar PM2 para que el backend se reinicie automáticamente y Nginx como reverse proxy para el frontend.

---

## Resumen de dependencias

**Backend:**
```json
{
  "express": "^4.18",
  "prisma": "^5",
  "@prisma/client": "^5",
  "axios": "^1.6",
  "node-cron": "^3.0",
  "dotenv": "^16",
  "cors": "^2.8"
}
```

**Frontend:**
```json
{
  "react": "^18",
  "react-dom": "^18",
  "react-router-dom": "^6",
  "axios": "^1.6",
  "@tanstack/react-table": "^8",
  "tailwindcss": "^3",
  "date-fns": "^3"
}
```
