import { useEffect, useState } from 'react';

const DESKTOP_BP = 1024; // px

/**
 * Return true when viewport is desktop-sized. Updates on window resize.
 * Used by the layout to swap between map-dominant overlay layout (desktop)
 * and stacked card layout (mobile).
 */
export function useIsDesktop() {
  const query = `(min-width: ${DESKTOP_BP}px)`;
  const get = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [isDesktop, setIsDesktop] = useState(get);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event) => setIsDesktop(event.matches);

    setIsDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return isDesktop;
}
