$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ZaloWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@

function Write-Result($value, [int]$exitCode) {
  [Console]::Out.Write(($value | ConvertTo-Json -Compress -Depth 5))
  exit $exitCode
}

function Normalize-Text([string]$value) {
  if ($null -eq $value) { return '' }
  return (($value -replace [char]0x00A0, ' ') -replace '\s+', ' ').Trim()
}

function Get-Descendants($root) {
  return $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
}

function Test-ContainsAny([string]$value, [string[]]$needles) {
  $text = $value.ToLowerInvariant()
  foreach ($needle in $needles) {
    if ($text.Contains($needle.ToLowerInvariant())) { return $true }
  }
  return $false
}

function Find-Control($root, [string[]]$types, [string[]]$needles) {
  foreach ($element in (Get-Descendants $root)) {
    $type = $element.Current.ControlType.ProgrammaticName
    if ($types -notcontains $type) { continue }
    $identity = "$($element.Current.Name) $($element.Current.AutomationId)"
    if ((Test-ContainsAny $identity $needles) -and $element.Current.IsEnabled) {
      return $element
    }
  }
  return $null
}

function Set-ControlText($element, [string]$text) {
  $pattern = $null
  if ($element.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$pattern
  )) {
    $pattern.SetValue($text)
    return
  }
  $element.SetFocus()
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
  [System.Windows.Forms.Clipboard]::SetText($text)
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}

function Invoke-Control($element) {
  $pattern = $null
  if ($element.TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$pattern
  )) {
    $pattern.Invoke()
    return
  }
  if ($element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$pattern
  )) {
    $pattern.Select()
    return
  }
  $element.SetFocus()
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

function Save-Diagnostics($root, [string]$debugDir) {
  New-Item -ItemType Directory -Path $debugDir -Force | Out-Null
  $controls = foreach ($element in (Get-Descendants $root)) {
    [pscustomobject]@{
      Name = $element.Current.Name
      AutomationId = $element.Current.AutomationId
      ControlType = $element.Current.ControlType.ProgrammaticName
      IsEnabled = $element.Current.IsEnabled
    }
  }
  $controls | ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $debugDir 'zalo-desktop-controls.json') -Encoding UTF8

  $bounds = $root.Current.BoundingRectangle
  if ($bounds.Width -gt 0 -and $bounds.Height -gt 0) {
    $bitmap = New-Object System.Drawing.Bitmap(
      [int]$bounds.Width,
      [int]$bounds.Height
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen(
      [int]$bounds.X,
      [int]$bounds.Y,
      0,
      0,
      $bitmap.Size
    )
    $bitmap.Save(
      (Join-Path $debugDir 'zalo-desktop-error.png'),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$step = 'launch'
$root = $null
try {
  $zalo = Get-Process -Name Zalo -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($null -eq $zalo) {
    $candidates = @(
      "$env:LOCALAPPDATA\Programs\Zalo\Zalo.exe",
      "$env:LOCALAPPDATA\Zalo\Zalo.exe",
      "$env:APPDATA\Zalo\Zalo.exe"
    )
    $executable = $candidates | Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($null -eq $executable) { throw 'Zalo PC application was not found.' }
    Start-Process -FilePath $executable | Out-Null
    $deadline = (Get-Date).AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 250
      $zalo = Get-Process -Name Zalo -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
    } while ($null -eq $zalo -and (Get-Date) -lt $deadline)
  }
  if ($null -eq $zalo) { throw 'Zalo PC main window is not ready.' }

  [ZaloWindow]::ShowWindowAsync($zalo.MainWindowHandle, 9) | Out-Null
  [ZaloWindow]::SetForegroundWindow($zalo.MainWindowHandle) | Out-Null
  $root = [System.Windows.Automation.AutomationElement]::FromHandle(
    $zalo.MainWindowHandle
  )

  $step = 'search'
  $search = Find-Control $root @(
    'ControlType.Edit',
    'ControlType.Document'
  ) @('search', 'txt_main_search')
  if ($null -eq $search) { throw 'Search control was not found.' }
  Set-ControlText $search $request.searchTerm
  Start-Sleep -Milliseconds 700

  $step = 'result'
  $result = $null
  foreach ($element in (Get-Descendants $root)) {
    $type = $element.Current.ControlType.ProgrammaticName
    if (
      $element.Current.IsEnabled -and
      @('ControlType.ListItem', 'ControlType.DataItem') -contains $type
    ) {
      $result = $element
      break
    }
  }
  if ($null -eq $result) { throw "No Zalo result was found for `"$($request.searchTerm)`"." }
  Invoke-Control $result
  Start-Sleep -Milliseconds 500

  $step = 'composer'
  $composer = Find-Control $root @(
    'ControlType.Edit',
    'ControlType.Document'
  ) @('message', 'composer', 'richinput')
  if ($null -eq $composer) { throw 'Message composer was not found.' }
  Set-ControlText $composer $request.message

  $step = 'send'
  $send = Find-Control $root @('ControlType.Button') @('send')
  if ($null -ne $send) {
    Invoke-Control $send
  } else {
    $composer.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }

  $step = 'verify'
  $expected = Normalize-Text $request.message
  $verified = $false
  $deadline = (Get-Date).AddSeconds(10)
  do {
    foreach ($element in (Get-Descendants $root)) {
      if ((Normalize-Text $element.Current.Name) -eq $expected) {
        $verified = $true
        break
      }
    }
    if (-not $verified) { Start-Sleep -Milliseconds 250 }
  } while (-not $verified -and (Get-Date) -lt $deadline)
  if (-not $verified) { throw 'The sent message could not be verified.' }

  Write-Result @{ status = 'sent' } 0
} catch {
  if ($null -ne $root) {
    try { Save-Diagnostics $root $request.debugDir } catch {}
  }
  Write-Result @{
    status = 'error'
    step = $step
    message = $_.Exception.Message
  } 1
}
