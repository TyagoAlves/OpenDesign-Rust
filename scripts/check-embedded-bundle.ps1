<#
.SYNOPSIS
  Gate de QA: confirma que o .exe cru (target/release/app.exe) embute exatamente
  o bundle de frontend gerado no mesmo build de dist/.

.DESCRIPTION
  FALHA FECHADA. Nao promove, nao copia, nao builda, nao publica nada — so le e
  valida. Verificacoes:

    1) Leitura ESTAVEL do PE com retry. O .exe ja foi visto sendo substituido
       durante a leitura; duas leituras consecutivas com o mesmo SHA-256 sao
       exigidas antes de qualquer conclusao.
    2) Exatamente UM /assets/index-*.js no PE (unicos).Mais de um, ou nenhum,
       e reprovacao.
    3) Esse nome e igual ao src do <script> em dist/index.html do mesmo build
       (comparacao normalizada de caminho e de nome de arquivo).
    4) Com -FullAssetSet: todo asset referenciado em dist/index.html e todo
       arquivo presente em dist/assets/ precisa aparecer no PE (pelo nome).

  Exit 0 = PASS. Exit 1 = FAIL (inclusive em erro de leitura/parse).

.EXAMPLE
  powershell -NoProfile -File scripts/check-embedded-bundle.ps1 `
    -Exe target/release/app.exe -DistDir dist -FullAssetSet
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$DistDir,
  [switch]$FullAssetSet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$failures = New-Object 'System.Collections.Generic.List[string]'
function Add-Failure([string]$msg) { $failures.Add($msg) }

function Get-Sha256Hex([byte[]]$bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '')
  } finally {
    $sha.Dispose()
  }
}

# Duas leituras consecutivas identicas: o .exe pode estar sendo substituido.
function Read-StableBytes([string]$path, [int]$attempts = 6) {
  $prevHash = $null
  for ($i = 1; $i -le $attempts; $i++) {
    try {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $hash = Get-Sha256Hex $bytes
      if ($null -ne $prevHash -and $hash -eq $prevHash) {
        Write-Host ("  leitura estavel apos {0} tentativa(s): SHA-256 {1}" -f $i, $hash)
        return $bytes
      }
      $prevHash = $hash
      Write-Host ("  leitura {0}: SHA-256 {1} (aguardando estabilidade)" -f $i, $hash)
    } catch {
      Write-Host ("  leitura {0} falhou: {1}" -f $i, $_.Exception.Message)
    }
    Start-Sleep -Milliseconds 400
  }
  throw ("NAO foi possivel obter leitura estavel de '{0}' apos {1} tentativas" -f $path, $attempts)
}

function Normalize-AssetPath([string]$p) {
  $n = $p -replace '\\', '/'
  $n = $n.TrimStart('.')
  if (-not $n.StartsWith('/')) { $n = '/' + $n }
  return $n
}

Write-Host '=== GATE DE BUNDLE EMBUTIDO (fail-closed) ==='
Write-Host ("Exe     : {0}" -f $Exe)
Write-Host ("DistDir : {0}" -f $DistDir)
Write-Host ("FullAssetSet : {0}" -f [bool]$FullAssetSet)

try {
  $exeFull = [System.IO.Path]::GetFullPath($Exe)
  $distFull = [System.IO.Path]::GetFullPath($DistDir)
  $indexPath = Join-Path $distFull 'index.html'

  if (-not [System.IO.File]::Exists($exeFull)) { throw ("Exe nao encontrado: {0}" -f $exeFull) }
  if (-not [System.IO.File]::Exists($indexPath)) { throw ("dist/index.html nao encontrado: {0}" -f $indexPath) }

  $peBytes = Read-StableBytes $exeFull
  # ISO-8859-1: 1 byte = 1 char, permite casar padroes ASCII exatamente nos bytes do PE.
  $latin1 = [System.Text.Encoding]::GetEncoding(28591)
  $peText = $latin1.GetString($peBytes)

  # --- 2) exatamente um /assets/index-*.js no PE ----------------------------
  $peJs = @(
    [regex]::Matches($peText, '/assets/index-[A-Za-z0-9_-]+\.js') |
      ForEach-Object { $_.Value } | Sort-Object -Unique
  )
  Write-Host ("PE /assets/index-*.js (unicos): {0}" -f $(
    if ($peJs.Count -eq 0) { '(nenhum)' } else { $peJs -join ', ' }
  ))

  if ($peJs.Count -eq 0) {
    Add-Failure 'nenhum /assets/index-*.js encontrado no PE'
  } elseif ($peJs.Count -ne 1) {
    Add-Failure ("esperado exatamente 1 bundle JS no PE, encontrados {0}: {1}" -f $peJs.Count, ($peJs -join ', '))
  }

  # --- 3) comparar com o src do dist/index.html -----------------------------
  $html = [System.IO.File]::ReadAllText($indexPath)
  $scriptMatch = [regex]::Match(
    $html,
    '<script\b[^>]*\bsrc\s*=\s*[\x22\x27](?<src>[^\x22\x27]+\.js)[\x22\x27]',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if (-not $scriptMatch.Success) {
    Add-Failure 'dist/index.html nao tem <script src="...js">'
    $expected = $null
    $expectedName = $null
  } else {
    $scriptSrc = $scriptMatch.Groups['src'].Value
    $expected = Normalize-AssetPath $scriptSrc
    $expectedName = [System.IO.Path]::GetFileName($expected)
    Write-Host ("dist/index.html <script src> : {0}" -f $scriptSrc)

    $expectedRel = $scriptSrc.TrimStart('.').TrimStart('/') -replace '/', '\'
    $expectedFile = Join-Path $distFull $expectedRel
    if (-not [System.IO.File]::Exists($expectedFile)) {
      Add-Failure ("bundle referenciado por dist/index.html nao existe em disco: {0}" -f $expectedFile)
    } else {
      $bundleHash = Get-Sha256Hex ([System.IO.File]::ReadAllBytes($expectedFile))
      Write-Host ("SHA-256 do bundle no dist   : {0}" -f $bundleHash)
    }

    if ($peJs.Count -eq 1) {
      $peName = [System.IO.Path]::GetFileName($peJs[0])
      if ((Normalize-AssetPath $peJs[0]) -ne $expected) {
        Add-Failure ("caminho do bundle no PE ({0}) != src do dist/index.html ({1})" -f $peJs[0], $expected)
      }
      if ($peName -ne $expectedName) {
        Add-Failure ("nome do bundle no PE ({0}) != nome no dist/index.html ({1})" -f $peName, $expectedName)
      }
    }
  }

  # --- 4) conjunto inteiro de assets ----------------------------------------
  if ($FullAssetSet) {
    $required = New-Object 'System.Collections.Generic.HashSet[string]'

    foreach ($m in [regex]::Matches($html, '(?:src|href)\s*=\s*[\x22\x27](?<u>[^\x22\x27]+)[\x22\x27]')) {
      $u = $m.Groups['u'].Value
      if ($u -match '/assets/') { [void]$required.Add((Normalize-AssetPath $u)) }
    }

    $assetsDir = Join-Path $distFull 'assets'
    if ([System.IO.Directory]::Exists($assetsDir)) {
      Get-ChildItem -Path $assetsDir -File -Recurse | ForEach-Object {
        $rel = $_.FullName.Substring($distFull.Length).TrimStart('\')
        [void]$required.Add((Normalize-AssetPath $rel))
      }
    } else {
      Add-Failure ("diretorio de assets nao encontrado: {0}" -f $assetsDir)
    }

    Write-Host ("FullAssetSet: {0} asset(s) exigido(s)" -f $required.Count)
    foreach ($asset in ($required | Sort-Object)) {
      $name = [System.IO.Path]::GetFileName($asset)
      if (-not $peText.Contains($name)) {
        Add-Failure ("asset do dist ausente no PE: {0} (nome '{1}')" -f $asset, $name)
      }
    }
  }

} catch {
  Add-Failure ("erro ao validar: {0}" -f $_.Exception.Message)
}

Write-Host '--- RESULTADO ---'
if ($failures.Count -gt 0) {
  foreach ($f in $failures) { Write-Host ("FAIL: {0}" -f $f) }
  Write-Host 'GATE: REPROVADO'
  exit 1
}
Write-Host 'GATE: APROVADO'
exit 0
