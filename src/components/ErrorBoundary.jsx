import { Component } from 'react';

/**
 * Catches render-time errors in any child subtree so a crashed widget
 * doesn't blank the entire app. Pair this with `key` props on dynamic
 * subtrees if you want the boundary to auto-reset.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to console for dev; in prod we'd log to a service
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { fallback, label = 'this widget' } = this.props;
    if (fallback) return fallback(this.state.error, this.reset);

    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--danger)',
          background: 'rgba(220, 38, 38, 0.08)',
          color: 'var(--danger)',
          fontSize: 13
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          ⚠ {label} crashed
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={this.reset}
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          Try again
        </button>
      </div>
    );
  }
}
