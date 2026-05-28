import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Image as ImageIcon,
  Map as MapIcon,
  BookOpen,
  Cloud,
  AlertTriangle
} from 'lucide-react';
import { readCurrentMonth } from '../utils/usageCounter';
import { callable } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';

const MONTHLY_BUDGET_USD = 50;

// Mapbox local estimate: $0.50 per 1000 Search API requests after 50k free.
// Rough — actual billing tier-based and includes tile loads we can't count.
const MAPBOX_FREE_TIER = 50000;
const MAPBOX_RATE_USD_PER_REQ = 0.0005;

function estimateMapboxUsd(calls) {
  if (!Number.isFinite(calls) || calls <= MAPBOX_FREE_TIER) return 0;
  return (calls - MAPBOX_FREE_TIER) * MAPBOX_RATE_USD_PER_REQ;
}

const SERVICES = [
  { id: 'google_places', label: 'Google Places',  Icon: MapPin,     paid: true,  source: 'backend' },
  { id: 'google_photos', label: 'Google Photos',  Icon: ImageIcon,  paid: true,  source: 'backend' },
  { id: 'google_other',  label: 'Google (other)', Icon: MapPin,     paid: true,  source: 'backend' },
  { id: 'mapbox',        label: 'Mapbox (REST)',  Icon: MapIcon,    paid: true,  source: 'local' },
  { id: 'wiki',          label: 'Wikipedia',      Icon: BookOpen,   paid: false, source: 'local' },
  { id: 'openweather',   label: 'OpenWeather',    Icon: Cloud,      paid: false, source: 'local' },
  { id: 'openmeteo',     label: 'Open-Meteo',     Icon: Cloud,      paid: false, source: 'local' }
];

function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function fmtCount(n) {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function projectEOM(actual) {
  if (!Number.isFinite(actual) || actual <= 0) return 0;
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (actual / day) * daysInMonth;
}

export default function Dashboard() {
  const { user, authReady } = useAuth();
  const [backend, setBackend] = useState({ loading: true, data: null, error: null });
  const localCounts = useMemo(() => readCurrentMonth(), []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setBackend({ loading: false, data: null, error: 'signin_required' });
      return;
    }
    let cancelled = false;
    setBackend({ loading: true, data: null, error: null });
    callable('getCostBreakdown')()
      .then((res) => {
        if (cancelled) return;
        setBackend({ loading: false, data: res.data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err?.code || 'internal';
        setBackend({ loading: false, data: null, error: code });
      });
    return () => { cancelled = true; };
  }, [authReady, user]);

  const rows = SERVICES.map((s) => {
    if (s.source === 'local') {
      const calls = localCounts[s.id] || 0;
      const actual = s.id === 'mapbox' ? estimateMapboxUsd(calls) : 0;
      const predicted = s.id === 'mapbox' ? projectEOM(actual) : 0;
      return {
        ...s,
        calls,
        actual,
        predicted,
        estimated: s.id === 'mapbox',
        status: 'ok'
      };
    }
    const b = backend.data?.[s.id];
    if (b) {
      const haveData = b.actualUsd != null;
      return {
        ...s,
        calls: b.calls,
        actual: b.actualUsd,
        predicted: haveData ? projectEOM(b.actualUsd) : null,
        estimated: !!b.estimated,
        backendError: b.error || null,
        status: haveData ? 'ok' : (b.error || 'no_data')
      };
    }
    const status = backend.loading ? 'loading' : (backend.error || 'loading');
    return { ...s, calls: null, actual: null, predicted: null, status };
  });

  const totalActual = rows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
  const totalPredicted = rows.reduce((sum, r) => sum + (Number(r.predicted) || 0), 0);
  const budgetPct = Math.min(100, (totalPredicted / MONTHLY_BUDGET_USD) * 100);
  const overBudget = totalPredicted > MONTHLY_BUDGET_USD;

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <main className="main dashboard-main">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <Link to="/" className="dashboard-back" aria-label="Back to map">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            <span>Back</span>
          </Link>
          <div className="dashboard-titleblock">
            <h1 className="dashboard-title">Search cost dashboard</h1>
            <div className="dashboard-subtitle">{monthLabel} · billed services + free APIs</div>
          </div>
        </header>

        <section className="dashboard-budget">
          <div className="dashboard-budget-row">
            <div>
              <div className="dashboard-budget-label">Month-end projection</div>
              <div className="dashboard-budget-amount">
                {fmtUsd(totalPredicted)}
                <span className="dashboard-budget-cap"> / {fmtUsd(MONTHLY_BUDGET_USD)} cap</span>
              </div>
            </div>
            <div className="dashboard-budget-actual">
              <div className="dashboard-budget-label">MTD actual</div>
              <div className="dashboard-budget-amount-sm">{fmtUsd(totalActual)}</div>
            </div>
          </div>
          <div className={`dashboard-budget-bar ${overBudget ? 'over' : ''}`}>
            <div
              className="dashboard-budget-bar-fill"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          {overBudget && (
            <div className="dashboard-budget-warn">
              <AlertTriangle size={14} strokeWidth={2} aria-hidden />
              Projected to exceed budget cap
            </div>
          )}
        </section>

        <section className="dashboard-grid">
          {rows.map((r) => (
            <ServiceCard key={r.id} row={r} />
          ))}
        </section>

        <footer className="dashboard-footer">
          <div>
            Google services pulled from BigQuery billing export · Mapbox + free APIs counted locally on this device.
            Mapbox count covers REST calls only — vector tile loads aren't counted.
          </div>
        </footer>
      </div>
    </main>
  );
}

