import { useState, useEffect, useCallback, useRef } from 'react';
import type { DownloadJob, DownloadProgress } from '../types';
import { ipc } from '../services/ipc';

export function useDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    // Load existing jobs on mount
    ipc.getJobs().then(result => {
      if (result.success && result.data) {
        setJobs(result.data);
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
  }, []);

  const cancelDownload = useCallback(async (jobId: string) => {
    await ipc.cancelDownload(jobId);
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.jobId !== jobId));
  }, []);

  const activeJobs = jobs.filter(j =>
    ['queued', 'analyzing', 'downloading', 'merging', 'finalizing'].includes(j.status)
  );

  const completedJobs = jobs.filter(j =>
    ['completed', 'cancelled', 'failed'].includes(j.status)
  );

  return {
    jobs,
    activeJobs,
    completedJobs,
    cancelDownload,
    dismissJob,
  };
}
