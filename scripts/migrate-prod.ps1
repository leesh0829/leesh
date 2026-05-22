# 운영 DB 마이그레이션 전용 — .env 파일 안 건드림
#
# 사용법:
#   1. 처음 1회: scripts/.env.prod.example 을 복사해서 프로젝트 루트에 ".env.prod" 만들고 운영 URL 채우기
#   2. PowerShell에서 프로젝트 루트로 이동 후:
#        .\scripts\migrate-prod.ps1
#
# 동작:
#   - .env.prod 에서 DATABASE_URL/DIRECT_URL 읽음
#   - 호스트 보여주고 확인 프롬프트 ("YES" 입력해야 진행)
#   - 이 세션에만 임시로 env 변수 주입 → prisma migrate deploy 실행
#   - 끝나면 env 변수 즉시 제거 (잔존 사고 방지)
#   - 본 프로젝트의 .env 파일은 한 번도 안 건드림

$ErrorActionPreference = "Stop"

$EnvFile = ".env.prod"

# 1) .env.prod 존재 확인
if (-not (Test-Path $EnvFile)) {
  Write-Host "❌ $EnvFile 파일이 없습니다." -ForegroundColor Red
  Write-Host "   scripts/.env.prod.example 를 복사해서 프로젝트 루트에 .env.prod 만들고" -ForegroundColor Yellow
  Write-Host "   운영 DB URL을 채워주세요." -ForegroundColor Yellow
  exit 1
}

# 2) .env.prod 파싱 (KEY="value" 또는 KEY=value)
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  if ($line -match '^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$') {
    $envVars[$matches[1]] = $matches[2]
  }
}

$dbUrl = $envVars["DATABASE_URL"]
$directUrl = $envVars["DIRECT_URL"]

if (-not $dbUrl) {
  Write-Host "❌ $EnvFile 에 DATABASE_URL이 없습니다." -ForegroundColor Red
  exit 1
}

# 3) 안전 체크: localhost 거부 (운영용 스크립트인데 localhost면 사고)
if ($dbUrl -match "localhost|127\.0\.0\.1") {
  Write-Host "❌ DATABASE_URL이 localhost를 가리킵니다. 이 스크립트는 운영 DB 전용입니다." -ForegroundColor Red
  exit 1
}

# 4) 호스트 추출해서 보여주기
$dbHost = "(파싱 실패)"
if ($dbUrl -match "@([^:/]+)") {
  $dbHost = $matches[1]
}

$bar = "=" * 60
Write-Host ""
Write-Host $bar -ForegroundColor Yellow
Write-Host "⚠️  운영 DB 마이그레이션" -ForegroundColor Yellow
Write-Host $bar -ForegroundColor Yellow
Write-Host "대상 호스트: $dbHost" -ForegroundColor Cyan
if ($directUrl) {
  $directHost = "(파싱 실패)"
  if ($directUrl -match "@([^:/]+)") { $directHost = $matches[1] }
  Write-Host "DIRECT 호스트: $directHost" -ForegroundColor Cyan
}
Write-Host ""

# 5) 확인 프롬프트 — 정확히 "YES" 입력해야 진행
$confirm = Read-Host "정말 실행하시겠습니까? 'YES' 입력 시 진행"
if ($confirm -ne "YES") {
  Write-Host "취소됨." -ForegroundColor Yellow
  exit 0
}

# 6) 임시 env 변수 설정 (이 PowerShell 세션에만 존재)
$env:DATABASE_URL = $dbUrl
if ($directUrl) {
  $env:DIRECT_URL = $directUrl
}

# 7) 마이그레이션 실행
Write-Host ""
Write-Host "▶ npx prisma migrate deploy" -ForegroundColor Green
Write-Host ""
$exitCode = 0
try {
  npx prisma migrate deploy
  $exitCode = $LASTEXITCODE
}
finally {
  # 8) 정리 — env 변수 즉시 제거 (잔존 사고 원천 차단)
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
}

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "✅ 마이그레이션 완료" -ForegroundColor Green
  Write-Host "   env 변수는 자동으로 제거됐습니다. 이 창에서 npm run dev 해도 .env(dev) 사용." -ForegroundColor Gray
} else {
  Write-Host "❌ 마이그레이션 실패 (exit code: $exitCode)" -ForegroundColor Red
  exit $exitCode
}