function statusNote(status, backendError) {
  if (status === 'loading') return 'Loading…';
  if (status === 'signin_required') return 'Sign in to load billing data.';
  if (status === 'unauthenticated') return 'Sign in to load billing data.';
  if (status === 'permission-denied') return 'Backend lacks BigQuery access. See deploy notes.';
  if (status === 'failed-precondition') return 'Billing export not found in BigQuery yet.';
  if (status === 'internal') return 'Backend error. Check function logs.';
  if (backendError === 'no_token') return 'Mapbox secret token not set on backend.';
  if (backendError === 'no_billing_table') return 'Billing export not in BigQuery yet (up to 48h after enabling).';
  if (backendError?.startsWith('mapbox_')) return `Mapbox API error (${backendError}).`;
  return null;
}

function ServiceCard({ row }) {
  const { Icon, label, paid, calls, actual, predicted, status, estimated, backendError } = row;
  const pending = status !== 'ok';
  const note = statusNote(status, backendError);
  return (
    <article className={`dashboard-card ${pending ? 'pending' : ''}`}>
      <div className="dashboard-card-head">
        <div className="dashboard-card-icon">
          <Icon size={18} strokeWidth={2} aria-hidden />
        </div>
        <div className="dashboard-card-title">{label}</div>
        <span className={`dashboard-card-tag ${paid ? 'paid' : 'free'}`}>
          {paid ? 'Paid' : 'Free'}
        </span>
      </div>
      <div className="dashboard-card-stats">
        <div className="dashboard-card-stat">
          <div className="dashboard-card-stat-label">Calls (MTD)</div>
          <div className="dashboard-card-stat-value">{pending ? '—' : fmtCount(calls)}</div>
        </div>
        <div className="dashboard-card-stat">
          <div className="dashboard-card-stat-label">Actual</div>
          <div className="dashboard-card-stat-value">
            {pending ? <span className="dashboard-skel" /> : fmtUsd(actual)}
          </div>
        </div>
        <div className="dashboard-card-stat">
          <div className="dashboard-card-stat-label">Predicted EOM</div>
          <div className="dashboard-card-stat-value">
            {pending ? <span className="dashboard-skel" /> : fmtUsd(predicted)}
          </div>
        </div>
      </div>
      {note && <div className="dashboard-card-pending">{note}</div>}
      {!pending && estimated && (
        <div className="dashboard-card-pending">Estimated (Mapbox pricing × usage).</div>
      )}
    </article>
  );
}
