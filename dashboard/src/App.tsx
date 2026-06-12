import { useState } from 'react';
import './index.css';
import { useReport, useHistory } from './hooks';
import DashboardPage from './pages/Dashboard';
import HistoryPage from './pages/History';
import ReviewsPage from './pages/Reviews';

type Page = 'dashboard' | 'history' | 'reviews';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>();
  const { history } = useHistory();
  const { report, loading, error } = useReport(selectedYear, selectedWeek);

  return (
    <div className="app-layout">
      {/* Top bar */}
      <header className="topbar">
        <a className="topbar-logo" href="#" onClick={() => setPage('dashboard')}>
          <span className="pulse-dot" />
          Weekly Review Pulse
        </a>
        <div className="topbar-spacer" />
        {history && history.length > 0 && (
          <select 
            className="topbar-badge" 
            style={{ background: 'var(--bg-surface)', cursor: 'pointer', outline: 'none' }}
            value={selectedYear && selectedWeek ? `${selectedYear}-${selectedWeek}` : '-'}
            onChange={(e) => {
              if (e.target.value === '-') {
                setSelectedYear(undefined);
                setSelectedWeek(undefined);
              } else {
                const [y, w] = e.target.value.split('-');
                setSelectedYear(Number(y));
                setSelectedWeek(Number(w));
              }
            }}
          >
            <option value="-">Latest Report</option>
            {history.filter(h => h.status === 'success').map(h => (
              <option key={h.id} value={`${h.isoYear}-${h.isoWeek}`}>
                Week {h.isoWeek} / {h.isoYear}
              </option>
            ))}
          </select>
        )}
        <div className="topbar-badge">
          🔒 Read-only view
        </div>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <a
          className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
          onClick={() => setPage('dashboard')}
        >
          <span className="nav-icon">📊</span>
          Dashboard
        </a>
        <a
          className={`nav-item ${page === 'history' ? 'active' : ''}`}
          onClick={() => setPage('history')}
        >
          <span className="nav-icon">📋</span>
          Run History
        </a>
        <a
          className={`nav-item ${page === 'reviews' ? 'active' : ''}`}
          onClick={() => setPage('reviews')}
        >
          <span className="nav-icon">⭐</span>
          Normalized Reviews
        </a>
        <div style={{ flex: 1 }} />
        <div className="nav-item" style={{ cursor: 'default', opacity: 0.5 }}>
          <span className="nav-icon">⚡</span>
          <span style={{ fontSize: 12 }}>Pipeline runs locally</span>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {page === 'dashboard' && (
          <DashboardPage report={report} loading={loading} error={error} />
        )}
        {page === 'history' && (
          <HistoryPage history={history} />
        )}
        {page === 'reviews' && (
          <ReviewsPage />
        )}
      </main>
    </div>
  );
}
