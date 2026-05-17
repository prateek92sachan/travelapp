const KEY = 'travel-app:ui-state';

export function saveUIState({ activeTab, selectedPlaceId }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ activeTab, selectedPlaceId }));
  } catch {}
}

export function getUIState() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}
