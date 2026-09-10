$ErrorActionPreference = 'Stop'
$sourcePath = [IO.Path]::GetFullPath($PSScriptRoot)
$targetPath = 'D:\Codex\GRID-SHIFT'
if (Test-Path -LiteralPath $targetPath) { throw 'D:\Codex\GRID-SHIFT zaten var. Mevcut dosyalarin uzerine yazilmadi.' }
New-Item -ItemType Directory -Path 'D:\Codex' -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
Write-Output 'Proje D:\Codex\GRID-SHIFT konumuna kopyalandi. C: kopyasi korunuyor.'
Write-Output 'Codex uygulamasinda D:\Codex\GRID-SHIFT klasorunu proje olarak acin.'
Write-Output 'GitHub gonderimi icin: git -C D:\Codex\GRID-SHIFT push -u origin main'
