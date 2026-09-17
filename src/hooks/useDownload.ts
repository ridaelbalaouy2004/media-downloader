import { useState, useEffect, useCallback } from 'react';
import type { DownloadJob, DownloadProgress } from '../types';
import { ipc } from '../services/ipc';

export function useDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [concurrency, setConcurrencyState] = useState<number>(1);

  const loadJobs = useCallback(() => {
    ipc.getJobs().then(result => {
      if (result.success && result.data) {
        setJobs(result.data);
      }
    });
  }, []);

  useEffect(() => {
    // Load existing jobs on mount
    loadJobs();

    // Load initial concurrency
    ipc.getConcurrency().then(res => {
      if (res.success && typeof res.data === 'number') {
        setConcurrencyState(res.data);
      }
    });

    // Listen for job updates
    const unsubJob = ipc.onJobUpdate((job: DownloadJob) => {
      setJobs(prev => {
        const idx = prev.findIndex(j => j.jobId === job.jobId);
        if (idx === -1) {
          return [job, ...prev];
        }
        const next = [...prev];
        next[idx] = job;
        return next;
      });
    });

    // Listen for progress updates (finer-grained than job updates)
    const unsubProgress = ipc.onDownloadProgress((progress: DownloadProgress) => {
      setJobs(prev => {
        return prev.map(j =>
          j.jobId === progress.jobId
            ? { ...j, progress, status: progress.status }
            : j
        );
      });
    });

    return () => {
      unsubJob();
      unsubProgress();
    };
  }, [loadJobs]);

  const pauseDownload = useCallback(async (jobId: string) => {
    setJobs(prev =>
      prev.map(j =>
        j.jobId === jobId
          ? { ...j, status: 'paused', progress: { ...j.progress, status: 'paused', stage: 'Paused', speed: null } }
          : j
      )
    );
    await ipc.pauseDownload(jobId);
  }, []);

  const resumeDownload = useCallback(async (jobId: string) => {
    setJobs(prev =>
      prev.map(j =>
        j.jobId === jobId
          ? { ...j, status: 'queued', progress: { ...j.progress, status: 'queued', stage: 'Queued' } }
          : j
      )
    );
    await ipc.resumeDownload(jobId);
  }, []);

  const retryDownload = useCallback(async (jobId: string) => {
    setJobs(prev =>
      prev.map(j =>
        j.jobId === jobId
          ? { ...j, status: 'queued', error: null, errorDetails: null, progress: { ...j.progress, status: 'queued', stage: 'Queued', percent: 0 } }
          : j
      )
    );
    await ipc.retryDownload(jobId);
  }, []);

  const cancelDownload = useCallback(async (jobId: string) => {
    setJobs(prev =>
      prev.map(j =>
        j.jobId === jobId
          ? { ...j, status: 'cancelled', progress: { ...j.progress, status: 'cancelled', stage: 'Cancelled', speed: null } }
          : j
      )
    );
    await ipc.cancelDownload(jobId);
  }, []);

  const dismissJob = useCallback(async (jobId: string) => {
    setJobs(prev => prev.filter(j => j.jobId !== jobId));
    try {
      await ipc.dismissJob(jobId);
    } catch (err) {
      console.error('Failed to dismiss job:', err);
    }
  }, []);

  const pauseAll = useCallback(async () => {
    setJobs(prev =>
      prev.map(j =>
        ['downloading', 'queued', 'analyzing', 'merging'].includes(j.status)
          ? { ...j, status: 'paused', progress: { ...j.progress, status: 'paused', stage: 'Paused', speed: null } }
          : j
      )
    );
    await ipc.pauseAll();
  }, []);

  const resumeAll = useCallback(async () => {
    setJobs(prev =>
      prev.map(j =>
        j.status === 'paused'
          ? { ...j, status: 'queued', progress: { ...j.progress, status: 'queued', stage: 'Queued' } }
          : j
      )
    );
    await ipc.resumeAll();
  }, []);

  const cancelAll = useCallback(async () => {
    setJobs(prev =>
      prev.map(j =>
        ['downloading', 'queued', 'analyzing', 'merging', 'paused'].includes(j.status)
          ? { ...j, status: 'cancelled', progress: { ...j.progress, status: 'cancelled', stage: 'Cancelled', speed: null } }
          : j
      )
    );
    await ipc.cancelAll();
  }, []);

  const clearCompleted = useCallback(async () => {
    setJobs(prev => prev.filter(j => j.status !== 'completed'));
    await ipc.clearCompleted();
  }, []);

  const clearFailed = useCallback(async () => {
    setJobs(prev => prev.filter(j => j.status !== 'failed' && j.status !== 'cancelled'));
    await ipc.clearFailed();
  }, []);

  const setConcurrency = useCallback(async (n: number) => {
    const val = Math.max(1, Math.min(3, n));
    setConcurrencyState(val);
    await ipc.setConcurrency(val);
  }, []);

  const activeJobs = jobs.filter(j =>
    ['downloading', 'analyzing', 'merging', 'finalizing'].includes(j.status)
  );

  const queuedJobs = jobs.filter(j => j.status === 'queued');

  const pausedJobs = jobs.filter(j => j.status === 'paused');

  const completedJobs = jobs.filter(j => j.status === 'completed');

  const failedJobs = jobs.filter(j => j.status === 'failed' || j.status === 'cancelled');

  return {
    jobs,
    activeJobs,
    queuedJobs,
    pausedJobs,
    completedJobs,
    failedJobs,
    concurrency,
    setConcurrency,
    pauseDownload,
    resumeDownload,
    retryDownload,
    cancelDownload,
    dismissJob,
    pauseAll,
    resumeAll,
    cancelAll,
    clearCompleted,
    clearFailed,
    refreshJobs: loadJobs,
  };
}
