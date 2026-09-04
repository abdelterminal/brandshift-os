# Back up the database.
#
#   .\backup.ps1              # write a dump into .\backups\
#   .\backup.ps1 -Keep 30     # and delete dumps older than the last 30
#
# On this deployment the Postgres volume is the whole company: one machine, one
# volume, and everything anybody has typed into the app lives in it. There is
# no replica and no managed provider taking snapshots behind the scenes, so a
# disk failure without one of these files is the end of the data.
#
# `pg_dump` runs *inside* the container, so nothing has to be installed on this
# machine. The output is a plain SQL file -- larger than the custom format, and
# readable, which matters when the thing you are restoring from is the only
# copy you have and you want to see that it is not empty before trusting it.

[CmdletBinding()]
param(
    # How many dumps to keep. 0 keeps all of them.
    [int]$Keep = 30,
    [string]$OutDir = (Join-Path $PSScriptRoot "backups")
)

$ErrorActionPreference = "Stop"

# --- Config, read from .env so this and the app cannot disagree -------------

$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "No .env found. Copy .env.example to .env first." -ForegroundColor Red
    exit 1
}

$config = @{}
foreach ($line in Get-Content $envPath) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $split = $trimmed.IndexOf("=")
    if ($split -lt 1) { continue }
    $config[$trimmed.Substring(0, $split).Trim()] = $trimmed.Substring($split + 1).Trim()
}

$dbUser = $config["POSTGRES_USER"]
$dbName = $config["POSTGRES_DB"]

if (-not $dbUser -or -not $dbName) {
    Write-Host "POSTGRES_USER and POSTGRES_DB must be set in .env." -ForegroundColor Red
    exit 1
}

# --- The container has to be up ---------------------------------------------

$container = (docker compose ps -q db 2>$null)
if (-not $container) {
    Write-Host "The db container is not running. Start it with:" -ForegroundColor Red
    Write-Host "  docker compose up -d db" -ForegroundColor Yellow
    exit 1
}

# --- Dump --------------------------------------------------------------------

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $OutDir "brandshift-$stamp.sql"

Write-Host "Backing up $dbName..." -ForegroundColor Cyan

# --clean --if-exists so the dump can be restored over an existing database
# without a pile of "already exists" errors that hide the real one.
docker compose exec -T db pg_dump -U $dbUser -d $dbName --clean --if-exists |
    Out-File -FilePath $target -Encoding utf8

if ($LASTEXITCODE -ne 0) {
    Write-Host "pg_dump failed. Nothing was written." -ForegroundColor Red
    if (Test-Path $target) { Remove-Item $target }
    exit 1
}

# A dump that exists but is empty is worse than no dump: it looks like a
# backup. Anything under 50KB is not this schema with data in it.
$size = (Get-Item $target).Length
if ($size -lt 50KB) {
    Write-Host "The dump is only $size bytes, which is too small to be real. Kept for" -ForegroundColor Red
    Write-Host "inspection at $target, but do not trust it." -ForegroundColor Red
    exit 1
}

Write-Host "Wrote $target ($([math]::Round($size / 1MB, 2)) MB)" -ForegroundColor Green

# --- Prune -------------------------------------------------------------------

if ($Keep -gt 0) {
    $old = Get-ChildItem -Path $OutDir -Filter "brandshift-*.sql" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $Keep

    foreach ($file in $old) {
        Remove-Item $file.FullName
        Write-Host "Removed old backup $($file.Name)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "To restore this dump over the current database:" -ForegroundColor Cyan
Write-Host "  Get-Content '$target' | docker compose exec -T db psql -U $dbUser -d $dbName" -ForegroundColor Yellow
Write-Host ""
Write-Host "Restoring replaces everything. Take a backup first." -ForegroundColor DarkGray
