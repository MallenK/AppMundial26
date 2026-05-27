# 🌍 AppMundial26 — Mundial FIFA 2026

Web pública para seguir el Mundial FIFA 2026 en tiempo real con predicciones, comentarios en directo y rankings de amigos.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite + shadcn/ui + TailwindCSS |
| Backend | Node.js 20 + Express 5 + TypeScript |
| Base de datos | Neon PostgreSQL |
| Auth | Better Auth (Google + email) |
| Realtime | Socket.io + Upstash Redis adapter |
| Cache | Upstash Redis |
| Live scores | api-football.com (RapidAPI) |
| Datos estáticos | football-data.org |
| Imágenes | Cloudflare R2 |
| Deploy Frontend | Vercel |
| Deploy Backend | Render |

## Estructura

```
AppMundial26/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Express backend
└── packages/
    └── shared/       # Tipos TypeScript compartidos
```

## Setup local

### 1. Prerrequisitos

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Cuentas en: Neon, Upstash, api-football.com (RapidAPI), football-data.org, Cloudflare R2, Google Cloud Console

### 2. Variables de entorno

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edita apps/api/.env con tus credenciales

# Frontend
cp apps/web/.env.example apps/web/.env
# Edita apps/web/.env
```

### 3. Instalar dependencias

```bash
pnpm install
```

### 4. Crear base de datos

1. Crea un proyecto en [neon.com](https://neon.com)
2. Copia el connection string a `DATABASE_URL` en `apps/api/.env`
3. Ejecuta las migraciones:

```bash
cd apps/api
pnpm db:migrate
```

### 5. Configurar Google OAuth

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto → APIs & Services → Credentials → OAuth 2.0 Client ID
3. Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`
4. Copia Client ID y Secret a tu `.env`

### 6. Configurar api-football.com

1. Regístrate en [RapidAPI](https://rapidapi.com/api-sports/api/api-football)
2. Suscríbete al plan gratuito (100 req/día)
3. Copia la API key a `API_FOOTBALL_KEY`

> ⚠️ Para el Mundial, necesitarás el plan Basic ($10/mes) para aguantar múltiples partidos simultáneos

### 7. Configurar football-data.org

1. Regístrate en [football-data.org](https://www.football-data.org/client/register)
2. Copia el token a `FOOTBALL_DATA_KEY`

### 8. Configurar Upstash Redis

1. Crea una DB en [upstash.com](https://upstash.com) → Redis
2. Copia la URL `rediss://...` a `UPSTASH_REDIS_URL`

### 9. Configurar Cloudflare R2

1. Crea cuenta en [cloudflare.com](https://cloudflare.com)
2. R2 → Create bucket → nombre: `mundial26-photos`
3. Habilita "Public Access" en el bucket
4. Crea API Token con permisos R2
5. Copia Account ID, Access Key, Secret Key

### 10. Ejecutar en desarrollo

```bash
# Terminal 1 — Backend (puerto 3001)
cd apps/api
pnpm dev

# Terminal 2 — Frontend (puerto 5173)
cd apps/web
pnpm dev
```

Abre [http://localhost:5173](http://localhost:5173)

## Deploy en producción

### Backend → Render

1. Conecta tu repositorio a [render.com](https://render.com)
2. New Web Service → selecciona `apps/api`
3. Usa el `render.yaml` incluido
4. Añade todas las env vars en el dashboard
5. Deploy

### Frontend → Vercel

1. Importa el repo en [vercel.com](https://vercel.com)
2. Root Directory: `apps/web`
3. Framework: Vite
4. Añade `VITE_API_URL=https://tu-api.onrender.com/api`
5. Deploy

## Funcionalidades MVP

- [x] Home con partidos del día, en vivo y próximos
- [x] Clasificación de grupos
- [x] Página de partido con marcador live (Socket.io)
- [x] Timeline de eventos (goles, tarjetas, cambios)
- [x] Alineaciones y estadísticas
- [x] Predicciones con sistema de puntos (+3/+5)
- [x] Ranking global de predicciones
- [x] Comentarios en tiempo real
- [x] Subida de fotos (Cloudflare R2)
- [x] Perfiles de usuario
- [x] Follow/unfollow entre usuarios
- [x] Ranking de amigos
- [x] Comparador de jugadores
- [x] Auth con Google + email/password

## Límites gratuitos importantes

| Servicio | Límite | Acción si se supera |
|---------|--------|---------------------|
| api-football.com | 100 req/día | Upgrade $10/mes durante torneo |
| Neon | 0.5 GB DB | Monitor uso; solo URLs en DB |
| Upstash | 500K cmd/mes | Ajustar TTL cache |
| Cloudflare R2 | 10 GB storage | Gratis para World Cup |
| Render free | Cold start 15-30s | Cron keep-alive cada 14min |

## Arquitectura de datos en tiempo real

```
api-football.com → Cron job (30s) → PostgreSQL → Socket.io → Clientes
                                               ↑
                                         Cambio detectado
```

Un solo cron job sirve a todos los clientes conectados — eficiente.

## Licencia

MIT
