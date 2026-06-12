import { useNormalizedReviews } from '../hooks';
import type { StoredReview } from '../types';

export default function ReviewsPage() {
  const { reviews, loading, error } = useNormalizedReviews();

  if (loading) {
    return (
      <div className="empty-state">
        <div className="skeleton" style={{ height: 400, width: '100%', borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !reviews || reviews.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📭</div>
        <h3>No reviews data</h3>
        <p>Run <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>npm run pulse:run</code> locally to fetch reviews.</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="section-title">Normalized Reviews ({reviews.length})</div>
          <div className="section-subtitle">Raw review data ingested across platforms</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Source</th>
              <th style={{ width: '60px' }}>Rating</th>
              <th style={{ width: '120px' }}>Date</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r: StoredReview, i: number) => (
              <tr key={i}>
                <td>
                  <span className="status-badge" style={{ 
                    background: r.source === 'play_store' ? 'rgba(52,211,153,0.15)' : 'rgba(99,102,241,0.15)',
                    color: r.source === 'play_store' ? 'var(--green)' : 'var(--accent)'
                  }}>
                    {r.source === 'play_store' ? 'Play' : 'App'}
                  </span>
                </td>
                <td style={{ color: 'var(--yellow)', fontWeight: 'bold' }}>
                  {r.rating}★
                </td>
                <td style={{ fontSize: '12px' }}>
                  {new Date(r.date).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {r.title || 'Review'}
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
                    {r.body}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
