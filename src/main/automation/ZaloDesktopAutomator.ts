import { ZaloSendResult } from '../../shared/types'
import { WorkflowMutex } from './WorkflowMutex'
import {
  ZaloDesktopBridge,
  ZaloDesktopBridgeResult,
  ZaloDesktopCommand,
} from './ZaloDesktopBridge'

export const ZALO_TEST_SEARCH_TERM = 'Dương' as const

export interface ZaloDesktopSender {
  send(command: ZaloDesktopCommand): Promise<ZaloDesktopBridgeResult>
}

export class ZaloDesktopAutomator {
  constructor(
    private readonly bridge: ZaloDesktopSender,
    private readonly debugDir: string,
    private readonly workflowMutex = new WorkflowMutex(),
  ) {}

  sendMessage(input: {
    searchTerm: string
    message: string
  }): Promise<ZaloSendResult> {
    return this.workflowMutex.runExclusive(async () => {
      await this.bridge.send({ ...input, debugDir: this.debugDir })
      return { status: 'sent' }
    })
  }

  async close(): Promise<void> {}
}

export function createZaloDesktopAutomator(
  scriptPath: string,
  debugDir: string,
  workflowMutex: WorkflowMutex,
): ZaloDesktopAutomator {
  return new ZaloDesktopAutomator(
    new ZaloDesktopBridge(scriptPath),
    debugDir,
    workflowMutex,
  )
}
