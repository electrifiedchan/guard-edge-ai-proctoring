<#
    G.U.A.R.D. - Edge-AI Proctoring : one-time machine setup.

    Run this once on a fresh Windows PC and it turns a bare clone (or an
    unzipped copy) into a working install, then tells you to launch
    startapp.bat. It is safe to re-run: every step checks whether it is
    already done and skips rather than redoing the download.

    KEEP THIS FILE PURE ASCII.
    PowerShell 5.1 - still the default powershell.exe on Windows 11 - decodes a
    .ps1 with no byte-order mark as Windows-1252, not UTF-8. An em-dash then
    arrives as three CP1252 characters ending in U+201D, which PowerShell
    accepts as a real string delimiter, so one "harmless" dash in a comment
    silently opens a string and the whole script stops parsing. Plain ASCII
    parses identically under every encoding guess, so no dashes, arrows or
    box-drawing characters below.

    WHY A SCRIPT AND NOT AN .EXE
    The local LLM (Ollama) ships as its own installer plus a ~2 GB model pull,
    so no single bundled binary can avoid a setup step anyway. Meanwhile torch,
    ultralytics and faster-whisper are among the hardest packages to freeze
    correctly, and a frozen build hides the errors that matter. A script fails
    loudly with a line number, which is what you want on someone else's PC.

    WHAT A PLAIN `git clone` DOES *NOT* GIVE YOU - the reason this exists:
      * yolov8s.pt        `*.pt` is gitignored, so no detector weights
      * backend/.env      gitignored, so no API keys and no LLM
      * venv/             gitignored, ~1.4 GB of Python packages
      * node_modules/     gitignored, ~0.5 GB of frontend packages
      * the Ollama model  lives outside the repo entirely
    Each of the five is handled below, in that order of likelihood-to-bite.

    USAGE
      setup.bat                     full setup (recommended)
      setup.bat -SkipOllama         skip the ~2 GB local model (cloud only)
      setup.bat -SkipFrontend       backend only
      setup.bat -Force              redo steps that already look complete
#>

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$SkipOllama,
    [switch]$SkipFrontend,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

# Everything printed also goes to a log, so a failure on someone else's machine
# can be diagnosed by sending one file instead of describing a wall of red text.
$LogPath = Join-Path $Root 'setup-log.txt'
try { Start-Transcript -Path $LogPath -Force | Out-Null } catch { }

# ---- Model and tool versions this project expects --------------------------
# OllamaModel mirrors OLLAMA_DEFAULT_MODEL in backend/core_memory/llm_config.py
# and YoloWeights mirrors the YOLO("yolov8s.pt") call in backend/edge_main.py.
# If either changes there, change it here too: the two are not linked.
$OllamaModel  = 'qwen2.5:3b'
$YoloWeights  = 'yolov8s.pt'
$WhisperModel = 'tiny.en'
$MinNodeMajor = 20              # Next.js 16 refuses to build on older Node
$GoodPython   = @('3.10', '3.11', '3.12')
$BestPython   = '3.10'          # what the project was built and tested on

$script:Warnings = New-Object System.Collections.ArrayList

# ---- Console helpers ------------------------------------------------------
function Write-Head($t) {
    Write-Host ''
    Write-Host ('=' * 68) -ForegroundColor DarkCyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ('=' * 68) -ForegroundColor DarkCyan
}
function Write-Step($t) { Write-Host ''; Write-Host "-- $t" -ForegroundColor White }
function Write-Ok($t)   { Write-Host "   [ok]   $t" -ForegroundColor Green }
function Write-Info($t) { Write-Host "   ....   $t" -ForegroundColor Gray }
function Write-Warn2($t) {
    Write-Host "   [warn] $t" -ForegroundColor Yellow
    [void]$script:Warnings.Add($t)
}
function Write-Fail($t) { Write-Host "   [FAIL] $t" -ForegroundColor Red }

