# Emergency Cleanup Script for Playwright Process Accumulation
# Run this if you're experiencing high CPU usage from headless_shell.exe processes

Write-Host "EMERGENCY CLEANUP - Playwright Process Accumulation" -ForegroundColor Red
Write-Host "This will forcefully terminate all browser processes and clean up resources" -ForegroundColor Yellow
Write-Host ""

# Function to kill processes safely
function Kill-ProcessSafely {
    param([string]$ProcessName)
    
    try {
        $processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
        if ($processes) {
            Write-Host "Killing $($processes.Count) $ProcessName processes..." -ForegroundColor Yellow
            $processes | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Host "Killed $ProcessName processes" -ForegroundColor Green
        } else {
            Write-Host "No $ProcessName processes found" -ForegroundColor Gray
        }
    } catch {
        Write-Host "Could not kill $ProcessName processes: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Kill the main culprits
Write-Host "Targeting main CPU-intensive processes..." -ForegroundColor Cyan
Kill-ProcessSafely "headless_shell"
Kill-ProcessSafely "chrome"
Kill-ProcessSafely "msedge"
Kill-ProcessSafely "firefox"

# Kill helper processes
Write-Host ""
Write-Host "Cleaning up helper processes..." -ForegroundColor Cyan
Kill-ProcessSafely "chrome_crashpad_handler"
Kill-ProcessSafely "crashpad_handler"
Kill-ProcessSafely "msedgewebview2"

# Clean up development processes that can accumulate
Write-Host ""
Write-Host "Checking development processes..." -ForegroundColor Cyan

# Handle git processes
try {
    $gitProcesses = Get-Process -Name "git" -ErrorAction SilentlyContinue
    if ($gitProcesses -and $gitProcesses.Count -gt 10) {
        Write-Host "Found $($gitProcesses.Count) git processes (threshold: 10), cleaning up excessive ones..." -ForegroundColor Yellow
        $gitProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up excessive git processes" -ForegroundColor Green
    } elseif ($gitProcesses) {
        Write-Host "Git processes: $($gitProcesses.Count) (normal)" -ForegroundColor Gray
    } else {
        Write-Host "No git processes found" -ForegroundColor Gray
    }
} catch {
    Write-Host "Could not check git processes: $($_.Exception.Message)" -ForegroundColor Red
}

# Handle bash processes
try {
    $bashProcesses = Get-Process -Name "bash" -ErrorAction SilentlyContinue
    if ($bashProcesses -and $bashProcesses.Count -gt 5) {
        Write-Host "Found $($bashProcesses.Count) bash processes (threshold: 5), cleaning up excessive ones..." -ForegroundColor Yellow
        $bashProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up excessive bash processes" -ForegroundColor Green
    } elseif ($bashProcesses) {
        Write-Host "Bash processes: $($bashProcesses.Count) (normal)" -ForegroundColor Gray
    } else {
        Write-Host "No bash processes found" -ForegroundColor Gray
    }
} catch {
    Write-Host "Could not check bash processes: $($_.Exception.Message)" -ForegroundColor Red
}

# Clean up other shell processes
Kill-ProcessSafely "sh"
Kill-ProcessSafely "mintty"

# Kill any Playwright-related Node processes
Write-Host ""
Write-Host "Looking for Playwright-related Node processes..." -ForegroundColor Cyan
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    foreach ($proc in $nodeProcesses) {
        try {
            $commandLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if ($commandLine -like "*playwright*" -or $commandLine -like "*test*") {
                Write-Host "Found test-related Node process (PID: $($proc.Id))" -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            # Ignore errors when checking command line
        }
    }
} catch {
    Write-Host "Could not check Node processes" -ForegroundColor Gray
}

# Show final status
Write-Host ""
Write-Host "Final Process Status:" -ForegroundColor Cyan
$headlessShells = Get-Process -Name "headless_shell" -ErrorAction SilentlyContinue
$chromeProcs = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
$edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue

if ($headlessShells) {
    Write-Host "$($headlessShells.Count) headless_shell processes still running" -ForegroundColor Red
} else {
    Write-Host "No headless_shell processes running" -ForegroundColor Green
}

if ($chromeProcs) {
    Write-Host "$($chromeProcs.Count) Chrome processes still running" -ForegroundColor Red
} else {
    Write-Host "No Chrome processes running" -ForegroundColor Green
}

if ($edgeProcs) {
    Write-Host "$($edgeProcs.Count) Edge processes still running" -ForegroundColor Red
} else {
    Write-Host "No Edge processes running" -ForegroundColor Green
}

Write-Host ""
Write-Host "Emergency cleanup completed!" -ForegroundColor Green
Write-Host "You can now run tests again with clean system resources." -ForegroundColor Cyan
Write-Host ""
Write-Host "Quick Tips:" -ForegroundColor Yellow
Write-Host "  Use npm run test:cleanup:force for regular cleanup" -ForegroundColor White
Write-Host "  Run tests with npm run test:e2e (includes auto-cleanup)" -ForegroundColor White
Write-Host "  Monitor Task Manager during tests to catch issues early" -ForegroundColor White

Read-Host "Press Enter to exit"