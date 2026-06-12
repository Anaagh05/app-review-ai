import type { RunHistory } from '../types';

interface Props { history: RunHistory[]; }

const STATUS_LABELS: Record<string, string> = {
  success: '✓ Success',
  failed:  '✗ Failed',
  running: '⟳ Running',
  partial: '⚠ Partial',
};

export default function HistoryPage({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🕓</div>
        <h3>No run history yet</h3>
        <p>History appears here after your first successful <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>npm run pulse:run</code>.</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">Run History</div>
          <div className="section-subtitle">Last {history.length} pipeline runs</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backdropFilter: 'blur(12px)', overflow: 'hidden' }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Status</th>
              <th>Reviews</th>
              <th>Themes</th>
              <th>Started</th>
              <th>Doc</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.id}>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>W{run.isoWeek}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{run.isoYear}</span>
                </td>
                <td>
                  <span className={`status-badge ${run.status}`}>
                    {STATUS_LABELS[run.status] ?? run.status}
                  </span>
                  {run.errorMessage && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                      {run.errorMessage}
                    </div>
                  )}
                </td>
                <td>{run.reviewsFetched ?? '—'}</td>
                <td>{run.clustersFound ?? '—'}</td>
                <td style={{ fontSize: 12 }}>
                  {run.runStartedAt
                    ? new Date(run.runStartedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
                <td>
                  {run.docUrl ? (
                    <a className="delivery-link" href={run.docUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      View →
                    </a>
                  ) : '—'}
                </td>
                <td>
                  {run.emailMode === 'draft' && <span className="locked-badge">🔒 Draft</span>}
                  {run.emailMode === 'sent' && <span style={{ color: 'var(--groww-green)', fontSize: 12 }}>✓ Sent</span>}
                  {(!run.emailMode || run.emailMode === 'skipped') && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
