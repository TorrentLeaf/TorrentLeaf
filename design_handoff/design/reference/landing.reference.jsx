// ============================================================
// Landing preview app. Reuses the SAME components as the real
// dashboard (window.TL) in a reduced, non-interactive form.
// ============================================================
const { useState } = React;
const {
  useAnimatedDashboard, useReducedMotion,
  Sidebar, TorrentTable, TransferChart, StatsPanel, WindowChrome, PhonePreview,
} = window.TL;

function LandingPreview() {
  const reduced = useReducedMotion();
  const dash = useAnimatedDashboard(reduced);
  // Local UI state for the preview's toggles (not wired to anything global).
  const [notifications, setNotifications] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true);
  const [chartMode, setChartMode] = useState('both');

  return (
    <div className="preview-grid">
      <div className="app-window" data-screen-label="Desktop app preview">
        <WindowChrome/>
        <div className="app-body">
          <Sidebar
            counts={dash.counts}
            filter={dash.filter}
            setFilter={dash.setFilter}
            notifications={notifications} setNotifications={setNotifications}
            darkTheme={darkTheme} setDarkTheme={setDarkTheme}
          />
          <div className="main-area">
            <TorrentTable
              torrents={dash.torrents}
              activeId={dash.activeId}
              setActiveId={dash.setActiveId}
              filter={dash.filter}
            />
            <div className="bottom-panels">
              <div className="chart-panel">
                <div className="chart-header">
                  <span className="micro-label">Transfer speed</span>
                  <div className="chart-toggle">
                    <button className={chartMode !== 'up' ? 'active' : ''} onClick={() => setChartMode('both')}>
                      <span className="swatch" style={{ background: '#38BDF8' }}/> Download
                    </button>
                    <button className={chartMode === 'up' ? 'active' : ''} onClick={() => setChartMode('up')}>
                      <span className="swatch" style={{ background: '#A78BFA' }}/> Upload
                    </button>
                  </div>
                </div>
                <div className="chart-area">
                  <TransferChart history={dash.history} downRate={dash.downRate}/>
                </div>
              </div>
              <StatsPanel {...dash}/>
            </div>
          </div>
        </div>
      </div>

      <div className="phone-wrap">
        <PhonePreview torrents={dash.torrents} history={dash.history}/>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app-mount')).render(<LandingPreview/>);
