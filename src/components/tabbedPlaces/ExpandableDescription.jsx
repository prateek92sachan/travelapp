import { memo, useMemo } from 'react';

function first30Words(text) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return { preview: text, hasMore: false };
  return { preview: words.slice(0, 30).join(' ') + '…', hasMore: true };
}

export const ExpandableDescription = memo(function ExpandableDescription({ text, expanded, onToggle, wikiUrl }) {
  const { preview, hasMore } = useMemo(() => first30Words(text), [text]);
  return (
    <div className="detail-description-block">
      <p className="detail-description">
        {expanded ? text : preview}
      </p>
      {hasMore && (
        <button type="button" className="detail-see-more" onClick={onToggle}>
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
      {wikiUrl && expanded && (
        <a href={wikiUrl} target="_blank" rel="noopener noreferrer" className="detail-wiki-link">
          Read more on Wikipedia
        </a>
      )}
    </div>
  );
});
