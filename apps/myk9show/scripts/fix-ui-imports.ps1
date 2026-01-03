# Script to fix UI component imports after migration

$projectRoot = 'd:\AI Projects\myK9Show-Windsurf'
$logFile = "$PSScriptRoot\fix-imports-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# List of UI components and their new paths
$components = @(
    'accordion',
    'alert-dialog',
    'avatar',
    'badge',
    'button',
    'calendar',
    'card',
    'checkbox',
    'date-picker',
    'dialog',
    'dropdown-menu',
    'input',
    'label',
    'popover',
    'scroll-area',
    'select',
    'separator',
    'table',
    'tabs',
    'textarea',
    'tooltip',
    'PremiumBadge',
    'ThreeDotMenu'
)

# Initialize counters
$totalFiles = 0
$updatedFiles = 0

"Starting import fixes at $(Get-Date)" | Out-File -FilePath $logFile -Append

# Process each TypeScript/TypeScript React file
Get-ChildItem -Path $projectRoot -Recurse -Include '*.ts', '*.tsx' | 
    Where-Object { $_.FullName -notlike '*\node_modules\*' -and $_.FullName -notlike '*\dist\*' } |
    ForEach-Object {
        $file = $_
        $content = Get-Content -Path $file.FullName -Raw
        $originalContent = $content
        $fileUpdated = $false
        
        foreach ($component in $components) {
            # Handle different import patterns
            $patterns = @(
                "from ['`"]@/components/ui/$component['`"]",
                "from ['`"]@/components/ui/$component/['`"]",
                "from ['`"]@/components/ui/$component/index['`"]"
            )
            
            $newImport = "from '@/components/ui/$component'"
            
            foreach ($pattern in $patterns) {
                if ($content -match $pattern) {
                    $content = $content -replace [regex]::Escape($pattern), $newImport
                    $fileUpdated = $true
                    "Updated import in $($file.FullName) : $pattern -> $newImport" | Out-File -FilePath $logFile -Append
                }
            }
        }
        
        if ($fileUpdated) {
            $content | Set-Content -Path $file.FullName -NoNewline
            $updatedFiles++
            Write-Host "Updated: $($file.FullName)"
        }
        
        $totalFiles++
    }

"Import fixes completed at $(Get-Date)" | Out-File -FilePath $logFile -Append
"Updated $updatedFiles out of $totalFiles files" | Out-File -FilePath $logFile -Append

Write-Host "Import fixes completed. Updated $updatedFiles out of $totalFiles files."
Write-Host "Check $logFile for details."
