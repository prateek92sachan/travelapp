import { useEffect } from 'react';

export function useEscapeKey(isActive, onClose) {
  useEffect(() => {
    if (!isActive) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isActive, onClose]);
}
