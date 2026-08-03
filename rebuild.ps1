# Rebuild frontend
cd "C:\AD Pro\public\frontend"
npm run build

# Deploy to backend static folder
Copy-Item -Path "dist\*" -Destination "C:\AD Pro\public\backend\static" -Recurse -Force

# Restart the service
schtasks /end /tn "AD Manager Pro"
Start-Sleep -Seconds 3
Get-Process | Where-Object { $_.ProcessName -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
schtasks /run /tn "AD Manager Pro"

# Wait and verify
Write-Host "Waiting 10 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

try {
    $wc = New-Object System.Net.WebClient
    $r = $wc.DownloadString("http://localhost:8080/api/health")
    Write-Host "SUCCESS: $r" -ForegroundColor Green
} catch {
    Write-Host "Not responding yet, checking process..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -like "*python*" } | Format-Table Id, ProcessName -AutoSize
}