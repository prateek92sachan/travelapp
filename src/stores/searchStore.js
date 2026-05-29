import { create } from 'zustand';
import { saveUIState } from '../utils/uiState';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function readInitialFromUrl() {
  if (typeof window === 'undefined') return { destination: '', date: todayISO() };
  const u = new URL(window.location.href);
  return {
    destination: u.searchParams.get('dest') || '',
    date: u.searchParams.get('date') || todayISO()
  };
}

const init = readInitialFromUrl();


export const useSearchStore = create((set, get) => ({
  destination: init.destination,
  date: init.date,
  coords: null,
  weatherTarget: null, // { lat, lng, dateISO } — query key for weather hooks
  searchRadiusMeters: 20000, // derived from geocode viewport; used by tab queries
  placeArea: '', // sublocality/locality of the searched place (e.g. "Hulu Langat")
  placeCity: '', // nearest prominent city for display (e.g. "Kuala Lumpur")
  activeTab: 'activities',
  loading: false,
  error: null,
  // selectedPlaceId/Place = "highlight" state. Drives the marker selected
  // ring, the list-row highlight, and the auto-scroll-into-view. Set by BOTH
  // pin taps and row taps.
  selectedPlaceId: null,
  selectedPlace: null,
  // detailPlaceId/Place = "detail card" state. Set only by row taps (and
  // mount-restore for the place the user was last looking at). Pin taps
  // intentionally do NOT populate this — they highlight the row in the
  // drawer; the user then taps the row to actually open the detail card.
  detailPlaceId: null,
  detailPlace: null,

  setDestination: (v) => set({ destination: v }),
  setDate: (v) => set({ date: v }),
  setCoords: (v) => set({ coords: v }),
  setWeatherTarget: (v) => set({ weatherTarget: v }),
  setSearchRadius: (v) => set({ searchRadiusMeters: v }),
  setPlaceDisplay: ({ area, city }) => set({ placeArea: area || '', placeCity: city || '' }),
  setActiveTab: (v) => set({ activeTab: v }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
  setSelectedPlaceId: (v) => set({ selectedPlaceId: v }),
  setSelectedPlace: (v) => set({ selectedPlace: v }),
  setDetailPlaceId: (v) => set({ detailPlaceId: v }),
  setDetailPlace: (v) => set({ detailPlace: v }),

  // Switch tab + clear selection + persist UI state. Tab lazy-load is handled
  // automatically by useTabQuery once activeTab changes.
  switchTab: (tabKey) => {
    set({
      activeTab: tabKey,
      selectedPlaceId: null,
      selectedPlace: null,
      detailPlaceId: null,
      detailPlace: null
    });
    saveUIState({ activeTab: tabKey, selectedPlaceId: null });
  },

  // Select a place across tabs. Optionally switches to `category` first so
  // React batches both updates and the detail card finds the place in the
  // correct tab. Dispatches DOM events for map pan + drawer open.
  //
  // `pan` (default true)        — controls the map-pan side effect.
  // `openDetail` (default true) — whether to populate the detail-card state.
  //                               Pin taps pass `openDetail:false` so tapping
  //                               a pin only highlights the matching row in
  //                               the drawer — the user must then tap the
  //                               row to open the detail card.
  selectPlace: (place, category, { pan = true, openDetail = true } = {}) => {
    if (!place) {
      const currentTab = get().activeTab;
      set({
        selectedPlace: null,
        selectedPlaceId: null,
        detailPlace: null,
        detailPlaceId: null
      });
      saveUIState({ activeTab: currentTab, selectedPlaceId: null });
      return;
    }
    if (category) {
      set({ activeTab: category });
    }
    const next = {
      selectedPlaceId: place.placeId,
      selectedPlace: place
    };
    if (openDetail) {
      next.detailPlaceId = place.placeId;
      next.detailPlace = place;
    } else {
      // Pin tap on a different place while a card is open → close the card.
      next.detailPlaceId = null;
      next.detailPlace = null;
    }
    set(next);
    saveUIState({
      activeTab: category || get().activeTab,
      selectedPlaceId: place.placeId
    });
    if (category && pan) {
      window.dispatchEvent(
        new CustomEvent('travelapp:focusLocation', {
          detail: {
            lat: place.lat,
            lng: place.lng,
            placeId: place.placeId,
            name: place.name
          }
        })
      );
    }
    window.dispatchEvent(new CustomEvent('travelapp:openPlaces'));
  },

  // Close the detail card without clearing the highlight — used by the
  // detail card's X button. Pin + row highlight survive so the user can
  // re-open the card with a single tap on the same row.
  closeDetail: () => {
    set({ detailPlace: null, detailPlaceId: null });
  }
}));
