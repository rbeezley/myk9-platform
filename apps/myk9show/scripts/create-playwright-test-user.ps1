# Create Playwright Test User PowerShell Script
# This script creates a test user using the Supabase CLI

param(
    [string]$Email = "test@playwright.com",
    [string]$Password = "TestUser123!",
    [string]$ProjectRef = $null
)

Write-Host "🚀 Creating Playwright test user..." -ForegroundColor Green

# Check if Supabase CLI is installed
try {
    $supabaseVersion = supabase --version
    Write-Host "✅ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Get project reference if not provided
if (-not $ProjectRef) {
    Write-Host "📋 Getting project reference..." -ForegroundColor Cyan
    try {
        $status = supabase status --output json | ConvertFrom-Json
        $ProjectRef = $status.api_url -replace "https://", "" -replace "\.supabase\.co.*", ""
        Write-Host "✅ Project reference: $ProjectRef" -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not get project reference. Make sure you're in the project directory and logged in." -ForegroundColor Red
        Write-Host "   Run: supabase login" -ForegroundColor Yellow
        exit 1
    }
}

# Create the user using Supabase CLI
Write-Host "👤 Creating auth user..." -ForegroundColor Cyan

$createUserCommand = @"
supabase auth users create $Email --password $Password --project-ref $ProjectRef
"@

try {
    Invoke-Expression $createUserCommand
    Write-Host "✅ Auth user created successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to create auth user. Error: $_" -ForegroundColor Red
    Write-Host "💡 The user might already exist or there might be a configuration issue." -ForegroundColor Yellow
}

# Run the migration to create the profile
Write-Host "📊 Applying migration for user profile..." -ForegroundColor Cyan
try {
    supabase db push
    Write-Host "✅ Migration applied successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Migration might have already been applied" -ForegroundColor Yellow
}

Write-Host "`n🎉 Test user setup complete!" -ForegroundColor Green
Write-Host "`nCredentials for Playwright tests:" -ForegroundColor Cyan
Write-Host "   Email: $Email" -ForegroundColor White
Write-Host "   Password: $Password" -ForegroundColor White
Write-Host "   Role: exhibitor" -ForegroundColor White

Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Update your Playwright tests to use these credentials" -ForegroundColor White
Write-Host "2. Run your E2E tests to verify the setup" -ForegroundColor White
Write-Host "3. Check that the user can browse shows and view details" -ForegroundColor White