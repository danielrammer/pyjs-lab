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
& $scp -i $IdentityFile (Join-Path $repoRoot "learn_server.py") (Join-Path $repoRoot "learn-defaults.json") (Join-Path $repoRoot "learn-solutions.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the Learn service." }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn-solutions-en.json") (Join-Path $repoRoot "learn-canvas-upgrade.json") (Join-Path $repoRoot "learn-comments-upgrade.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the bilingual Learn catalog." }
& $scp -i $IdentityFile (Join-Path $repoRoot "learn-basics-upgrade.json") "${remote}:$root/releases/$release/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the additional practice lessons." }
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "compose.yaml") "${remote}:$root/compose.yaml"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload service configuration." }
# Use PYJS branding for this public domain without changing the local school name.
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "config.js") "${remote}:$root/releases/$release/config.js"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload the public configuration." }
& $scp -i $IdentityFile (Join-Path $PSScriptRoot "activate.sh") (Join-Path $PSScriptRoot "pyjs.http.conf") (Join-Path $PSScriptRoot "pyjs.https.conf") "${remote}:$root/"
if ($LASTEXITCODE -ne 0) { throw "Cannot upload deployment configuration." }
& $ssh -i $IdentityFile -o BatchMode=yes $remote "sed -i 's/\r$//' '$root/activate.sh' '$root/pyjs.http.conf' '$root/pyjs.https.conf' && bash '$root/activate.sh' '$release'"
if ($LASTEXITCODE -ne 0) { throw "Deployment failed; inspect the remote logs and backup." }
