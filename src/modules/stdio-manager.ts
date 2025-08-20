import { spawn, ChildProcess } from 'node:child_process'
import { Logger } from '../utils/logger.js'
import type { ServerProcess } from '../types/server.js'

export class StdioManager {
  private processes = new Map<string, ChildProcess>()
  private responseQueues = new Map<string, Array<{ resolve: (value: any) => void; reject: (reason: any) => void; id: number | string }>>()
  private messageBuffers = new Map<string, string>()

  async startServer(serverId: string, filePath: string, env?: Record<string, string>): Promise<ServerProcess> {
    Logger.info('Starting STDIO server', { serverId, filePath })
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout starting STDIO server ${serverId}`))
      }, 10000) // 10 second timeout

      try {
        const proc = spawn('node', [filePath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...env }
        })

        // Set up event handlers
        proc.stdout?.on('data', (data) => {
          this.handleStdoutData(serverId, data.toString())
        })

        proc.stderr?.on('data', (data) => {
          Logger.warn('STDIO server stderr', { serverId, data: data.toString() })
        })

        proc.on('close', (code) => {
          Logger.info('STDIO server process closed', { serverId, code })
          this.cleanupProcess(serverId, new Error(`STDIO server ${serverId} process closed with code ${code}`))
        })

        proc.on('error', (err) => {
          Logger.error('STDIO server process error', { serverId, error: err })
          clearTimeout(timeout)
          this.rejectPendingRequests(serverId, err)
          reject(err)
        })

        // Check if process started successfully
        proc.on('spawn', () => {
          clearTimeout(timeout)
          this.processes.set(serverId, proc)
          this.responseQueues.set(serverId, [])
          this.messageBuffers.set(serverId, '')

          resolve({
            pid: proc.pid,
            stop: async () => {
              return new Promise((resolve) => {
                if (proc.connected) {
                  proc.kill()
                  setTimeout(() => resolve(), 1000) // Wait 1 second for graceful shutdown
                } else {
                  resolve()
                }
              })
            }
          })
        })
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  private handleStdoutData(serverId: string, data: string) {
    const buffer = this.messageBuffers.get(serverId) || ''
    const newBuffer = buffer + data
    
    // Try to parse complete JSON messages
    let remainingBuffer = newBuffer
    while (remainingBuffer.trim().startsWith('{')) {
      try {
        // Try to parse as JSON
        const trimmed = remainingBuffer.trim()
        let endIndex = 1
        let braceCount = 1
        
        // Find the matching closing brace
        for (let i = 1; i < trimmed.length; i++) {
          if (trimmed[i] === '{') {
            braceCount++
          } else if (trimmed[i] === '}') {
            braceCount--
            if (braceCount === 0) {
              endIndex = i + 1
              break
            }
          }
        }
        
        if (braceCount === 0) {
          // Found complete JSON object
          const jsonString = trimmed.substring(0, endIndex)
          const message = JSON.parse(jsonString)
          
          // Process the message
          this.processMessage(serverId, message)
          
          // Update buffer to remaining data
          remainingBuffer = trimmed.substring(endIndex)
          // Skip any whitespace after the JSON object
          remainingBuffer = remainingBuffer.replace(/^\\s+/, '')
        } else {
          // Incomplete JSON, wait for more data
          break
        }
      } catch (err) {
        // Incomplete JSON or parsing error, wait for more data
        break
      }
    }
    
    this.messageBuffers.set(serverId, remainingBuffer)
  }

  private processMessage(serverId: string, message: any) {
    Logger.debug('Received message from STDIO server', { serverId, message })
    
    // Check if this is a response to a pending request
    const queue = this.responseQueues.get(serverId)
    if (queue) {
      // Find the matching request in the queue
      const index = queue.findIndex(item => item.id === message.id)
      if (index !== -1) {
        const { resolve } = queue.splice(index, 1)[0]
        resolve(message)
        return
      }
    }
    
    // Handle notifications (no id) or unmatched responses
    Logger.debug('Received notification or unmatched response from STDIO server', { serverId, message })
    // TODO: Handle notifications and other message types
  }

  async sendMessage(serverId: string, message: any): Promise<void> {
    const proc = this.processes.get(serverId)
    if (!proc || !proc.stdin) {
      throw new Error(`STDIO server ${serverId} not found or not connected`)
    }

    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message) + '\n'
      proc.stdin?.write(messageStr, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async waitForResponse(serverId: string, messageId: number | string, timeoutMs = 30000): Promise<any> {
    const proc = this.processes.get(serverId)
    if (!proc) {
      throw new Error(`STDIO server ${serverId} not found`)
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove the pending request from the queue
        const queue = this.responseQueues.get(serverId) || []
        const index = queue.findIndex(item => item.id === messageId)
        if (index !== -1) {
          queue.splice(index, 1)
        }
        reject(new Error(`Timeout waiting for response from STDIO server ${serverId} for message ${messageId}`))
      }, timeoutMs)

      // Add to response queue
      const queue = this.responseQueues.get(serverId) || []
      queue.push({
        id: messageId,
        resolve: (value: any) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (reason: any) => {
          clearTimeout(timeout)
          reject(reason)
        }
      })
      this.responseQueues.set(serverId, queue)
    })
  }

  private rejectPendingRequests(serverId: string, error: any) {
    const queue = this.responseQueues.get(serverId)
    if (queue) {
      while (queue.length > 0) {
        const { reject } = queue.shift()!
        reject(error)
      }
    }
  }

  private cleanupProcess(serverId: string, error?: any) {
    this.rejectPendingRequests(serverId, error || new Error(`STDIO server ${serverId} process closed`))
    this.processes.delete(serverId)
    this.responseQueues.delete(serverId)
    this.messageBuffers.delete(serverId)
  }
}