export function WishlistHead({ mode, setMode }) {
  return (
    <div className="wishlist-mode-tabs" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'plan'}
        className={`wishlist-mode-tab ${mode === 'plan' ? 'active' : ''}`}
        onClick={() => setMode('plan')}
      >
        Plan
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'saved'}
        className={`wishlist-mode-tab ${mode === 'saved' ? 'active' : ''}`}
        onClick={() => setMode('saved')}
      >
        Saved
      </button>
    </div>
  );
}