function Test-Tool($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# Never print a key back to the screen or into the transcript.
function Show-Mask($label, $val) {
    if ($val) {
        if ($val.Length -ge 4) { $tail = $val.Substring($val.Length - 4) } else { $tail = '****' }
        Write-Ok "$label set (ends ...$tail)"
    } else {
        Write-Info "$label left empty"
    }
}

# Native commands do not throw on failure, they only set $LASTEXITCODE, so every
# external call goes through this to turn a silent non-zero into a hard stop.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [string]$What, [string]$WorkDir)

    $prev = $null
    if ($WorkDir) { $prev = Get-Location; Set-Location $WorkDir }
    try {
        # Out-Host, not a bare call: a PowerShell function returns everything
        # written to its output stream, so letting pip's chatter fall through
        # would make Try-Native return [output..., $false], and a non-empty
        # array is truthy, so a failed step would read as a success.
        & $Exe @Arguments | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "$What failed (exit code $LASTEXITCODE): $Exe $($Arguments -join ' ')"
        }
    } finally {
        if ($prev) { Set-Location $prev }
    }
}

# Same, but a non-zero exit is reported and swallowed. Used for optional extras:
# a failed model pre-warm should not abandon an otherwise good install.
function Try-Native {
    param([string]$Exe, [string[]]$Arguments, [string]$What, [string]$WorkDir)
    try {
        Invoke-Native -Exe $Exe -Arguments $Arguments -What $What -WorkDir $WorkDir
        return $true
    } catch {
        Write-Warn2 "$What did not complete: $($_.Exception.Message)"
        return $false
    }
}

function Update-PathFromRegistry {
    # winget updates the machine PATH, but this already-running process kept a
    # stale copy, so refresh it before looking for the tool just installed.
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Install-ViaWinget {
    param([string]$Id, [string]$Label, [string]$ManualUrl)

    if (-not (Test-Tool 'winget')) {
        Write-Fail "$Label is missing and winget is unavailable to install it."
        Write-Host "          Install it by hand, then re-run setup.bat:" -ForegroundColor Yellow
        Write-Host "          $ManualUrl" -ForegroundColor Yellow
        return $false
    }
    Write-Info "installing $Label via winget (a UAC prompt may appear)..."
    # --accept-*-agreements stops winget blocking on an interactive prompt.
    & winget install -e --id $Id --accept-source-agreements --accept-package-agreements | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "winget could not install $Label (exit $LASTEXITCODE). Manual: $ManualUrl"
        return $false
    }
    Update-PathFromRegistry
    return $true
}

function Test-PortBusy($port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $ok = $c.BeginConnect('127.0.0.1', $port, $null, $null).AsyncWaitHandle.WaitOne(400)
        $c.Close()
        return $ok
    } catch { return $false }
}

# Writes UTF-8 with NO byte-order mark. A BOM on the first line of a .env makes
# the first key's name start with an invisible character, so it reads as unset.
function Write-Utf8NoBom($Path, $Text) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# ---------------------------------------------------------------------------
try {

Write-Head 'G.U.A.R.D. Edge-AI Proctoring : machine setup'
Write-Host "   Project folder : $Root"
Write-Host "   Log file       : $LogPath"
Write-Host '   Expect roughly 4-5 GB of downloads and 10-25 minutes on a first'
Write-Host '   run, mostly PyTorch and the local language model.'

# ---- 0. Sanity: are we actually in the project? ----------------------------
Write-Step '0/8  Checking this is the GUARD project folder'
$required = @('requirements.txt', 'startapp.bat', 'backend\edge_main.py', 'frontend\package.json')
$missing = @()
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $Root $f))) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Write-Fail "This does not look like the GUARD project. Missing: $($missing -join ', ')"
    Write-Host '          Put setup.bat in the same folder as startapp.bat and re-run.' -ForegroundColor Yellow
    throw 'Wrong folder.'
}
Write-Ok 'project files found'

if (Test-Path (Join-Path $Root '.kilo')) {
    Write-Warn2 'A .kilo\ folder is present. That is a duplicate scratch copy of the repo (~1 GB), not needed to run the app, and safe to delete.'
}

