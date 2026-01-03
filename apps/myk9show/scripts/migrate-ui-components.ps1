# UI Component Migration Script
# This script will restructure the UI components into individual directories

# List of UI components to migrate
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

# Base paths
$basePath = 'd:\AI Projects\myK9Show-Windsurf\src\components\ui'
$backupPath = 'd:\AI Projects\myK9Show-Windsurf\src\components\ui-backup-20240525'

# Create a log file
$logFile = "$PSScriptRoot\ui-migration-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
"Migration started at $(Get-Date)" | Out-File -FilePath $logFile -Append

# Function to create component directory and move files
function Migrate-Component {
    param (
        [string]$componentName
    )

    $originalFile = "$basePath\$componentName.tsx"
    $componentDir = "$basePath\$componentName"
    $newFile = "$componentDir\$componentName.tsx"
    $indexFile = "$componentDir\index.ts"

    # Skip if already migrated
    if (Test-Path $componentDir) {
        "$(Get-Date) - Skipping $componentName (already migrated)" | Out-File -FilePath $logFile -Append
        return
    }

    # Create component directory
    New-Item -ItemType Directory -Path $componentDir -Force | Out-Null

    # Move component file
    if (Test-Path $originalFile) {
        Move-Item -Path $originalFile -Destination $newFile -Force
        "$(Get-Date) - Moved $componentName.tsx" | Out-File -FilePath $logFile -Append
    }

    # Create index.ts file
    $exportName = $componentName -replace '-', ''
    $exportName = $exportName.Substring(0,1).ToUpper() + $exportName.Substring(1)
    "export * from './$componentName';" | Out-File -FilePath $indexFile -Encoding utf8
    "$(Get-Date) - Created index.ts for $componentName" | Out-File -FilePath $logFile -Append
}

# Process each component
foreach ($component in $components) {
    try {
        Migrate-Component -componentName $component
    }
    catch {
        "$(Get-Date) - Error processing $component : $_" | Out-File -FilePath $logFile -Append
    }
}

# Update the main UI index.ts
$mainIndex = @"
// This file is auto-generated. Do not modify manually.

"@

# Add exports for each component
foreach ($component in $components) {
    $exportName = $component -replace '-', ''
    $exportName = $exportName.Substring(0,1).ToUpper() + $exportName.Substring(1)
    $mainIndex += "export * from './$component';`n"
}

$mainIndex | Out-File -FilePath "$basePath\index.ts" -Encoding utf8
"$(Get-Date) - Updated main index.ts" | Out-File -FilePath $logFile -Append

"Migration completed at $(Get-Date)" | Out-File -FilePath $logFile -Append
Write-Host "UI component migration completed. Check $logFile for details."
