# The desktop shortcut "Capital Kranti": starts the engine and the newsroom
# (scripts/launch.mjs) and opens the newsroom in the browser.
#   -Background  start without opening the browser (at log-in, the 8 PM wake)
#   -Stop        stop both;  -Update  get the latest version and restart
param([switch]$Background, [switch]$Stop, [switch]$Update)
$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$App = Split-Path -Parent $PSScriptRoot
Set-Location $App
$a = @()
if ($Background) { $a += "--background" }
if ($Stop) { $a += "--stop" }
if ($Update) { $a += "--update" }
New-Item -ItemType Directory -Force -Path (Join-Path $App "logs") | Out-Null
node scripts\launch.mjs @a *>> (Join-Path $App "logs\launcher.log")
if ($LASTEXITCODE -ne 0 -and -not $Background) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Capital Kranti couldn't start. The details are in $App\logs.", "Capital Kranti") | Out-Null
}