# ---- 1. Python -------------------------------------------------------------
Write-Step '1/8  Locating Python'
function Resolve-Python {
    $cands = @(
        @{ Cmd = 'py';      Pre = @("-$BestPython") },
        @{ Cmd = 'py';      Pre = @('-3.11') },
        @{ Cmd = 'py';      Pre = @('-3.12') },
        @{ Cmd = 'python';  Pre = @() },
        @{ Cmd = 'python3'; Pre = @() }
    )
    # The probe deliberately contains NO double quotes. PowerShell 5.1 hands
    # arguments to native .exe files through a re-quoting layer that drops
    # embedded double quotes, so a probe written the obvious way --
    #   -c 'print("%d.%d" % sys.version_info[:2])'
    # -- reaches python.exe as print(%d.%d % ...) and dies with a SyntaxError.
    # The failure is silent here (stderr is swallowed, exit code is non-zero),
    # so it looked exactly like "Python is not installed" on a machine that had
    # 3.10 -- and the script would then try to install Python over the top of a
    # working Python. Printing the two version parts on their own lines and
    # joining them below keeps the probe quote-free and immune.
    $probe = @('-c', 'import sys;print(sys.executable);print(sys.version_info[0]);print(sys.version_info[1])')
    foreach ($c in $cands) {
        if (-not (Test-Tool $c.Cmd)) { continue }
        $out = $null
        try { $out = & $c.Cmd @($c.Pre + $probe) 2>$null } catch { continue }
        if ($LASTEXITCODE -ne 0 -or -not $out -or $out.Count -lt 3) { continue }
        $ver = "$($out[1].Trim()).$($out[2].Trim())"
        if ($GoodPython -contains $ver) {
            return @{ Exe = $out[0].Trim(); Ver = $ver }
        }
    }
    return $null
}

$py = Resolve-Python
if (-not $py) {
    Write-Warn2 "No Python $($GoodPython -join '/') found."
    $null = Install-ViaWinget -Id "Python.Python.$BestPython" -Label "Python $BestPython" `
                              -ManualUrl 'https://www.python.org/downloads/release/python-31011/'
    $py = Resolve-Python
}
if (-not $py) {
    Write-Fail "Still no usable Python. Install $BestPython (tick 'Add python.exe to PATH') and re-run."
    throw 'Python missing.'
}
Write-Ok "Python $($py.Ver) at $($py.Exe)"
if ($py.Ver -ne $BestPython) {
    Write-Warn2 "Project was built on Python $BestPython, you have $($py.Ver). Usually fine, but if a package fails to build, install $BestPython."
}

# ---- 2. Node and pnpm ------------------------------------------------------
Write-Step '2/8  Locating Node.js and pnpm'
if ($SkipFrontend) {
    Write-Info '-SkipFrontend given, skipping'
} else {
    if (-not (Test-Tool 'node')) {
        Write-Warn2 'Node.js not found.'
        $null = Install-ViaWinget -Id 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS' `
                                  -ManualUrl 'https://nodejs.org/en/download'
    }
    if (-not (Test-Tool 'node')) {
        Write-Fail "Node.js is required for the frontend. Install LTS (>= $MinNodeMajor) and re-run."
        throw 'Node missing.'
    }
    $nodeVer = (& node --version).Trim()
    $nodeMajor = [int](($nodeVer.TrimStart('v')).Split('.')[0])
    if ($nodeMajor -lt $MinNodeMajor) {
        Write-Fail "Node $nodeVer is too old. Next.js 16 needs >= $MinNodeMajor. Update Node and re-run."
        throw 'Node too old.'
    }
    Write-Ok "Node $nodeVer"

    # The lockfile in frontend/ is pnpm-lock.yaml, so pnpm is what reproduces
    # the exact dependency versions this app was tested against. npm would
    # resolve a different tree and quietly install versions nobody has run.
    if (-not (Test-Tool 'pnpm')) {
        Write-Info 'pnpm not found, enabling it through corepack (ships with Node)...'
        if (-not (Try-Native -Exe 'corepack' -Arguments @('enable', 'pnpm') -What 'corepack enable pnpm')) {
            $null = Try-Native -Exe 'npm' -Arguments @('install', '-g', 'pnpm') -What 'npm install -g pnpm'
        }
        Update-PathFromRegistry
    }
    if (-not (Test-Tool 'pnpm')) {
        Write-Fail 'pnpm is required (frontend/pnpm-lock.yaml). Install with: npm install -g pnpm'
        throw 'pnpm missing.'
    }
    Write-Ok "pnpm $((& pnpm --version).Trim())"
}

