import { spawn } from 'node:child_process'

export interface ZaloDesktopCommand {
  searchTerm: string
  message: string
  debugDir: string
}

export type ZaloDesktopBridgeResult = { status: 'sent' }

interface ProcessResult {
  exitCode: number
  stdout: string
  stderr: string
}

type ProcessRunner = (
  executable: string,
  args: string[],
  stdin: string,
) => Promise<ProcessResult>

export const POWERSHELL_EXE =
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

export const runPowerShell: ProcessRunner = (executable, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.stdin.end(stdin, 'utf8')
  })

export class ZaloDesktopBridge {
  constructor(
    private readonly scriptPath: string,
    private readonly run: ProcessRunner = runPowerShell,
  ) {}

  async send(command: ZaloDesktopCommand): Promise<ZaloDesktopBridgeResult> {
    const processResult = await this.run(
      POWERSHELL_EXE,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.scriptPath,
      ],
      JSON.stringify(command),
    )

    let result: {
      status?: string
      step?: string
      message?: string
    }
    try {
      result = JSON.parse(processResult.stdout.trim())
    } catch {
      throw new Error(
        `Zalo PC trả về dữ liệu không hợp lệ${processResult.stderr ? `: ${processResult.stderr.trim()}` : ''}`,
      )
    }
    if (processResult.exitCode !== 0 || result.status !== 'sent') {
      throw new Error(
        `Zalo PC [${result.step ?? 'unknown'}]: ${result.message ?? (processResult.stderr.trim() || 'Không rõ lỗi')}`,
      )
    }
    return { status: 'sent' }
  }
}
