import { useState, useEffect } from 'react';
import type { Report, RunHistory } from './types';

export function useReport(year?: number, week?: number) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = (year && week) 
      ? `/data/report-${year}-${week}.json`
      : '/data/latest-report.json';
      
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('No report data found');
        return r.json();
      })
      .then((data) => { setReport(data); setLoading(false); setError(null); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [year, week]);

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

export function useNormalizedReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/normalized-reviews.json')
      .then((r) => {
        if (!r.ok) throw new Error('No reviews data found');
        return r.json();
      })
      .then((data) => { setReviews(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  return { reviews, loading, error };
}