# ---- 3. Ollama -------------------------------------------------------------
Write-Step '3/8  Locating Ollama (local offline model server)'
$haveOllama = $false
if ($SkipOllama) {
    Write-Info '-SkipOllama given, skipping (cloud LLM only)'
} else {
    if (-not (Test-Tool 'ollama')) {
        Write-Warn2 'Ollama not found.'
        $null = Install-ViaWinget -Id 'Ollama.Ollama' -Label 'Ollama' `
                                  -ManualUrl 'https://ollama.com/download/windows'
    }
    if (Test-Tool 'ollama') {
        $haveOllama = $true
        Write-Ok 'Ollama present'
    } else {
        Write-Warn2 'Continuing without Ollama. Offline mode will not work until it is installed.'
    }
}

# ---- 4. GPU detection ------------------------------------------------------
Write-Step '4/8  Checking for an NVIDIA GPU'
$hasNvidia = $false
if (Test-Tool 'nvidia-smi') {
    $gpu = $null
    try { $gpu = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null } catch { }
    if ($LASTEXITCODE -eq 0 -and $gpu) {
        $hasNvidia = $true
        Write-Ok "NVIDIA GPU: $($gpu -join '; ')"
    }
}
if (-not $hasNvidia) {
    Write-Info 'no NVIDIA GPU detected, installing CPU PyTorch'
    Write-Info 'the app still works, YOLO detection just runs at a lower frame rate'
}

# ---- 5. Python virtual environment and packages ---------------------------
Write-Step '5/8  Building the Python environment (the long one)'
$venvDir = Join-Path $Root 'venv'
$venvPy  = Join-Path $venvDir 'Scripts\python.exe'

if ((Test-Path $venvPy) -and -not $Force) {
    Write-Ok 'venv\ already exists (use -Force to rebuild)'
} else {
    if ($Force -and (Test-Path $venvDir)) {
        Write-Info 'removing existing venv\ ...'
        Remove-Item $venvDir -Recurse -Force
    }
    Write-Info 'creating venv\ ...'
    Invoke-Native -Exe $py.Exe -Arguments @('-m', 'venv', $venvDir) -What 'python -m venv'
}
if (-not (Test-Path $venvPy)) { throw "venv was not created at $venvPy" }

Write-Info 'upgrading pip...'
Invoke-Native -Exe $venvPy `
    -Arguments @('-m', 'pip', 'install', '--upgrade', '--quiet', 'pip', 'wheel', 'setuptools') `
    -What 'pip upgrade'

Write-Info 'installing requirements.txt, PyTorch alone is ~2.5 GB, please wait...'
Invoke-Native -Exe $venvPy `
    -Arguments @('-m', 'pip', 'install', '-r', (Join-Path $Root 'requirements.txt')) `
    -What 'pip install -r requirements.txt' -WorkDir $Root
Write-Ok 'Python packages installed'

# PyPI's default torch wheel for Windows is CPU-only. If there is a GPU, offer
# the CUDA build, but only on confirmation: it is another large download and it
# replaces the pinned torch version with whatever the CUDA channel serves.
if ($hasNvidia) {
    $cudaOk = & $venvPy -c "import torch;print('yes' if torch.cuda.is_available() else 'no')" 2>$null
    if ($cudaOk -match 'yes') {
        Write-Ok 'PyTorch already sees the GPU'
    } else {
        Write-Host ''
        Write-Host '   A GPU is present but this PyTorch build is CPU-only.' -ForegroundColor Yellow
        Write-Host '   The CUDA build makes detection much faster, but it is another' -ForegroundColor Yellow
        Write-Host '   ~2.5 GB download and may change the pinned torch version.' -ForegroundColor Yellow
        $ans = Read-Host '   Install CUDA PyTorch now? [y/N]'
        if ($ans -match '^[Yy]') {
            $installed = $false
            foreach ($ch in @('cu128', 'cu126', 'cu124')) {
                Write-Info "trying PyTorch CUDA channel $ch ..."
                & $venvPy -m pip install --upgrade --force-reinstall torch torchvision `
                    --index-url "https://download.pytorch.org/whl/$ch" | Out-Host
                if ($LASTEXITCODE -eq 0) {
                    $chk = & $venvPy -c "import torch;print('yes' if torch.cuda.is_available() else 'no')" 2>$null
                    if ($chk -match 'yes') {
                        Write-Ok "CUDA PyTorch installed ($ch)"
                        $installed = $true
                        break
                    }
                }
            }
            if (-not $installed) {
                Write-Warn2 'CUDA PyTorch did not install, staying on CPU. Restore the pinned build later with: venv\Scripts\pip install -r requirements.txt'
            }
        } else {
            Write-Info 'staying on CPU PyTorch'
        }
    }
}

# ---- 6. Frontend packages -------------------------------------------------
Write-Step '6/8  Installing frontend packages'
$feDir = Join-Path $Root 'frontend'
if ($SkipFrontend) {
    Write-Info '-SkipFrontend given, skipping'
} else {
    $nmDir = Join-Path $feDir 'node_modules'
    if ((Test-Path $nmDir) -and -not $Force) {
        Write-Ok 'frontend\node_modules already exists (use -Force to reinstall)'
    } else {
        Write-Info 'pnpm install --frozen-lockfile (reproduces the tested versions)...'
        try {
            Invoke-Native -Exe 'pnpm' -Arguments @('install', '--frozen-lockfile') -What 'pnpm install' -WorkDir $feDir
        } catch {
            Write-Warn2 'Frozen install failed (lockfile may be out of date), retrying without --frozen-lockfile.'
            Invoke-Native -Exe 'pnpm' -Arguments @('install') -What 'pnpm install' -WorkDir $feDir
        }
        Write-Ok 'frontend packages installed'
    }

    # The MediaPipe face-mesh WASM is copied out of node_modules into public/ by
    # a project script. package.json runs it on postinstall and predev, but pnpm
    # can be configured to skip lifecycle scripts, so run it explicitly and then
    # confirm the file landed: a missing WASM means face tracking silently never
    # starts in the browser.
    Write-Info 'copying MediaPipe WASM into public/ ...'
    $null = Try-Native -Exe 'node' -Arguments @('scripts/copy-mediapipe.mjs') -What 'copy-mediapipe' -WorkDir $feDir
    $wasm = Join-Path $feDir 'public\mediapipe\face_mesh_solution_simd_wasm_bin.wasm'
    if (Test-Path $wasm) {
        Write-Ok 'MediaPipe WASM in place'
    } else {
        Write-Warn2 'MediaPipe WASM missing from frontend\public\mediapipe, face tracking may not start.'
    }
}

# ---- 7. Models: YOLO weights, Whisper, Ollama -----------------------------
Write-Step '7/8  Fetching models'

# 7a. YOLO detector weights. `*.pt` is gitignored, so a clone never has these.
# Let ultralytics download it rather than hardcoding a release URL: it fetches
# the asset version matching the installed ultralytics. The working directory
# must be the project root, because backend/edge_main.py loads
# YOLO("yolov8s.pt") as a relative path and startapp.bat launches Python from
# the root, so that is where the file has to end up.
$weightsPath = Join-Path $Root $YoloWeights
if (Test-Path $weightsPath) {
    Write-Ok "$YoloWeights already present"
} else {
    Write-Info "downloading $YoloWeights via ultralytics..."
    $dl = Join-Path $env:TEMP 'guard_fetch_yolo.py'
    Write-Utf8NoBom $dl @"
from ultralytics import YOLO
YOLO("$YoloWeights")
print("yolo-ok")
"@
    $null = Try-Native -Exe $venvPy -Arguments @($dl) -What "$YoloWeights download" -WorkDir $Root
    Remove-Item $dl -Force -ErrorAction SilentlyContinue
    if (Test-Path $weightsPath) {
        Write-Ok "$YoloWeights downloaded"
    } else {
        Write-Warn2 "$YoloWeights not downloaded. Copy it manually into $Root, the backend cannot detect phones without it."
    }
}

# 7b. Whisper speech model. faster-whisper pulls this from Hugging Face on first
# use, so pre-warm it now: the first interview is not stalled by a download, and
# the machine genuinely works with no network later.
Write-Info "pre-warming faster-whisper '$WhisperModel' (~75 MB)..."
$ww = Join-Path $env:TEMP 'guard_warm_whisper.py'
Write-Utf8NoBom $ww @"
from faster_whisper import WhisperModel
WhisperModel("$WhisperModel", device="cpu", compute_type="int8")
print("whisper-ok")
"@
if (Try-Native -Exe $venvPy -Arguments @($ww) -What 'whisper pre-warm' -WorkDir $Root) {
    Write-Ok "whisper '$WhisperModel' cached"
}
Remove-Item $ww -Force -ErrorAction SilentlyContinue

# 7c. Ollama model. Start the daemon the same way startapp.bat does, guarding on
# the process, because `ollama serve` errors out if 11434 is already bound.
if ($haveOllama) {
    $running = Get-Process -Name 'ollama' -ErrorAction SilentlyContinue
    if (-not $running) {
        Write-Info 'starting the Ollama server...'
        Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Minimized | Out-Null
        Start-Sleep -Seconds 3
    } else {
        Write-Info 'Ollama server already running'
    }

    $have = & ollama list 2>$null
    if ($LASTEXITCODE -eq 0 -and ($have -join "`n") -match [regex]::Escape($OllamaModel)) {
        Write-Ok "$OllamaModel already pulled"
    } else {
        Write-Info "pulling $OllamaModel (~2 GB, this is the slow one)..."
        if (Try-Native -Exe 'ollama' -Arguments @('pull', $OllamaModel) -What "ollama pull $OllamaModel") {
            Write-Ok "$OllamaModel ready"
        } else {
            Write-Warn2 "Could not pull $OllamaModel. Run 'ollama pull $OllamaModel' by hand later, offline mode needs it."
        }
    }
}

# ---- 8. backend\.env ------------------------------------------------------
Write-Step '8/8  Writing backend\.env (API keys and LLM mode)'

# This path is NOT arbitrary. backend/edge_main.py calls load_dotenv() with no
# argument, which walks up from the file that called it, that is from backend/,
# so backend/.env is the file actually read. A .env at the project root is found
# only when this one does not exist, so putting keys there instead looks correct
# and silently does nothing.
$envPath = Join-Path $Root 'backend\.env'
$writeEnv = $true
if ((Test-Path $envPath) -and -not $Force) {
    Write-Info 'backend\.env already exists.'
    $keep = Read-Host '   Keep it as-is? [Y/n]'
    if ($keep -notmatch '^[Nn]') {
        $writeEnv = $false
        Write-Ok 'keeping existing backend\.env'
    }
}

if ($writeEnv) {
    Write-Host ''
    Write-Host '   Paste API keys for cloud (online) mode, or press Enter to skip'
    Write-Host '   any of them and run fully offline on Ollama.'
    Write-Host '     NVIDIA (free) : https://build.nvidia.com/       key starts nvapi-' -ForegroundColor DarkGray
    Write-Host '     Groq   (free) : https://console.groq.com/keys   key starts gsk_' -ForegroundColor DarkGray
    Write-Host ''

    $nvKey = (Read-Host '   NVIDIA_API_KEY (Enter to skip)').Trim()
    if ($nvKey -and $nvKey -notlike 'nvapi-*') {
        Write-Warn2 'That NVIDIA key does not start with "nvapi-". Saving it anyway, but double-check it.'
    }
    $gqKey = (Read-Host '   GROQ_API_KEY   (Enter to skip)').Trim()
    if ($gqKey -and $gqKey -notlike 'gsk_*') {
        Write-Warn2 'That Groq key does not start with "gsk_". Saving it anyway, but double-check it.'
    }

    # auto = use local Ollama when it answers on 11434, cloud otherwise. With no
    # keys at all, pin to ollama so a missing local server fails loudly instead
    # of attempting a cloud call it has no credentials for.
    if (-not $nvKey -and -not $gqKey) {
        $mode = 'ollama'
        Write-Info 'no keys given, using LLM_MODE=ollama (fully offline)'
    } else {
        $mode = 'auto'
        Write-Info 'keys saved, using LLM_MODE=auto (local when available, cloud otherwise)'
    }

    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $body = @"
# G.U.A.R.D. local configuration, generated by setup.ps1 on $stamp
#
# Read by backend/edge_main.py via load_dotenv(), which finds THIS file because
# it walks up from backend/. Do not move it to the project root: a root .env is
# used only when this one is absent.
#
# This file is gitignored and must never be committed or shared: it holds keys.

# auto   = local Ollama when it is listening on 11434, cloud otherwise
# ollama = always local, no network
# nvidia / groq = always that cloud provider
LLM_MODE=$mode

# Local model server
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=$OllamaModel

# Cloud providers. Empty means "not configured", and that provider is skipped by
# the fallback cascade in backend/core_memory/conversation_engine.py.
NVIDIA_API_KEY=$nvKey
GROQ_API_KEY=$gqKey

# Local speech-to-text size (tiny.en is the fast default)
WHISPER_MODEL=$WhisperModel
"@
    Write-Utf8NoBom $envPath $body
    Write-Ok "wrote $envPath"
    Show-Mask 'NVIDIA_API_KEY' $nvKey
    Show-Mask 'GROQ_API_KEY  ' $gqKey
}

