# 🚀 VoiceToText - Guía de Despliegue

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Python | 3.9+ |
| Node.js | 18+ |
| npm | 9+ |

---

## 1. Setup rápido (Windows)


```bash
cd frontend
npm install
npm run dev
```

---



## 5. Despliegue en producción

### Opción A — Servidor directo

#### Frontend Next.js

```bash
cd frontend
npm run build
npm run start    # Sirve en :3000
```

Con PM2:

```bash
pm2 start "npm run start" --name voicetotext-frontend --cwd ./frontend
```

### Opción B — Docker

Crear `docker-compose.yml` en la raíz:
