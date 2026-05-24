import { useEffect, useState } from 'react';

/**
 * Reusable card with optional expand-to-fullscreen behavior.
 * - icon, title: header content
 * - children: body
 * - extraHeader: extra controls in header (right side)
 * - className: extra classes for the card root
 * - bodyClassName: classes for the body (e.g. "no-pad" for the map)
 */
export default function Card({
  icon,
  title,
  children,
  extraHeader,
  middleHeader,
  stickyNav,
  topBands,
  expandable = true,
  className = '',
  bodyClassName = ''
}) {
  const [expanded, setExpanded] = useState(false);

  // Esc to close
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => e.key === 'Escape' && setExpanded(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const bands = Array.isArray(topBands) ? topBands : topBands ? [topBands] : [];
  const headerVisible = icon || title || extraHeader || middleHeader || expandable;

  const hasBottomStack = bands.length > 0 || stickyNav || headerVisible;

  return (
    <>
      {expanded && (
        <div className="expand-overlay" onClick={() => setExpanded(false)} />
      )}
      <div className={`card ${expanded ? 'expanded' : ''} ${className}`}>
        <div className={`card-body ${bodyClassName}`}>{children}</div>
        {hasBottomStack && (
          <div className="card-bottom-stack">
            {bands.map((band, i) => (
              <div key={i} className="card-top-band">{band}</div>
            ))}
            {stickyNav && <div className="card-sticky-nav">{stickyNav}</div>}
            {headerVisible && (
              <div className="card-header">
                {(icon || title) && (
                  <h3 className="card-title">
                    {icon && <span aria-hidden>{icon}</span>}
                    {title && <span>{title}</span>}
                  </h3>
                )}
                {middleHeader && (
                  <div className="card-header-middle">{middleHeader}</div>
                )}
                <div className="row">
                  {extraHeader}
                  {expandable && (
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setExpanded((e) => !e)}
                      title={expanded ? 'Collapse' : 'Expand'}
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                      {expanded ? '✕' : '⤢'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