# ---- Verification --------------------------------------------------------
Write-Head 'Verifying the install'

Write-Step 'Importing every critical Python package'
$vfy = Join-Path $env:TEMP 'guard_verify.py'
Write-Utf8NoBom $vfy @'
import importlib, sys
mods = [("fastapi",1),("uvicorn",1),("dotenv",1),("openai",1),("numpy",1),
        ("cv2",1),("torch",1),("ultralytics",1),("faster_whisper",1),
        ("polars",1),("pdfplumber",1),("matplotlib",1),("scipy",1),("pyttsx3",0)]
bad = []
for name, required in mods:
    try:
        importlib.import_module(name)
        print("   [ok]   import %s" % name)
    except Exception as e:
        tag = "FAIL" if required else "warn"
        print("   [%s] import %s -> %s" % (tag, name, e))
        if required:
            bad.append(name)
import torch
print("   [ok]   torch %s | CUDA available: %s" % (torch.__version__, torch.cuda.is_available()))
sys.exit(1 if bad else 0)
'@
$importsOk = Try-Native -Exe $venvPy -Arguments @($vfy) -What 'package import check' -WorkDir $Root
Remove-Item $vfy -Force -ErrorAction SilentlyContinue
if ($importsOk) {
    Write-Ok 'all required packages import'
} else {
    Write-Warn2 'One or more required packages failed to import, see above. The backend will not start until that is fixed.'
}

Write-Step 'Running the LLM configuration test suite'
# Hermetic: it fakes the Ollama socket, so this is a real check that the config
# layer works on this machine without needing any server to be up.
if (Try-Native -Exe $venvPy -Arguments @('backend\test_llm_config.py') -What 'test_llm_config.py' -WorkDir $Root) {
    Write-Ok 'configuration tests passed'
} else {
    Write-Warn2 'test_llm_config.py reported failures, see the output above.'
}

Write-Step 'Checking the ports the app needs'
foreach ($p in @(3000, 8080, 11434)) {
    $busy = Test-PortBusy $p
    if ($p -eq 11434) {
        if ($busy) {
            Write-Ok 'port 11434, Ollama is listening'
        } elseif ($haveOllama) {
            Write-Warn2 'Ollama is installed but not listening on 11434. startapp.bat will start it.'
        } else {
            Write-Info 'port 11434 free (Ollama not installed)'
        }
    } elseif ($busy) {
        Write-Warn2 "port $p is already in use. Close whatever owns it or the app cannot bind it."
    } else {
        Write-Ok "port $p free"
    }
}

# ---- Summary -------------------------------------------------------------
Write-Head 'Setup complete'
if ($script:Warnings.Count -gt 0) {
    Write-Host "   Finished with $($script:Warnings.Count) warning(s):" -ForegroundColor Yellow
    foreach ($w in $script:Warnings) { Write-Host "     - $w" -ForegroundColor Yellow }
    Write-Host ''
}
Write-Host '   Start the app:' -ForegroundColor Green
Write-Host '     double-click  startapp.bat' -ForegroundColor White
Write-Host ''
Write-Host '   Then open:' -ForegroundColor Green
Write-Host '     http://localhost:3000            landing page'
Write-Host '     http://localhost:3000/dashboard  dashboard'
Write-Host '     http://localhost:8080/docs       backend API'
Write-Host ''
Write-Host '   Notes:' -ForegroundColor Green
Write-Host '     - Allow camera and microphone when the browser asks. The app'
Write-Host '       captures them in the browser, not in Python.'
Write-Host '     - Use Chrome or Edge. getUserMedia needs localhost or HTTPS.'
Write-Host '     - The first page load compiles for a few seconds, then it is fast.'
Write-Host '     - Change LLM mode in the app any time, or edit backend\.env.'
Write-Host ''

$exit = 0

} catch {
    Write-Host ''
    Write-Fail $_.Exception.Message
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        Write-Host "          at setup.ps1 line $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor DarkGray
    }
    Write-Host ''
    Write-Host '   Setup stopped. Nothing was uninstalled. Fix the issue above and' -ForegroundColor Yellow
    Write-Host '   re-run setup.bat: finished steps are detected and skipped.' -ForegroundColor Yellow
    $exit = 1
} finally {
    try { Stop-Transcript | Out-Null } catch { }
}

exit $exit
