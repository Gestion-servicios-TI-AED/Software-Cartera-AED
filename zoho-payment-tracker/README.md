# Zoho Payment Tracker

Aplicación web para seguimiento de **planes de pago e información de oportunidades** de Zoho CRM. Orientada al área financiera de una empresa inmobiliaria.

## Stack

- **Backend:** Node.js + Express + Prisma ORM
- **Base de datos:** PostgreSQL
- **Frontend:** React + Vite + TailwindCSS
- **Autenticación Zoho:** OAuth 2.0 con Refresh Token
- **Scheduler:** node-cron (sincronización horaria)

---

## Cómo levantar en local

### Requisitos previos

- Node.js 20+
- PostgreSQL 14+
- Credenciales de Zoho CRM (Client ID, Client Secret, Refresh Token)

### 1. Configurar backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales reales
npm install
npx prisma migrate dev --name init
npm run dev
```

### 2. Configurar frontend

```bash
cd frontend
npm install
npm run dev
```

La app estará disponible en `http://localhost:5173`. El backend corre en `http://localhost:3001`.

### Obtener credenciales de Zoho

1. Ir a [Zoho API Console](https://api-console.zoho.com/)
2. Crear un **Self Client**
3. Generar un código con los scopes: `ZohoCRM.modules.deals.READ,ZohoCRM.settings.fields.READ,ZohoCRM.modules.contacts.READ`
4. Intercambiar el código por tokens:
   ```bash
   curl -X POST https://accounts.zoho.com/oauth/v2/token \
     -d "grant_type=authorization_code&client_id=TU_CLIENT_ID&client_secret=TU_SECRET&redirect_uri=https://www.zoho.com&code=TU_CODIGO"
   ```
5. Guardar el `refresh_token` en `.env` (no expira)

---

## Deploy en Ubuntu 24.04 (Hostinger VPS)

### 1. Instalar dependencias del servidor

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql && sudo systemctl enable postgresql

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install nginx -y
```

### 2. Crear base de datos

```bash
sudo -u postgres psql -c "CREATE USER zoho_user WITH PASSWORD 'tu_password';"
sudo -u postgres psql -c "CREATE DATABASE zoho_tracker OWNER zoho_user;"
```

### 3. Deploy del backend

```bash
cd /var/www/zoho-payment-tracker/backend
cp .env.example .env
# Editar .env con credenciales de producción
npm install
npx prisma migrate deploy
pm2 start src/index.js --name zoho-backend
pm2 save && pm2 startup
```

### 4. Build y serve del frontend

```bash
cd /var/www/zoho-payment-tracker/frontend
npm install
npm run build
# Los archivos estáticos quedan en dist/
```

### 5. Configurar Nginx

```nginx
# /etc/nginx/sites-available/zoho-tracker
server {
    listen 80;
    server_name tu-dominio.com;

    # Frontend
    location / {
        root /var/www/zoho-payment-tracker/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zoho-tracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/opportunities` | Lista paginada (filtros: `?stage=`, `?search=`, `?page=`, `?limit=`) |
| GET | `/api/opportunities/:id` | Detalle completo |
| GET | `/api/opportunities/stages` | Etapas únicas disponibles |
| POST | `/api/sync` | Disparar sincronización manual |
| GET | `/api/sync/status` | Estado de la última sincronización |
| GET | `/api/fields/metadata` | Metadatos de campos de Zoho |
| GET | `/api/health` | Health check |
