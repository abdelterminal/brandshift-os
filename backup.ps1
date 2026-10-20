# Back up the database and the uploaded files.
#
#   .\backup.ps1              # write a dump and a files archive into .\backups\
#   .\backup.ps1 -Keep 30     # and delete all but the last 30 of each
#
# On this deployment the two Docker volumes are the whole company: one machine,
# no replica, no managed provider taking snapshots behind the scenes, so a disk
# failure without these files is the end of the data.
#
# Two things come out of a run, and both matter. The SQL dump is everything
# anybody typed. The `-files.tgz` is everything anybody attached to a brief --
# a signed proposal, the photographs a job is judged against -- and unlike a
# row, nobody can retype those. A run that produces only one of the two exits
# non-zero and says so.
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

# --- Uploaded files ----------------------------------------------------------
#
# The database is no longer the whole company. Brief attachments -- a signed
# proposal, the photographs a job is judged against -- live on the
# `uploads-data` volume, and unlike a row nobody can retype them.
#
# This is the half that made attachments defensible in the first place: file
# storage was refused for a long time on the grounds that a file nobody backs
# up looks like safekeeping while being the opposite. A run that dumps the
# database and silently skips the files would be exactly that, so this exits
# non-zero if it cannot write them. Half a backup reporting success is the
# failure the whole argument was about.
#
# Tarred from inside a throwaway container, so nothing has to be installed
# here and the volume does not have to be mounted on this machine.

$filesTarget = Join-Path $OutDir "brandshift-$stamp-files.tgz"

Write-Host "Backing up uploaded files..." -ForegroundColor Cyan

# Ask Compose for the volume's real name rather than deriving it. The project
# prefix is the directory name with some characters removed, the rule is not
# worth reimplementing, and COMPOSE_PROJECT_NAME can override it anyway -- a
# guess that is wrong reads as "no files to back up", which is the one wrong
# answer this script must never give quietly.
try {
    $composed = docker compose config --format json | ConvertFrom-Json
    $volume = $composed.volumes.'uploads-data'.name
} catch {
    $volume = $null
}

if (-not $volume) {
    Write-Host "Could not work out the uploads volume name from docker compose." -ForegroundColor Red
    Write-Host "The database dump at $target is good, but no files were saved." -ForegroundColor Red
    exit 1
}

# Not `docker compose ps -q app`: files should be backed up whether or not the
# app happens to be running, and the volume exists either way.
$exists = (docker volume ls --quiet --filter "name=^$volume$")
if (-not $exists) {
    Write-Host "The uploads volume '$volume' does not exist yet." -ForegroundColor Red
    Write-Host "The database dump at $target is good, but no files were saved." -ForegroundColor Red
    Write-Host "It is created on the first `docker compose up` after this change." -ForegroundColor Yellow
    exit 1
}

# The container writes the archive straight into the output directory rather
# than streaming it through PowerShell. A pipeline here would decode the tar
# as text and corrupt it -- quietly, producing a file of roughly the right
# size that cannot be extracted, which is the worst possible failure for a
# backup.
$outFull = (Resolve-Path $OutDir).Path
docker run --rm `
    -v "${volume}:/data:ro" `
    -v "${outFull}:/backup" `
    alpine tar -czf "/backup/$(Split-Path $filesTarget -Leaf)" -C /data .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Archiving the uploads volume failed." -ForegroundColor Red
    Write-Host "The database dump at $target is good, but no files were saved." -ForegroundColor Red
    if (Test-Path $filesTarget) { Remove-Item $filesTarget }
    exit 1
}

# An empty volume is legitimate -- nobody may have attached anything yet -- so
# unlike the dump there is no minimum size here. An empty tar is about 45
# bytes and says, truthfully, that there was nothing to save.
$filesSize = (Get-Item $filesTarget).Length
Write-Host "Wrote $filesTarget ($([math]::Round($filesSize / 1MB, 2)) MB)" -ForegroundColor Green

# --- Prune -------------------------------------------------------------------

if ($Keep -gt 0) {
    # Each kind pruned against its own count, so -Keep 30 means thirty of
    # each rather than thirty files between them -- otherwise the pair taken
    # on the same run would be split up and a dump kept whose files were not.
    foreach ($pattern in @("brandshift-*.sql", "brandshift-*-files.tgz")) {
        $old = Get-ChildItem -Path $OutDir -Filter $pattern |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip $Keep

        foreach ($file in $old) {
            Remove-Item $file.FullName
            Write-Host "Removed old backup $($file.Name)" -ForegroundColor DarkGray
        }
    }
}

Write-Host ""
Write-Host "To restore this dump over the current database:" -ForegroundColor Cyan
Write-Host "  Get-Content '$target' | docker compose exec -T db psql -U $dbUser -d $dbName" -ForegroundColor Yellow
Write-Host ""
Write-Host "Restoring replaces everything. Take a backup first." -ForegroundColor DarkGray
