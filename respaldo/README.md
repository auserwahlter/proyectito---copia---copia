# Respaldo de base de datos

Esta carpeta guarda los volcados SQL de la base de datos (`pg_dump`) generados con:

```powershell
.\scripts\respaldo.ps1
```

## Cuándo respaldar

> **ANTES** de aplicar `migraciones.sql` o de levantar la nueva versión del backend.

## Requisitos

- PostgreSQL levantado y accesible (ver `DATABASE_URL` en `.env`).
- `pg_dump` en el PATH (se incluye en el instalador de PostgreSQL, carpeta `bin`).

## Restaurar

```bash
psql "$DATABASE_URL" < respaldo\respaldo-AAAAMMDD-HHMMSS.sql
```