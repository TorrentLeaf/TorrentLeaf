// ============================================================
// TorrentLeaf — full Dashboard screen (route: /app).
// The real, navigable product. Reuses window.TL components.
// All data is FAKE — see INITIAL_TORRENTS / useAnimatedDashboard
// in components.jsx for the mock source.
// ============================================================
const { useState, useEffect } = React;
const {
  useAnimatedDashboard, useReducedMotion,
  Sidebar, TorrentTable, TorrentCardList, TransferChart, StatsPanel, WindowChrome,
  icons,
} = window.TL;
const { IcoMenu, IcoX, IcoHome, IcoDown, IcoUp, IcoCheck } = icons;

function useViewport() {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [w, setW] = useState(get);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function Dashboard() {
  const reduced = useReducedMotion();
  const dash = useAnimatedDashboard(reduced);
  const vw = useViewport();
  const isMobile = vw < 768;
  const isTablet = vw >= 768 && vw < 1024;

  const [notifications, setNotifications] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true);
  const [chartMode, setChartMode] = useState('both');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // close drawer when switching to desktop
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  const sidebar = (
    <Sidebar
      counts={dash.counts}
      filter={dash.filter}
      setFilter={(f) => { dash.setFilter(f); setDrawerOpen(false); }}
      notifications={notifications} setNotifications={setNotifications}
      darkTheme={darkTheme} setDarkTheme={setDarkTheme}
      collapsed={isTablet}
    />
  );

  const bottomPanels = (
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
  );

  return (
    <div className="dash-root" data-screen-label="Dashboard">
      {/* top window chrome — controls hidden on mobile via CSS */}
      <div className="dash-chrome">
        {isMobile && (
          <button className="dash-burger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <IcoMenu/>
          </button>
        )}
        <WindowChrome chromeless={isMobile}/>
      </div>

      <div className="dash-body">
        {/* desktop / tablet sidebar */}
        {!isMobile && sidebar}

        <main className="dash-main">
          {isMobile
            ? <TorrentCardList
                torrents={dash.torrents}
                activeId={dash.activeId}
                setActiveId={dash.setActiveId}
                filter={dash.filter}
                history={dash.history}
              />
            : <TorrentTable
                torrents={dash.torrents}
                activeId={dash.activeId}
                setActiveId={dash.setActiveId}
                filter={dash.filter}
                compact={isTablet}
              />
          }
          {bottomPanels}
        </main>
      </div>

      {/* mobile bottom nav */}
      {isMobile && (
        <nav className="dash-bottomnav">
          {[
            { id: 'overview', label: 'Overview', icon: <IcoHome/>, badge: dash.counts.ov },
            { id: 'downloading', label: 'Down', icon: <IcoDown/>, badge: dash.counts.dl },
            { id: 'seeding', label: 'Seed', icon: <IcoUp/>, badge: dash.counts.se },
            { id: 'completed', label: 'Done', icon: <IcoCheck/>, badge: null },
          ].map((it) => (
            <button key={it.id}
              className={'bn-item' + (dash.filter === it.id ? ' active' : '')}
              onClick={() => dash.setFilter(it.id)}>
              <span className="bn-ico">{it.icon}{it.badge != null && <span className="bn-badge">{it.badge}</span>}</span>
              <span className="bn-label">{it.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* mobile drawer (full sidebar) */}
      {isMobile && (
        <>
          <div className={'dash-scrim' + (drawerOpen ? ' open' : '')} onClick={() => setDrawerOpen(false)}/>
          <div className={'dash-drawer' + (drawerOpen ? ' open' : '')}>
            <div className="dash-drawer-top">
              <div className="titlebar-brand">
                <span className="dot-cluster"><span></span><span></span><span></span><span></span></span>
                TorrentLeaf
              </div>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><IcoX/></button>
            </div>
            {sidebar}
          </div>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('dash-mount')).render(<Dashboard/>);
