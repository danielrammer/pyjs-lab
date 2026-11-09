param(
    [string]$ServerHost = "207.154.233.46",
    [string]$ServerUser = "dnl",
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\e14-win",
    [string]$LearnPassword
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$release = Get-Date -Format "yyyyMMdd-HHmmss"
$remote = "$ServerUser@$ServerHost"
$ssh = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$scp = "$env:WINDIR\System32\OpenSSH\scp.exe"
$root = "/home/dnl/pyjs"
if ($ServerUser -ne "dnl") { throw "The supplied Nginx configuration requires user dnl." }
$niceguiDist=Join-Path $repoRoot 'nicegui-dist'
$niceguiManifest=Get-Content -Raw -LiteralPath (Join-Path $niceguiDist 'PYJS-MANIFEST.json') | ConvertFrom-Json
if($niceguiManifest.nicegui -ne '3.18.0' -or $niceguiManifest.adapter_commit -ne '026ad0642846a930a4f1f37dcf27d20156ca1812') { throw 'Build the pinned NiceGUI runtime first (README).' }
$entryHash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $niceguiDist 'entrypoint.py')).Hash.ToLowerInvariant()
if($entryHash -ne $niceguiManifest.entrypoint_sha256) { throw 'NiceGUI host differs from its build manifest. Run node scripts/prepare-nicegui.mjs.' }
& $ssh -i $IdentityFile -o BatchMode=yes $remote "mkdir -p '$root/releases/$release' '$root/acme'"
if ($LASTEXITCODE -ne 0) { throw "Cannot prepare the remote release." }
if ($LearnPassword) {
    $python = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
    $hash = $LearnPassword | & $python -c "import sys; from learn_server import password_hash; print(password_hash(sys.stdin.read().rstrip('\r\n')))"
    if ($LASTEXITCODE -ne 0) { throw "Cannot hash the admin password." }
    $temporary = Join-Path $env:TEMP "pyjs-learn-$release.env"
    try {
        [IO.File]::WriteAllText($temporary, "PYJS_ADMIN_PASSWORD_HASH=$hash`n")
        & $scp -i $IdentityFile $temporary "${remote}:$root/learn.env"
        if ($LASTEXITCODE -ne 0) { throw "Cannot configure the admin password." }
    } finally { Remove-Item -LiteralPath $temporary -ErrorAction SilentlyContinue }
}
& $ssh -i $IdentityFile -o BatchMode=yes $remote "test -f '$root/learn.env'"
if ($LASTEXITCODE -ne 0) { throw "Set LearnPassword on the first deployment." }
& $scp -i $IdentityFile (Join-Path $repoRoot "index.html") (Join-Path $repoRoot "styles.css") (Join-Path $repoRoot "app.bundle.js") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload PYJS." }
& $scp -i $IdentityFile (Join-Path $repoRoot "logo.svg") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the logo." }
$niceguiArchive=Join-Path $env:TEMP "pyjs-nicegui-$release.tar.gz"
try {
    & tar -czf $niceguiArchive -C $niceguiDist .
    if($LASTEXITCODE -ne 0){throw 'Cannot package the NiceGUI runtime.'}
    & $scp -i $IdentityFile $niceguiArchive "${remote}:$root/releases/$release/nicegui-runtime.tar.gz"
    if($LASTEXITCODE -ne 0){throw 'Cannot upload the NiceGUI runtime.'}
    & $ssh -i $IdentityFile -o BatchMode=yes $remote "mkdir -p '$root/releases/$release/nicegui-dist' && tar -xzf '$root/releases/$release/nicegui-runtime.tar.gz' -C '$root/releases/$release/nicegui-dist' && rm '$root/releases/$release/nicegui-runtime.tar.gz'"
    if($LASTEXITCODE -ne 0){throw 'Cannot unpack the NiceGUI runtime.'}
} finally { Remove-Item -LiteralPath $niceguiArchive -ErrorAction SilentlyContinue }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn_server.py") (Join-Path $repoRoot "learn-defaults.json") (Join-Path $repoRoot "learn-solutions.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the Learn service." }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn-solutions-en.json") (Join-Path $repoRoot "learn-canvas-upgrade.json") (Join-Path $repoRoot "learn-comments-upgrade.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the bilingual Learn catalog." }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn-basics-upgrade.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the additional practice lessons." }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn-gui.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the GUI lessons." }
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "compose.yaml") "${remote}:$root/compose.yaml"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload service configuration." }
# Use PYJS branding for this public domain without changing the local school name.
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "config.js") "${remote}:$root/releases/$release/config.js"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the public configuration." }
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "activate.sh") (Join-Path $PSScriptRoot "pyjs.http.conf") (Join-Path $PSScriptRoot "pyjs.https.conf") "${remote}:$root/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload deployment configuration." }
& $ssh -i $IdentityFile -o BatchMode=yes $remote "sed -i 's/\r$//' '$root/activate.sh' '$root/pyjs.http.conf' '$root/pyjs.https.conf' && bash '$root/activate.sh' '$release'"
if ($LASTEXITCODE -ne 0) { throw "Deployment failed; inspect the remote logs and backup." }
