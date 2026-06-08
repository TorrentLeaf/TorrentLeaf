// ============================================================
// TorrentLeaf shared component library.
// Exposes window.TL = { Sidebar, TorrentTable, TorrentCardList,
//   TransferChart, StatsPanel, WindowChrome, PhonePreview,
//   useAnimatedDashboard, icons, helpers }
// Used by both Landing Page.html and Dashboard.html.
// ============================================================

const { useState, useEffect, useRef, useMemo } = React;

// ————————————————————————————————————————————————————————————
// Mock data. Replace with real torrent engine data when wiring up.
// ————————————————————————————————————————————————————————————
const INITIAL_TORRENTS = [
  { id: 't1', name: 'Berserk · Deluxe Edition Vol 1-14',         type: 'CBZ',  size: '4.2 GB', totalSec: 38,   peers: 8,  seeds: 21, progress: 0.18, status: 'dl' },
  { id: 't2', name: 'The Pragmatic Programmer · 20th Anniversary', type: 'EPUB', size: '12 MB',  totalSec: 6,    peers: 11, seeds: 54, progress: 0.41, status: 'dl' },
  { id: 't3', name: 'Chainsaw Man · Complete Volume Pack',         type: 'CBZ',  size: '2.8 GB', totalSec: 64,   peers: 2,  seeds: 9,  progress: 0.94, status: 'dl' },
  { id: 't4', name: 'Designing Data-Intensive Applications',       type: 'PDF',  size: '24 MB',  totalSec: null, peers: 21, seeds: 11, progress: 1.00, status: 'se' },
  { id: 't5', name: 'Vagabond · Vizbig Edition',                   type: 'CBZ',  size: '1.4 GB', totalSec: null, peers: 21, seeds: 11, progress: 0.62, status: 'pa' },
  { id: 't6', name: 'Refactoring · 2nd Edition',                   type: 'PDF',  size: '46 MB',  totalSec: null, peers: 6,  seeds: 18, progress: 1.00, status: 'se' },
];

