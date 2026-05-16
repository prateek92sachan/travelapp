import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPlacePredictions, newSessionToken } from '../services/googleMaps';
import { getRecentTrips } from '../utils/recentTrips';

const POPULAR_DESTINATIONS = [
  'Tokyo, Japan',
  'Paris, France',
  'New York, USA',
  'Bali, Indonesia',
  'Bangkok, Thailand',
  'London, UK',
  'Goa, India',
  'Dubai, UAE'
];

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

/**
 * Smart destination input with autocomplete, recent trips, and popular
 * destinations. Fully keyboard-accessible (↑↓ Enter Esc Tab), debounced API
 * calls, race-condition safe.
 *
 * Props:
 *   value         current input string (controlled)
 *   onChange(v)   called as user types
 *   onSelect(v)   called when user picks a suggestion (string destination)
 *   placeholder   input placeholder
 */
export default function SmartSearchInput({ value, onChange, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [recents, setRecents] = useState([]);

  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const requestSeq = useRef(0);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  // A stable per-instance ID so multiple SmartSearchInputs on the same page
  // don't collide on listbox/option IDs.
  const instanceId = useMemo(
    () => 'ssi-' + Math.random().toString(36).slice(2, 8),
    []
  );

  // Build sections + a parallel array of flat items where each item already
  // knows its global index. This avoids the closure trap of mutating an
  // outer `let` counter inside .map().
  const { sections, flatItems } = useMemo(() => {
    const flat = [];
    const sectionList = [];

    const addSection = (key, label, items) => {
      const augmented = items.map((it) => {
        const indexed = { ...it, _index: flat.length };
        flat.push(indexed);
        return indexed;
      });
      sectionList.push({ key, label, items: augmented });
    };

    if (!value || value.trim().length < MIN_QUERY_LEN) {
      if (recents.length) {
        addSection(
          'recent',
          'Recent',
          recents.map((r) => ({
            id: `recent-${r.destination}-${r.date}`,
            mainText: r.destination,
            secondaryText: r.formattedAddress || r.date,
            value: r.destination
          }))
        );
      }
      addSection(
        'popular',
        'Popular destinations',
        POPULAR_DESTINATIONS.map((d) => ({
          id: `pop-${d}`,
          mainText: d.split(',')[0].trim(),
          secondaryText: d.split(',').slice(1).join(',').trim(),
          value: d
        }))
      );
    } else if (predictions.length) {
      addSection(
        'suggestions',
        'Suggestions',
        predictions.map((p) => ({
          id: p.placeId,
          mainText: p.mainText,
          secondaryText: p.secondaryText,
          value: p.fullText
        }))
      );
    }

    return { sections: sectionList, flatItems: flat };
  }, [value, predictions, recents]);

  // Refresh recents whenever the dropdown opens
  useEffect(() => {
    if (open) setRecents(getRecentTrips());
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Debounced fetch on input change. Cleanup MUST cancel both the timeout
  // AND the in-flight fetch — otherwise unmounting mid-request leaks.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = value?.trim() ?? '';
    if (trimmed.length < MIN_QUERY_LEN) {
      setPredictions([]);
      setHighlightIndex(-1);
      return undefined;
    }

    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      abortRef.current = new AbortController();

      // Lazy-init the session token; refreshed after each selection
      if (!sessionTokenRef.current) sessionTokenRef.current = newSessionToken();

      const results = await fetchPlacePredictions(trimmed, {
        sessionToken: sessionTokenRef.current,
        signal: abortRef.current.signal
      });

      if (seq !== requestSeq.current) return; // stale response
      setPredictions(results);
      setHighlightIndex(results.length > 0 ? 0 : -1);
    }, DEBOUNCE_MS);

    // Cleanup on next run OR on unmount: clear pending timer, abort fetch.
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value]);

  // Keep highlight index in valid range whenever the items list shrinks
  useEffect(() => {
    if (highlightIndex >= flatItems.length) {
      setHighlightIndex(flatItems.length > 0 ? 0 : -1);
    }
  }, [flatItems.length, highlightIndex]);

  const choose = (item) => {
    if (!item) return;
    setOpen(false);
    setPredictions([]);
    setHighlightIndex(-1);
    // Rotate the session token — Google's billing model expects a new
    // session for the next search.
    sessionTokenRef.current = null;
    onSelect?.(item.value);
  };

  const onKeyDown = (e) => {
    // Allow opening the dropdown with arrow keys when closed
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (flatItems.length > 0) {
          setHighlightIndex((i) => (i + 1) % flatItems.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (flatItems.length > 0) {
          setHighlightIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
        }
        break;
      case 'Enter':
        if (highlightIndex >= 0 && flatItems[highlightIndex]) {
          e.preventDefault();
          choose(flatItems[highlightIndex]);
        }
        // Else: let the form's submit handler fire normally
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        // Close dropdown so it doesn't hover over the next focusable element.
        // Don't preventDefault — we want focus to move naturally.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const listboxId = `${instanceId}-listbox`;
  const activeOptionId =
    highlightIndex >= 0 && flatItems[highlightIndex]
      ? `${instanceId}-option-${flatItems[highlightIndex].id}`
      : undefined;

  return (
    <div className="smart-search-wrap" ref={wrapRef}>
      {/*
        ARIA 1.2 combobox pattern: role goes on the input itself, not a
        wrapper. aria-expanded reflects open state; aria-controls points
        at the listbox; aria-activedescendant identifies the highlighted
        option for screen readers without moving real DOM focus.
      */}
      <input
        ref={inputRef}
        className="input"
        type="text"
        role="combobox"
        placeholder={placeholder || 'Where to?'}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />

      {open && sections.length > 0 && (
        <ul className="smart-search-dropdown" id={listboxId} role="listbox">
          {sections.map((section) => (
            <li key={section.key} className="smart-search-section" role="presentation">
              <div className="smart-search-section-label">{section.label}</div>
              <ul role="presentation" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {section.items.map((item) => {
                  const isHighlighted = item._index === highlightIndex;
                  return (
                    <li
                      key={item.id}
                      id={`${instanceId}-option-${item.id}`}
                      role="option"
                      aria-selected={isHighlighted}
                      className={`smart-search-item ${isHighlighted ? 'highlighted' : ''}`}
                      onMouseDown={(e) => {
                        // Use mousedown so the input's blur doesn't close
                        // us before the click registers.
                        e.preventDefault();
                        choose(item);
                      }}
                      onMouseEnter={() => setHighlightIndex(item._index)}
                    >
                      <div className="ssi-icon" aria-hidden="true">
                        {section.key === 'recent' ? '🕒' : section.key === 'popular' ? '🌍' : '📍'}
                      </div>
                      <div className="ssi-text">
                        <div className="ssi-main">{item.mainText}</div>
                        {item.secondaryText && (
                          <div className="ssi-secondary">{item.secondaryText}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
