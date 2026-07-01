Viewed .env:26-43
Listed directory installer
Listed directory bootstrap
Viewed Program.cs:1-200
Viewed AlamsBootstrap.csproj:1-16
Ran command: `dotnet publish installer/bootstrap/AlamsBootstrap.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "installer"`
Listed directory client
Listed directory ALAMS_Pilot_v1.0
Listed directory client
Listed directory installer
Edited compile_bootstrap.bat
Ran command: `git add installer/compile_bootstrap.bat
git commit -m "feat: add compilation helper script for bootstrap installer"
git push`

There are **no pre-compiled `.exe` files** (such as `bootstrap_installer.exe`, `AlamsClient.exe`, or `AlamsWatchdog.exe`) committed directly in the Git repository to avoid repository bloat. 

Instead, the source code for the workstation bootstrap wizard is stored under the [installer/bootstrap](file:///d:/Project%20Data%20Aurxon/ALAMS/installer/bootstrap) directory. 

### How to Generate `bootstrap_installer.exe`

I have created and pushed a new automation script to compile the bootstrap binary for you: [compile_bootstrap.bat](file:///d:/Project%20Data%20Aurxon/ALAMS/installer/compile_bootstrap.bat).

1.  Ensure you have the **.NET 8 SDK** installed (install it via PowerShell with `winget install Microsoft.DotNet.SDK.8` or download it from Microsoft's website).
2.  Double-click or run the script:
    ```powershell
    d:\Project Data Aurxon\ALAMS\installer\compile_bootstrap.bat
    ```
3.  This script will automatically publish the C# code as a self-contained, single-file executable and rename it to `bootstrap_installer.exe` inside the [installer/](file:///d:/Project%20Data%20Aurxon/ALAMS/installer/) folder.

Once compiled, you can copy this resulting `.exe` to your student workstations to begin automated registrations.