import { useState, useEffect } from 'react';
import type { Report, RunHistory } from './types';

export function useReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/latest-report.json')
      .then((r) => {
        if (!r.ok) throw new Error('No report data found');
        return r.json();
      })
      .then((data) => { setReport(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  return { report, loading, error };
}

export function useHistory() {
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/run-history.json')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setHistory(data); setLoading(false); })
      .catch(() => { setHistory([]); setLoading(false); });
  }, []);

  return { history, loading };
}
