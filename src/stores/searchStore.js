import { create } from 'zustand';
import { saveUIState } from '../utils/uiState';
import { useMapStore } from './mapStore';

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
  activeTab: 'activities',
  loading: false,
  error: null,
  selectedPlaceId: null,
  selectedPlace: null,

  setDestination: (v) => set({ destination: v }),
  setDate: (v) => set({ date: v }),
  setCoords: (v) => set({ coords: v }),
  setWeatherTarget: (v) => set({ weatherTarget: v }),
  setSearchRadius: (v) => set({ searchRadiusMeters: v }),
  setActiveTab: (v) => set({ activeTab: v }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
  setSelectedPlaceId: (v) => set({ selectedPlaceId: v }),
  setSelectedPlace: (v) => set({ selectedPlace: v }),

  // Switch tab + clear selection + persist UI state. Tab lazy-load is handled
  // automatically by useTabQuery once activeTab changes.
  switchTab: (tabKey) => {
    set({ activeTab: tabKey, selectedPlaceId: null, selectedPlace: null });
    saveUIState({ activeTab: tabKey, selectedPlaceId: null });
  },

  // Select a place across tabs. Optionally switches to `category` first so
  // React batches both updates and the detail card finds the place in the
  // correct tab. Dispatches DOM events for map pan + drawer open.
  selectPlace: (place, category) => {
    if (!place) {
      const currentTab = get().activeTab;
      set({ selectedPlace: null, selectedPlaceId: null });
      useMapStore.getState().setSelectedHotelId(null);
      saveUIState({ activeTab: currentTab, selectedPlaceId: null });
      return;
    }
    if (category) {
      set({ activeTab: category });
    }
    set({ selectedPlaceId: place.placeId, selectedPlace: place });
    useMapStore.getState().setSelectedHotelId(null);
    saveUIState({
      activeTab: category || get().activeTab,
      selectedPlaceId: place.placeId
    });
    if (category) {
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
  }
}));
