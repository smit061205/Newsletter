# Capital Kranti -- setup for a Windows PC. Run by "Install Capital Kranti.cmd".
# Safe to run again: it updates what's there.
#
#  1. Node.js 22 and Git (with winget, if missing)
#  2. the app in %LOCALAPPDATA%\CapitalKranti (a copy of the project from GitHub)
#  3. its parts: npm packages, the Chromium the engine lays pages out with
#  4. the paper's Gopika fonts, from a folder you choose
#  5. a GitHub sign-in, for the newsroom's Publish button
#  6. the newsroom website, built for this PC
#  7. "Capital Kranti" on the desktop and in the Start menu
#  8. start at log-in, and wake the PC at 7:55 PM for the 8 PM run
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/smit061205/Newsletter.git"
$App = Join-Path $env:LOCALAPPDATA "CapitalKranti"

function Say($s) { Write-Host "`n== $s" -ForegroundColor Cyan }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Need-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "This PC has no winget (Windows' app installer). Install 'App Installer' from the Microsoft Store, then run this again."
  }
}

Say "1/8  Node.js and Git"
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = (node -v).TrimStart("v").Split(".")
  $nodeOk = ([int]$v[0] -gt 22) -or ([int]$v[0] -eq 22 -and [int]$v[1] -ge 5)
}
if (-not $nodeOk) {
  Need-Winget
  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  Refresh-Path
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Need-Winget
  winget install --id Git.Git --exact --silent --accept-package-agreements --accept-source-agreements
  Refresh-Path
}
node -v; git --version

Say "2/8  The app ($App)"
if (Test-Path (Join-Path $App ".git")) {
  git -C $App pull --ff-only
} else {
  git clone $Repo $App
}
Set-Location $App
if (-not (git config user.name)) { git config user.name "Capital Kranti newsroom" }
if (-not (git config user.email)) { git config user.email "newsroom@capitalkranti.in" }

Say "3/8  Its parts (a few minutes the first time)"
npm ci --no-audit --no-fund
npx playwright install chromium

Say "4/8  The paper's fonts"
$fontDir = Join-Path $App "publications\capital-kranti\fonts"
if (-not (Test-Path (Join-Path $fontDir "gopika-two-regular.ttf"))) {
  Add-Type -AssemblyName System.Windows.Forms
  $pick = New-Object System.Windows.Forms.FolderBrowserDialog
  $pick.Description = "Choose the folder with the Gopika fonts (B Bharati GopikaTwo Normal, Bold, BoldItalic, GopikalightTwo)"
  if ($pick.ShowDialog() -ne "OK") { throw "No font folder chosen: run the installer again when you have the Gopika fonts." }
  node scripts\install-fonts.mjs $pick.SelectedPath
  if ($LASTEXITCODE -ne 0) { throw "The Gopika fonts weren't all in that folder." }
} else { Write-Host "  already installed" }

Say "5/8  GitHub sign-in (for the Publish button)"
Write-Host "  A browser window may open: sign in to the GitHub account that owns the website's project."
git credential-manager github login 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  Skipped: the first Publish will ask you to sign in instead." }

Say "6/8  The newsroom website"
npm run build --prefix web

Say "7/8  Shortcuts"
$launcher = Join-Path $App "windows\launch.ps1"
$target = "powershell.exe"
$targs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath("Desktop"), (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"))) {
  $lnk = $shell.CreateShortcut((Join-Path $dir "Capital Kranti.lnk"))
  $lnk.TargetPath = $target
  $lnk.Arguments = $targs
  $lnk.WorkingDirectory = $App
  $lnk.IconLocation = (Join-Path $App "windows\capital-kranti.ico")
  $lnk.Description = "Capital Kranti newsroom"
  $lnk.Save()
}

Say "8/8  Start at log-in, and the 8 PM run"
$action = New-ScheduledTaskAction -Execute $target -Argument "$targs -Background" -WorkingDirectory $App
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "Capital Kranti (start)" -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null
$wake = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "Capital Kranti (evening run)" -Action $action -Trigger (New-ScheduledTaskTrigger -Daily -At "19:55") -Settings $wake -Force | Out-Null
Write-Host "  If the PC sleeps in the evening, turn on 'Allow wake timers' (Control Panel > Power Options > Change plan settings > Advanced)."

Say "Done. Opening the newsroom..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher
Write-Host "`nFrom now on, open 'Capital Kranti' from the desktop." -ForegroundColor Green
Write-Host "In the newsroom, go to Settings and paste the OpenRouter key once." -ForegroundColor Green
