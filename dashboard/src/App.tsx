import { useState } from 'react';
import './index.css';
import { useReport, useHistory } from './hooks';
import DashboardPage from './pages/Dashboard';
import HistoryPage from './pages/History';

type Page = 'dashboard' | 'history';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const { report, loading, error } = useReport();
  const { history } = useHistory();

  return (
    <div className="app-layout">
      {/* Top bar */}
      <header className="topbar">
        <a className="topbar-logo" href="#" onClick={() => setPage('dashboard')}>
          <span className="pulse-dot" />
          Weekly Review Pulse
        </a>
        <div className="topbar-spacer" />
        {report && (
          <div className="topbar-badge">
            📊 Week {report.isoWeek} / {report.isoYear}
          </div>
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
      </main>
    </div>
  );
}
