# StudyForge – Einrichtung für Windows 10/11 (wird von setup.cmd aufgerufen)
#
# 1. Prüfen, ob Node.js 22.5 oder neuer vorhanden ist.
# 2. Falls nicht: nach Rückfrage eine portable Node-Version von nodejs.org in
#    den Projektordner (runtime\node) laden – ohne Administratorrechte, mit
#    Prüfung der SHA-256-Prüfsumme.
# 3. Optional eine Desktop-Verknüpfung anlegen.
# 4. Einrichtung prüfen.
# Es werden keine Systemeinstellungen verändert und keine Daten gelöscht.

param(
  [switch]$Yes,
  [switch]$NoShortcut,
  [switch]$Test
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$NodeVersion = '22.23.3'   # getestete LTS-Version
$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root 'runtime\node'

function Ask([string]$Question) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Question [j/N]"
  return $answer -match '^(j|ja|y|yes)$'
}

function Test-NodeOk([string]$Exe) {
  try {
    # Ohne doppelte Anführungszeichen: Windows PowerShell 5.1 gibt sie an Programme nicht korrekt weiter.
    & $Exe -e 'const v=process.versions.node.split(''.'').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=5)?0:1)' 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

Write-Host '=============================================='
Write-Host ' StudyForge – Einrichtung'
Write-Host '=============================================='
Write-Host ''

# ------------------------------------------------------------ 1. Node.js suchen
$Node = $null
$candidates = @((Join-Path $RuntimeDir 'node.exe'))
$found = Get-Command node -ErrorAction SilentlyContinue
if ($found) { $candidates += $found.Source }
foreach ($candidate in $candidates) {
  if (-not (Test-Path $candidate)) { continue }
  if (Test-NodeOk $candidate) { $Node = $candidate; break }
  Write-Host "Gefunden, aber zu alt: $candidate ($(& $candidate -v))"
}

# ------------------------------------------------------------ 2. ggf. portable Node laden
if (-not $Node) {
  Write-Host 'Node.js 22.5 oder neuer wurde nicht gefunden.'
  Write-Host ''
  switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { $Arch = 'x64' }
    'ARM64' { $Arch = 'arm64' }
    'x86'   { $Arch = 'x86' }
    default { Write-Host "Prozessorarchitektur $($env:PROCESSOR_ARCHITECTURE) wird nicht unterstützt. Bitte Node.js $NodeVersion von nodejs.org installieren."; exit 1 }
  }
  $Name = "node-v$NodeVersion-win-$Arch"
  $Base = "https://nodejs.org/dist/v$NodeVersion"
  Write-Host 'Das Setup kann eine portable Node.js-Version laden:'
  Write-Host "  Quelle: $Base/$Name.zip  (ca. 30 MB)"
  Write-Host "  Ziel:   $RuntimeDir"
  Write-Host '  Keine Administratorrechte nötig; nur dieser Schritt braucht Internet.'
  Write-Host ''
  if (-not (Ask 'Jetzt herunterladen?')) {
    Write-Host ''
    Write-Host "Abgebrochen. Alternativ Node.js $NodeVersion (oder neuer, mindestens 22.5) selbst"
    Write-Host 'installieren und setup.cmd erneut ausführen. Anleitung: ANLEITUNG.md'
    exit 1
  }

  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ("studyforge-setup-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    $Zip = Join-Path $Tmp 'node.zip'
    $Sums = Join-Path $Tmp 'SHASUMS256.txt'
    Write-Host "Lade $Name.zip …"
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Name.zip" -OutFile $Zip
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHASUMS256.txt" -OutFile $Sums
    $line = Get-Content $Sums | Where-Object { $_ -match "\s$([regex]::Escape("$Name.zip"))$" } | Select-Object -First 1
    $expected = if ($line) { ($line -split '\s+')[0].ToLower() } else { '' }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Zip).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) {
      Write-Host 'Prüfsumme stimmt NICHT überein – die Datei wird nicht verwendet.'
      Write-Host "  erwartet: $expected"
      Write-Host "  erhalten: $actual"
      exit 1
    }
    Write-Host "Prüfsumme in Ordnung (SHA-256 $actual)."
    Expand-Archive -Path $Zip -DestinationPath (Join-Path $Tmp 'x')
    if (Test-Path $RuntimeDir) {
      $old = "$RuntimeDir.alt-$(Get-Date -Format yyyyMMddHHmmss)"
      Move-Item $RuntimeDir $old
      Write-Host "Vorhandene Version verschoben nach: $old"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $RuntimeDir) | Out-Null
    Move-Item (Join-Path $Tmp "x\$Name") $RuntimeDir
  } catch {
    Write-Host "Download oder Entpacken fehlgeschlagen: $($_.Exception.Message)"
    exit 1
  } finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
  }
  $Node = Join-Path $RuntimeDir 'node.exe'
  if (-not (Test-NodeOk $Node)) { Write-Host 'Die geladene Node-Version startet nicht.'; exit 1 }
  Write-Host "Portable Node.js installiert: $Node"
}

Write-Host "Node.js: $Node ($(& $Node -v))"

# ------------------------------------------------------------ 3. Desktop-Verknüpfung
if (-not $NoShortcut) {
  Write-Host ''
  if (Ask 'Verknüpfung „StudyForge“ auf dem Desktop anlegen?') {
    try {
      $desktop = [Environment]::GetFolderPath('Desktop')
      $shell = New-Object -ComObject WScript.Shell
      $link = $shell.CreateShortcut((Join-Path $desktop 'StudyForge.lnk'))
      $link.TargetPath = Join-Path $Root 'start.cmd'
      $link.WorkingDirectory = $Root
      $link.IconLocation = (Join-Path $Root 'public\favicon.ico')
      $link.Description = 'StudyForge – persönliches Lernzentrum (lokal, offline)'
      $link.Save()
      Write-Host "Verknüpfung angelegt: $(Join-Path $desktop 'StudyForge.lnk')"
    } catch {
      Write-Host "Verknüpfung konnte nicht angelegt werden: $($_.Exception.Message)"
    }
  }
}

# ------------------------------------------------------------ 4. Prüfen
Write-Host ''
Push-Location $Root
try {
  & $Node --disable-warning=ExperimentalWarning scripts\setup-check.js
  if ($LASTEXITCODE -ne 0) { exit 1 }
  if ($Test) {
    Write-Host ''
    Write-Host 'Automatische Tests laufen …'
    $out = & $Node --disable-warning=ExperimentalWarning --test 'test/*.test.js' 2>&1 | Out-String
    $out -split "`n" | Where-Object { $_ -match '^# (tests|pass|fail)' } | ForEach-Object { Write-Host $_ }
    if ($out -notmatch '(?m)^# fail 0\s*$') { Write-Host 'Mindestens ein Test ist fehlgeschlagen.'; exit 1 }
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Fertig. StudyForge starten: start.cmd doppelklicken (oder die Desktop-Verknüpfung).'
Write-Host 'Beenden: Strg+C im Startfenster oder stop.cmd doppelklicken.'
Write-Host 'Anleitung: ANLEITUNG.md'
exit 0
