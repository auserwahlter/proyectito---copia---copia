# ─────────────────────────────────────────────────────────────
#  LUTA E DANÇA — Respaldo de la base de datos
#  Crea un volcado lógico completo (esquema + datos) llamando a
#  pg_dump. Requiere:
#    * PostgreSQL levantado y accesible (misma URL que .env)
#    * pg_dump disponible en el PATH (paquete binario de PostgreSQL)
#
#  Se recomienda ejecutarlo ANTES de aplicar migraciones.sql o
#  de levantar la nueva versión del backend.
#  Carpeta de salida: .\respaldo\
#     * Si no existe el script con timestamps automáticos... usa
#       el nombre generado automáticamente en cada ejecución.
# ─────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env'
$envVars = @{}
if (Test-Path -LiteralPath $envPath) {
    Get-Content -LiteralPath $envPath | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*$') {
            $envVars[$matches[1]] = $matches[2]
        }
    }
}

$dbUrl = $envVars['DATABASE_URL']
if (-not $dbUrl) { $dbUrl = 'postgresql://postgres:1234@localhost:54869/luta_danca' }

$outDir = Join-Path $PSScriptRoot '..\respaldo'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $outDir "respaldo-$stamp.sql"

Write-Host "Respaldo de $dbUrl"
Write-Host "Destino: $outFile"

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host 'ADVERTENCIA: pg_dump no está en el PATH.' -ForegroundColor Yellow
    Write-Host 'Instala el cliente PostgreSQL o añádelo al PATH y vuelve a ejecutar este script.'
    Write-Host 'Sin pg_dump no se puede generar el volcado automáticamente.' -ForegroundColor Yellow
    exit 1
}

# Timeout por defecto del comando: 20 minutos
$timeoutSeconds = 1200
$proc = Start-Process -FilePath 'pg_dump' -ArgumentList @($dbUrl) -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError (Join-Path $outDir 'respaldo-error.log')
if (-not $proc.WaitForExit($timeoutSeconds * 1000)) {
    Write-Host 'El respaldo superó el tiempo límite. Revisa respaldo/respaldo-error.log.' -ForegroundColor Yellow
    $proc.Kill()
    exit 1
}

if ($proc.ExitCode -eq 0) {
    Write-Host "Respaldo completado: $outFile" -ForegroundColor Green
} else {
    Write-Host 'El respaldo falló. Revisa respaldo/respaldo-error.log.' -ForegroundColor Red
    exit 1
}