const fmtTime = (s) => {
  if (s == null) return 'Completed';
  if (s < 1) return '< 1 sec';
  if (s < 60) return `${Math.round(s)} sec`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m < 60) return r ? `${m}m ${r}s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};
const fmtMB = (n) => n.toFixed(1);
const fmtElapsed = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m} min ${r.toString().padStart(2, '0')} sec`;
};

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// ————————————————————————————————————————————————————————————
// Animation loop — single RAF source of truth.
// ————————————————————————————————————————————————————————————
function useAnimatedDashboard(reducedMotion) {
  const [torrents, setTorrents] = useState(INITIAL_TORRENTS);
  const [downRate, setDownRate] = useState(15.3);
  const [upRate, setUpRate] = useState(10.3);
  const [elapsed, setElapsed] = useState(8 * 60 + 32);
  const [downloadedMB, setDownloadedMB] = useState(677);
  const [uploadedMB, setUploadedMB] = useState(146);
  const [history, setHistory] = useState(() => {
    const arr = [];
    for (let i = 0; i < 60; i++) arr.push(15 + Math.sin(i / 6) * 3 + (Math.random() - 0.5) * 1.5);
    return arr;
  });
  const [activeId, setActiveId] = useState('t1');
  const [filter, setFilter] = useState('overview');

  const downRateRef = useRef(downRate);
  const upRateRef = useRef(upRate);
  downRateRef.current = downRate;
  upRateRef.current = upRate;

  useEffect(() => {
    if (reducedMotion) return;
    let raf;
    let lastTick = performance.now();
    let lastSlowTick = performance.now();

    const loop = (now) => {
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      setHistory((h) => {
        const last = h[h.length - 1];
        const phase = now / 1000;
        const target = 14 + Math.sin(phase / 4.5) * 4 + Math.sin(phase / 1.7) * 1.4;
        const noise = (Math.random() - 0.5) * 0.6;
        const next = last + (target - last) * 0.18 + noise;
        const out = h.slice(1);
        out.push(Math.max(2, Math.min(28, next)));
        return out;
      });

      setElapsed((e) => e + dt);
      setDownloadedMB((d) => d + (downRateRef.current * dt) / 1.5);
      setUploadedMB((u) => u + (upRateRef.current * dt) / 1.5);

      if (now - lastSlowTick > 950) {
        lastSlowTick = now;
        const phase = now / 1000;
        const d = 13 + Math.sin(phase / 3.2) * 3 + (Math.random() - 0.5) * 1.2;
        const u = 9.5 + Math.sin(phase / 4.1 + 1) * 1.6 + (Math.random() - 0.5) * 0.8;
        setDownRate(+d.toFixed(1));
        setUpRate(+u.toFixed(1));

        setTorrents((ts) => ts.map((t) => {
          if (t.status !== 'dl') return t;
          const inc = (0.012 + Math.random() * 0.014) * (t.id === 't1' ? 0.7 : 1.2);
          const p = Math.min(1, t.progress + inc);
          if (p >= 1) return { ...t, progress: 1, status: 'se', totalSec: null, peers: t.peers + 2 };
          const remaining = t.totalSec != null ? Math.max(0, t.totalSec - 1) : null;
          return { ...t, progress: p, totalSec: remaining };
        }));
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const counts = useMemo(() => {
    const dl = torrents.filter((t) => t.status === 'dl').length;
    const se = torrents.filter((t) => t.status === 'se').length;
    return { dl, se, ov: torrents.length, done: torrents.filter((t) => t.progress >= 1).length + 144 };
  }, [torrents]);

  return { torrents, downRate, upRate, elapsed, downloadedMB, uploadedMB, history,
    activeId, setActiveId, filter, setFilter, counts };
}

// ————————————————————————————————————————————————————————————
// Icons (simple shapes)
// ————————————————————————————————————————————————————————————
const I = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}/>;
const IcoHome  = () => <I><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z"/></I>;
const IcoDown  = () => <I><path d="M12 5v14M5 12l7 7 7-7"/></I>;
const IcoUp    = () => <I><path d="M12 19V5M5 12l7-7 7 7"/></I>;
const IcoCheck = () => <I><path d="M4 7h12M4 12h8M4 17h6"/><path d="M16 17l3 3 5-5"/></I>;
const IcoBook  = () => <I><path d="M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2V5z"/><path d="M17 3v18"/></I>;
const IcoDoc   = () => <I><path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></I>;
const IcoEpub  = () => <I><path d="M3 6h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3V6z"/><path d="M21 6h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6V6z"/></I>;
const IcoDots  = () => <I><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></I>;
const IcoCog   = () => <I><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0 1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3 2 2 0 1 1-2.8-2.8 1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8 2 2 0 1 1 2.8-2.8 1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3 2 2 0 1 1 2.8 2.8 1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1.1z"/></I>;
const IcoBell  = () => <I><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></I>;
const IcoMoon  = () => <I><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></I>;
const IcoUpDown = () => <I><path d="M7 4v16M7 4l-3 3M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/></I>;
const IcoHelp  = () => <I><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.5-2.4 2.3-2.4 3.8M12 17v.5"/></I>;
const IcoCaret = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>;
const IcoMenu  = () => <I><path d="M3 6h18M3 12h18M3 18h18"/></I>;
const IcoX     = () => <I><path d="M18 6 6 18M6 6l12 12"/></I>;
const IcoSearch = () => <I><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></I>;

// ————————————————————————————————————————————————————————————
// Sub-components
// ————————————————————————————————————————————————————————————
function Sidebar({ counts, filter, setFilter, notifications, setNotifications, darkTheme, setDarkTheme, collapsed }) {
  const items = [
    { id: 'overview',    label: 'Overview',    icon: <IcoHome/>,  badge: counts.ov },
    { id: 'downloading', label: 'Downloading', icon: <IcoDown/>,  badge: counts.dl },
    { id: 'seeding',     label: 'Seeding',     icon: <IcoUp/>,    badge: counts.se },
    { id: 'completed',   label: 'Completed',   icon: <IcoCheck/>, badge: counts.done },
  ];
  const explorer = [
    { label: 'Manga', icon: <IcoBook/> },
    { label: 'PDFs',  icon: <IcoDoc/> },
    { label: 'EPUBs', icon: <IcoEpub/> },
    { label: 'More',  icon: <IcoDots/>, dim: true },
  ];
  return (
    <aside className={'sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="side-section-label">Overview</div>
      {items.map((it) => (
        <button key={it.id}
          className={'side-item' + (filter === it.id ? ' active' : '')}
          onClick={() => setFilter(it.id)}
          title={it.label}>
          {it.icon}
          <span className="label">{it.label}</span>
          <span className="badge">{it.badge}</span>
        </button>
      ))}
      <div className="side-section-label">Library</div>
      {explorer.map((it) => (
        <button key={it.label} className="side-item" title={it.label}>
          <span className="chevron" aria-hidden="true">›</span>
          {it.icon}
          <span className="label" style={it.dim ? { color: 'var(--text-subtle)' } : null}>{it.label}</span>
        </button>
      ))}
      <div className="side-section-label">Settings</div>
      <button className="side-item" title="Settings">
        <IcoCog/>
        <span className="label">Settings</span>
      </button>
      <button className="side-item" onClick={() => setNotifications((v) => !v)} title="Notifications">
        <IcoBell/>
        <span className="label">Notifications</span>
        <div className={'toggle' + (notifications ? ' on' : '')} aria-hidden="true"/>
      </button>
      <button className="side-item" onClick={() => setDarkTheme((v) => !v)} title="Dark theme">
        <IcoMoon/>
        <span className="label">Dark theme</span>
        <div className={'toggle' + (darkTheme ? ' on' : '')} aria-hidden="true"/>
      </button>
    </aside>
  );
}

function applyFilter(torrents, filter) {
  if (filter === 'downloading') return torrents.filter((t) => t.status === 'dl');
  if (filter === 'seeding')     return torrents.filter((t) => t.status === 'se');
  if (filter === 'completed')   return torrents.filter((t) => t.progress >= 1);
  return torrents;
}

function TorrentTable({ torrents, activeId, setActiveId, filter, compact }) {
  const rows = useMemo(() => applyFilter(torrents, filter), [torrents, filter]);
  return (
    <div className={'table-wrap' + (compact ? ' compact' : '')}>
      <table className="torrent-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Progress</th>
            <th>Size</th>
            <th className="col-time">Time left</th>
            <th className="col-seeds">Seeds</th>
            <th className="col-peers">Peers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}
                className={t.id === activeId ? 'active' : ''}
                onClick={() => setActiveId && setActiveId(t.id)}>
              <td>
                <div className="col-name">
                  <span className={'status-icon ' + t.status} aria-hidden="true">
                    {t.status === 'dl' ? '↓' : t.status === 'se' ? '↑' : '‖'}
                  </span>
                  <span className="name" title={t.name}>{t.name}</span>
                  <span className="type-tag">{t.type}</span>
                </div>
              </td>
              <td className="progress-cell">
                <div className="progress">
                  <div className={'progress-fill ' + t.status} style={{ width: (t.progress * 100) + '%' }}/>
                </div>
              </td>
              <td className="muted-cell">{t.size}</td>
              <td className="muted-cell col-time">{fmtTime(t.totalSec)}</td>
              <td className="col-seeds">{t.seeds}</td>
              <td className="col-peers">{t.peers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mobile fallback: cards instead of a table
function TorrentCardList({ torrents, activeId, setActiveId, filter, history }) {
  const rows = useMemo(() => applyFilter(torrents, filter), [torrents, filter]);
  return (
    <div className="torrent-cards">
      {rows.map((t, i) => {
        const arr = history.slice(-20).map((v, k) => v + Math.sin(k / 3 + i) * 1.2);
        const W = 110, H = 26, pad = 2;
        const mn = Math.min(...arr), mx = Math.max(...arr);
        const pts = arr.map((v, k) => ({
          x: pad + (k / (arr.length - 1)) * (W - pad * 2),
          y: pad + (1 - (v - mn) / Math.max(0.01, mx - mn)) * (H - pad * 2),
        }));
        const col = t.status === 'dl' ? 'var(--cyan)' : t.status === 'se' ? 'var(--green)' : 'var(--text-subtle)';
        return (
          <button key={t.id}
                  className={'tcard' + (t.id === activeId ? ' active' : '')}
                  onClick={() => setActiveId && setActiveId(t.id)}>
            <div className="tcard-head">
              <span className={'status-icon ' + t.status} aria-hidden="true">
                {t.status === 'dl' ? '↓' : t.status === 'se' ? '↑' : '‖'}
              </span>
              <span className="tcard-name">{t.name}</span>
              <span className="type-tag">{t.type}</span>
            </div>
            <div className="progress">
              <div className={'progress-fill ' + t.status} style={{ width: (t.progress * 100) + '%' }}/>
            </div>
            <div className="tcard-foot">
              <div className="tcard-meta">
                <span><span className="k">Size</span> {t.size}</span>
                <span><span className="k">Left</span> {fmtTime(t.totalSec)}</span>
                <span><span className="k">S/P</span> {t.seeds}/{t.peers}</span>
              </div>
              <svg className="tcard-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={smoothPath(pts)} stroke={col} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="1.8" fill={col}/>
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TransferChart({ history, downRate }) {
  const W = 480, H = 160;
  const padX = 12, padY = 18;
  const max = 28, min = 0;
  const pts = history.map((v, i) => ({
    x: padX + (i / (history.length - 1)) * (W - padX * 2),
    y: padY + (1 - (v - min) / (max - min)) * (H - padY * 2),
  }));
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  const lowSpeed = downRate < 9;
  const tipColor = lowSpeed ? 'var(--orange)' : 'var(--cyan)';
  const areaPath = d + ` L ${last.x} ${H - padY} L ${pts[0].x} ${H - padY} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.30"/>
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38BDF8"/>
          <stop offset="80%" stopColor="#38BDF8"/>
          <stop offset="100%" stopColor={lowSpeed ? '#F5A524' : '#38BDF8'}/>
        </linearGradient>
        <radialGradient id="tip-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tipColor} stopOpacity="0.65"/>
          <stop offset="100%" stopColor={tipColor} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {[0,1,2,3].map((i) => (
        <line key={i} x1={padX} x2={W - padX} y1={padY + (i/3)*(H-padY*2)} y2={padY + (i/3)*(H-padY*2)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
      ))}
      <path d={areaPath} fill="url(#area-grad)"/>
      <path d={d} stroke="url(#line-grad)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="18" fill="url(#tip-glow)"/>
      <circle cx={last.x} cy={last.y} r="3.5" fill={tipColor}/>
      <circle cx={last.x} cy={last.y} r="3.5" fill="none" stroke={tipColor} strokeOpacity="0.5" strokeWidth="2">
        <animate attributeName="r" values="3.5;7;3.5" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
}

function StatsPanel({ downRate, upRate, downloadedMB, uploadedMB, elapsed, torrents }) {
  const activeSeeds = torrents.reduce((s, t) => s + (t.status !== 'pa' ? t.seeds : 0), 0);
  const ratio = (uploadedMB / downloadedMB).toFixed(2);
  const remainingMB = torrents.reduce((s, t) => t.status === 'dl' ? s + 800 * (1 - t.progress) : s, 0);
  const timeLeftSec = downRate > 0 ? remainingMB / downRate : 0;
  return (
    <div className="stats-panel">
      <div className="micro-label">Download / Upload per sec</div>
      <div className="big-rates">
        <div className="rate down"><span className="arrow">↓</span><span className="val">{fmtMB(downRate)}</span><span className="unit">MB/s</span></div>
        <div className="rate up"><span className="arrow">↑</span><span className="val">{fmtMB(upRate)}</span><span className="unit">MB/s</span></div>
      </div>
      <div className="stat-grid">
        <div className="stat-cell"><div className="label">Seeds</div><div className="value">{activeSeeds}</div></div>
        <div className="stat-cell"><div className="label">Down / up ratio</div><div className="value">{ratio}</div></div>
        <div className="stat-cell"><div className="label">Downloaded</div><div className="value">{Math.round(downloadedMB)} MB</div></div>
        <div className="stat-cell"><div className="label">Uploaded</div><div className="value">{Math.round(uploadedMB)} MB</div></div>
        <div className="stat-cell"><div className="label">Time elapsed</div><div className="value">{fmtElapsed(elapsed)}</div></div>
        <div className="stat-cell"><div className="label">Time left</div><div className="value">{fmtTime(timeLeftSec)}</div></div>
      </div>
    </div>
  );
}

function WindowChrome({ chromeless }) {
  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <span className="dot-cluster"><span></span><span></span><span></span><span></span></span>
        TorrentLeaf
      </div>
      <div className="titlebar-options">Options <IcoCaret/></div>
      <div className="titlebar-center">
        <IcoHelp/>
        <span>Help &amp; resources</span>
      </div>
      {!chromeless && (
        <div className="traffic">
          <span aria-label="minimize">—</span>
          <span aria-label="maximize">□</span>
          <span aria-label="close">×</span>
        </div>
      )}
    </div>
  );
}

// Phone preview shown on the landing.
function PhonePreview({ torrents, history }) {
  const items = torrents.slice(0, 4);
  const sparks = items.map((_, idx) => {
    const arr = history.slice(-24).map((v, i) => v + Math.sin(i / 3 + idx) * 1.5);
    const W = 70, H = 22, pad = 2;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    const pts = arr.map((v, i) => ({
      x: pad + (i / (arr.length - 1)) * (W - pad * 2),
      y: pad + (1 - (v - mn) / Math.max(0.01, mx - mn)) * (H - pad * 2),
    }));
    return { d: smoothPath(pts), last: pts[pts.length - 1], W, H };
  });
  const colors = { dl: '#38BDF8', se: '#34D399', pa: '#7A8290' };
  return (
    <div className="phone" data-screen-label="Mobile app preview">
      <div className="phone-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IcoMenu/> Library
        </div>
        <div className="ico-row"><IcoSearch/><IcoDots/></div>
      </div>
      <div className="phone-list">
        {items.map((t, i) => {
          const sp = sparks[i];
          const col = colors[t.status];
          return (
            <div key={t.id} className={'phone-card' + (i === 0 ? ' active' : '')}>
              <div className="phone-card-top">
                <div className="phone-card-left">
                  <div className="phone-icon">{t.type[0]}</div>
                  <div className="title">{t.name.split('·')[0].trim()}</div>
                </div>
                <div className="pct">{Math.round(t.progress * 100)}%</div>
              </div>
              <svg className="phone-spark" viewBox={`0 0 ${sp.W} ${sp.H}`} preserveAspectRatio="none">
                <path d={sp.d} stroke={col} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                <circle cx={sp.last.x} cy={sp.last.y} r="1.6" fill={col}/>
              </svg>
              <div className="size">{t.size}</div>
            </div>
          );
        })}
      </div>
      <div className="phone-nav">
        <span className="item active"><IcoUpDown/></span>
        <span className="item"><IcoBook/></span>
        <span className="item"><IcoCog/></span>
      </div>
    </div>
  );
}

// Detect reduced-motion preference.
function useReducedMotion() {
  return useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }, []);
}

// Expose
window.TL = {
  useAnimatedDashboard, useReducedMotion,
  Sidebar, TorrentTable, TorrentCardList, TransferChart, StatsPanel,
  WindowChrome, PhonePreview,
  fmtTime, fmtMB, fmtElapsed, smoothPath, applyFilter,
  icons: {
    IcoHome, IcoDown, IcoUp, IcoCheck, IcoBook, IcoDoc, IcoEpub, IcoDots,
    IcoCog, IcoBell, IcoMoon, IcoUpDown, IcoHelp, IcoCaret, IcoMenu, IcoX, IcoSearch
  },
};
