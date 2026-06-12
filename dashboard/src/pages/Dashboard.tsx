import { useEffect, useRef, useState } from 'react';
import type { Report, Theme } from '../types';

interface Props {
  report: Report | null;
  loading: boolean;
  error: string | null;
}

// Animated counter hook
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function KPICard({ label, value, sub, icon }: { label: string; value: number; sub: string; icon: string }) {
  const animated = useCountUp(value);
  return (
    <div className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{animated.toLocaleString()}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function ratingClass(avg?: number) {
  if (!avg) return 'neutral';
  if (avg >= 4) return 'positive';
  if (avg <= 2.5) return 'negative';
  return 'neutral';
}

function ThemeCard({ theme, index }: { theme: Theme; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cls = ratingClass(theme.avgRating);
  const emoji = cls === 'positive' ? '🟢' : cls === 'negative' ? '🔴' : '🟡';

  return (
    <div className="theme-card" onClick={() => setExpanded(!expanded)}>
      <div className="theme-header">
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Theme {index + 1}
          </div>
          <div className="theme-name">{theme.name}</div>
        </div>
        <div className="theme-meta">
          {theme.avgRating && (
            <span className={`rating-badge ${cls}`}>
              {emoji} {theme.avgRating.toFixed(1)}★
            </span>
          )}
          <span className="review-count-badge">{theme.reviewCount} reviews</span>
        </div>
      </div>

      <p className="theme-description">{theme.description}</p>

      <div className="quotes-list">
        {theme.representativeQuotes.slice(0, expanded ? undefined : 2).map((q, i) => (
          <div key={i} className="quote-block">"{q}"</div>
        ))}
        {!expanded && theme.representativeQuotes.length > 2 && (
          <div style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>
            +{theme.representativeQuotes.length - 2} more quotes →
          </div>
        )}
      </div>

      {expanded && (
        <div className="actions-list">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, marginTop: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action Ideas
          </div>
          {theme.actionIdeas.map((a, i) => (
            <div key={i} className="action-item">{a}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'right' }}>
        {expanded ? '↑ collapse' : '↓ expand for action ideas'}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="theme-card" style={{ gap: 12, display: 'flex', flexDirection: 'column' }}>
      <div className="skeleton" style={{ height: 20, width: '60%' }} />
      <div className="skeleton" style={{ height: 14, width: '100%' }} />
      <div className="skeleton" style={{ height: 14, width: '85%' }} />
      <div className="skeleton" style={{ height: 40 }} />
      <div className="skeleton" style={{ height: 40 }} />
    </div>
  );
}

export default function DashboardPage({ report, loading, error }: Props) {
  if (loading) {
    return (
      <>
        <div className="kpi-row">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 32, width: '50%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '80%' }} />
            </div>
          ))}
        </div>
        <div className="themes-grid">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </>
    );
  }

  if (error || !report) {
    return (
      <div className="empty-state">
        <div className="icon">📭</div>
        <h3>No report data yet</h3>
        <p>Run <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>npm run pulse:run</code> locally to generate the first report.</p>
      </div>
    );
  }

  const generatedDate = new Date(report.generatedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <>
      {/* Page header */}
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="section-title">
            {report.product.charAt(0).toUpperCase() + report.product.slice(1)} — Review Pulse
          </div>
          <div className="section-subtitle">
            Week {report.isoWeek} · {report.isoYear} &nbsp;·&nbsp; {report.reviewWindowWeeks}-week rolling window &nbsp;·&nbsp; Generated {generatedDate}
          </div>
        </div>
        <span className="status-badge success">✓ Delivered</span>
      </div>

      {/* KPI row */}
      <div className="kpi-row">
        <KPICard
          label="Reviews Analysed"
          value={report.totalReviewsAnalyzed}
          sub={`Last ${report.reviewWindowWeeks} weeks`}
          icon="📝"
        />
        <KPICard
          label="Themes Found"
          value={report.themes.length}
          sub="Semantic clusters"
          icon="🎯"
        />
        <KPICard
          label="Avg Rating"
          value={0}
          sub="See theme cards below"
          icon="⭐"
        />
        <KPICard
          label="Action Ideas"
          value={report.themes.reduce((s, t) => s + t.actionIdeas.length, 0)}
          sub="Product team tasks"
          icon="⚡"
        />
      </div>

      {/* Themes */}
      <div className="section-header">
        <div>
          <div className="section-title">Top Themes</div>
          <div className="section-subtitle">Click any card to expand action ideas</div>
        </div>
      </div>

      <div className="themes-grid">
        {report.themes.map((theme, i) => (
          <ThemeCard key={i} theme={theme} index={i} />
        ))}
      </div>

      {/* Delivery banner */}
      <div className="delivery-banner">
        <div className="delivery-item">
          📄 Google Doc
          {report.docUrl ? (
            <a className="delivery-link" href={report.docUrl} target="_blank" rel="noreferrer">
              View report →
            </a>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Not available</span>
          )}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <div className="delivery-item">
          ✉️ Gmail Draft
          {report.draftId ? (
            <span className="locked-badge">🔒 Run locally to manage</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Not created</span>
          )}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <div className="delivery-item" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Pipeline runs on your local machine — <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>npm run pulse:run</code>
        </div>
      </div>
    </>
  );
}
