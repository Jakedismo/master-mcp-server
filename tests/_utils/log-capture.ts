export class LogCapture {
  private originalLog = console.log
  private originalError = console.error
  private logs: string[] = []
  private errors: string[] = []

  start(): void {
    console.log = (...args: any[]) => {
      try { this.logs.push(args.map(String).join(' ')) } catch {}
      this.originalLog.apply(console, args as any)
    }
    console.error = (...args: any[]) => {
      try { this.errors.push(args.map(String).join(' ')) } catch {}
      this.originalError.apply(console, args as any)
    }
  }

  stop(): void {
    console.log = this.originalLog
    console.error = this.originalError
  }

  find(substr: string): boolean {
    return this.logs.concat(this.errors).some((l) => l.includes(substr))
  }

  dump(): { logs: string[]; errors: string[] } {
    return { logs: [...this.logs], errors: [...this.errors] }
  }
}

