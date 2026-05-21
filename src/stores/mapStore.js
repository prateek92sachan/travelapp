import { create } from 'zustand';

export const useMapStore = create((set, get) => ({
  // Layer toggles
  mapType: 'roadmap',
  transitOn: false,

  // Map-mode state (where the map is "focused")
  selectedHotelId: null, // null = no proximity ring
  nearbyAnchor: null, // hotel that anchors nearby-mode; null = off
  viewportTarget: null, // { lat, lng, radiusMeters, bounds } | null
  viewportCity: null, // reverse-geocoded city name from last pan

  setMapType: (mapType) => set({ mapType }),
  setTransitOn: (transitOn) =>
    set((s) => ({
      transitOn: typeof transitOn === 'function' ? transitOn(s.transitOn) : transitOn
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
