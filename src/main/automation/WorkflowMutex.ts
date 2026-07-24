export class WorkflowMutex {
  private tail: Promise<void> = Promise.resolve()

  async runExclusive<T>(workflow: () => Promise<T>): Promise<T> {
    let release!: () => void
    const previous = this.tail
    this.tail = new Promise<void>(resolve => { release = resolve })

    await previous
    try {
      return await workflow()
    } finally {
      release()
    }
  }
}
