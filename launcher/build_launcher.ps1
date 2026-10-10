param (
    [string]$ProjectRoot = ".."
)

# Go to project root (where the venv is) if ran from within launcher/
if (Test-Path "openchat_launcher.py") {
    cd ..
}

$PyInstallerPath = ".\backend\venv\Scripts\pyinstaller.exe"
if (-Not (Test-Path $PyInstallerPath)) {
    Write-Host "Installing PyInstaller..."
    .\backend\venv\Scripts\python.exe -m pip install pyinstaller
}

Write-Host "Building OpenChat.exe..."
# Build onefile, windowed (no terminal console popup)
& $PyInstallerPath --noconfirm --onefile --windowed --name OpenChat ".\launcher\openchat_launcher.py"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful. Moving OpenChat.exe to project root..."
    Move-Item -Force ".\dist\OpenChat.exe" ".\OpenChat.exe"
    
    # Cleanup build artifacts
    Remove-Item -Recurse -Force ".\build"
    Remove-Item -Recurse -Force ".\dist"
    Remove-Item -Force "OpenChat.spec"
    
    Write-Host "Done! OpenChat.exe is ready."
} else {
    Write-Host "Build failed."
}
