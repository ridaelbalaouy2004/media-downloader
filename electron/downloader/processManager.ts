import { ChildProcess } from 'child_process';

interface ManagedProcess {
  process: ChildProcess;
  jobId: string;
  killed: boolean;
}

class ProcessManager {
  private processes = new Map<string, ManagedProcess[]>();

  /**
   * Register a child process for a given job.
   */
  register(jobId: string, proc: ChildProcess): void {
    if (!this.processes.has(jobId)) {
      this.processes.set(jobId, []);
    }
    const managed: ManagedProcess = { process: proc, jobId, killed: false };
    this.processes.get(jobId)!.push(managed);

    // Auto-clean when process exits
    proc.on('exit', () => {
      const procs = this.processes.get(jobId) || [];
      const idx = procs.indexOf(managed);
      if (idx !== -1) procs.splice(idx, 1);
      if (procs.length === 0) this.processes.delete(jobId);
    });
  }

  /**
   * Unregister all processes for a given job.
   */
  unregister(jobId: string): void {
    this.processes.delete(jobId);
  }

  /**
   * Kill all processes for a given job.
   */
  killJob(jobId: string): void {
    const procs = this.processes.get(jobId) || [];
    for (const managed of procs) {
      if (!managed.killed) {
        managed.killed = true;
        try {
          // Kill process tree on Windows
          if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            try {
              execSync(`taskkill /F /T /PID ${managed.process.pid}`, { stdio: 'ignore' });
            } catch {
              managed.process.kill('SIGTERM');
            }
          } else {
            managed.process.kill('SIGTERM');
            setTimeout(() => {
              if (!managed.process.killed) {
                managed.process.kill('SIGKILL');
              }
            }, 3000);
          }
        } catch {
          // Process may have already exited
        }
      }
    }
    this.processes.delete(jobId);
  }

  /**
   * Kill all running processes (used on app shutdown).
   */
  killAll(): void {
    for (const jobId of this.processes.keys()) {
      this.killJob(jobId);
    }
  }

  /**
   * Check if a job has any running processes.
   */
  hasRunningProcesses(jobId: string): boolean {
    const procs = this.processes.get(jobId);
    return (procs?.length || 0) > 0;
  }
}

export const processManager = new ProcessManager();
