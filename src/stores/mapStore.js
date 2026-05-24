import { create } from 'zustand';

const PROVIDER_KEY = 'mapProvider';
const VALID_PROVIDERS = new Set(['google', 'mapbox']);

function readStoredProvider() {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    return VALID_PROVIDERS.has(v) ? v : 'google';
  } catch {
    return 'google';
  }
}

export const useMapStore = create((set, get) => ({
  // Layer toggles
  mapType: 'roadmap',
  transitOn: false,

  // Renderer choice. Persists to localStorage immediately + Firestore when signed in.
  mapProvider: readStoredProvider(),
  cloudPrefsWriter: null,
  syncingPrefs: false,

  // Category visibility — drives both map markers AND tab/viewport prefetch
  // gating. Default: activities + restaurants ON so initial search only fires
  // 2 Places Text Search calls instead of 5. User opts in to the rest via the
  // map controls panel. See milestone Fix 3.
  visibleCategories: {
    activities: true,
    restaurants: true,
    nature: false,
    gems: false,
    hotels: false
  },

  // Map-mode state (where the map is "focused")
  selectedHotelId: null, // null = no proximity ring
  nearbyAnchor: null, // hotel that anchors nearby-mode; null = off
  viewportTarget: null, // { lat, lng, radiusMeters, bounds } | null
  viewportCity: null, // reverse-geocoded city name from last pan

  setMapProvider: (provider) => {
    if (!VALID_PROVIDERS.has(provider)) return;
    if (get().mapProvider === provider) return;
    set({ mapProvider: provider });
    try { localStorage.setItem(PROVIDER_KEY, provider); } catch {}
    const { cloudPrefsWriter, syncingPrefs } = get();
    if (!syncingPrefs && cloudPrefsWriter?.setMapProvider) {
      cloudPrefsWriter.setMapProvider(provider).catch(() => {});
    }
  },
  setCloudPrefsWriter: (writer) => set({ cloudPrefsWriter: writer }),
  setSyncingPrefs: (v) => set({ syncingPrefs: v }),

  setMapType: (mapType) => set({ mapType }),
  setTransitOn: (transitOn) =>
    set((s) => ({
      transitOn: typeof transitOn === 'function' ? transitOn(s.transitOn) : transitOn
    })),
  toggleCategory: (cat) =>
    set((s) => ({
      visibleCategories: { ...s.visibleCategories, [cat]: !s.visibleCategories[cat] }
    })),

  setSelectedHotelId: (v) => set({ selectedHotelId: v }),
  setNearbyAnchor: (v) => set({ nearbyAnchor: v }),
  setViewportTarget: (v) => set({ viewportTarget: v }),
  setViewportCity: (v) => set({ viewportCity: v }),

  // Click hotel → enter nearby mode (or exit if null passed).
  selectHotel: (hotel) =>
    set({
      selectedHotelId: hotel?.placeId ?? null,
      nearbyAnchor: hotel || null
    }),

  // Exit nearby mode + clear viewport overrides so user lands on city tabData.
  exitNearbyMode: () =>
    set({
      selectedHotelId: null,
      nearbyAnchor: null,
      viewportTarget: null
    }),

  // Pan refresh — sets viewport target. Guarded against nearby-mode by caller.
  refreshViewport: ({ lat, lng, radiusMeters, bounds }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (get().nearbyAnchor) return;
    set({
      viewportTarget: {
        lat,
        lng,
        radiusMeters: radiusMeters || 5000,
        bounds: bounds || null
      }
    });
  },

  // Clear viewport mode. Caller responsible for dispatching pan-to-city event.
  clearViewportTarget: () => set({ viewportTarget: null, viewportCity: null })
}));
