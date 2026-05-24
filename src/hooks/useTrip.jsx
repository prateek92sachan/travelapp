import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  geocodeDestination,
  reverseGeocodeCity,
  reverseGeocodePlaceName,
  clearViewportCache
} from '../services/googleMaps';
import { fetchWeather, fetchLastYearWeather } from '../services/weather';
import {
  saveRecentTrip,
  getRecentTrips,
  replaceRecentTrips,
  setRecentTripsCloudWriter,
  setRecentTripsSyncing,
} from '../utils/recentTrips';
import * as wishlistSync from '../services/wishlistSync';
import * as recentTripsSync from '../services/recentTripsSync';
import * as userPrefsSync from '../services/userPrefsSync';
import { migrateLegacyUserDoc } from '../services/userMigration';
import { getCachedPlaces, setCachedPlaces } from '../utils/placeCache';
import { saveUIState, getUIState } from '../utils/uiState';
import { haversineKm } from '../utils/geo';
import { useWishlistStore } from '../stores/wishlistStore';
import { useMapStore } from '../stores/mapStore';
import { useSearchStore } from '../stores/searchStore';
import { queryClient } from '../lib/queryClient';
import { weatherKey, lastYearWeatherKey, useCurrentWeather, useLastYearWeather } from './queries/useWeather';
import { TAB_KEYS, tabQueryKey, buildTabQueryFn, useTabQuery } from './queries/useTabQuery';
import { NEARBY_CATEGORIES, useNearbyQuery } from './queries/useNearbyQuery';
import { VIEWPORT_CATEGORIES, useViewportQuery } from './queries/useViewportQuery';
import { useEvents, eventsKey } from './queries/useEvents';
import { fetchAnnualEvents } from '../services/events';
import { useAuth } from './useAuth';

const TripContext = createContext(null);

// Re-export TAB_KEYS so existing consumers keep working without changing imports.
export { TAB_KEYS };

export function TripProvider({ children }) {
  // Search/Selection state lives in searchStore. Hydrated from URL at module load.
  const destination = useSearchStore((s) => s.destination);
  const date = useSearchStore((s) => s.date);
  const coords = useSearchStore((s) => s.coords);
  // Weather served from TanStack Query cache, keyed by weatherTarget.
  const { data: weather } = useCurrentWeather();
  const { data: lastYearWeather } = useLastYearWeather();
  const { data: events = [] } = useEvents();
  // Tab data lives in TanStack Query cache. Subscribe to all five so the
  // context exposes the same `tabData` / `tabLoading` shape that consumers expect.
  const activitiesQ = useTabQuery('activities');
  const restaurantsQ = useTabQuery('restaurants');
  const natureQ = useTabQuery('nature');
  const gemsQ = useTabQuery('gems');
  const hotelsQ = useTabQuery('hotels');
  const tabData = useMemo(
    () => ({
      activities: activitiesQ.data ?? null,
      restaurants: restaurantsQ.data ?? null,
      nature: natureQ.data ?? null,
      gems: gemsQ.data ?? null,
      hotels: hotelsQ.data ?? null
    }),
    [activitiesQ.data, restaurantsQ.data, natureQ.data, gemsQ.data, hotelsQ.data]
  );
  const tabLoading = useMemo(
    () => ({
      activities: activitiesQ.isFetching,
      restaurants: restaurantsQ.isFetching,
      nature: natureQ.isFetching,
      gems: gemsQ.isFetching,
      hotels: hotelsQ.isFetching
    }),
    [
      activitiesQ.isFetching,
      restaurantsQ.isFetching,
      natureQ.isFetching,
      gemsQ.isFetching,
      hotelsQ.isFetching
    ]
  );
  const activeTab = useSearchStore((s) => s.activeTab);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const selectedPlaceId = useSearchStore((s) => s.selectedPlaceId);
  const selectedPlace = useSearchStore((s) => s.selectedPlace);
  const setDestination = useSearchStore((s) => s.setDestination);
  const setDate = useSearchStore((s) => s.setDate);
  const setCoords = useSearchStore((s) => s.setCoords);
  const setWeatherTarget = useSearchStore((s) => s.setWeatherTarget);
  const setSearchRadius = useSearchStore((s) => s.setSearchRadius);
  const setPlaceDisplay = useSearchStore((s) => s.setPlaceDisplay);
  const setActiveTab = useSearchStore((s) => s.setActiveTab);
  const setLoading = useSearchStore((s) => s.setLoading);
  const setError = useSearchStore((s) => s.setError);
  const setSelectedPlaceId = useSearchStore((s) => s.setSelectedPlaceId);
  const setSelectedPlace = useSearchStore((s) => s.setSelectedPlace);
  // Snapshot URL params once for the auto-search useEffect below
  const initialRef = useRef({ destination, date });
  const wishlist = useWishlistStore((s) => s.wishlist);

  // ---- Map layer state ----------------------------------------------------
  // mapStore owns map-mode state so single-domain consumers (MapControlsPanel,
  // HotelInfoCard, NearbyModeIndicator, TransitLayer) can subscribe directly.
  const mapType = useMapStore((s) => s.mapType);
  const setMapType = useMapStore((s) => s.setMapType);
  const transitOn = useMapStore((s) => s.transitOn);
  const setTransitOn = useMapStore((s) => s.setTransitOn);
  const selectedHotelId = useMapStore((s) => s.selectedHotelId);
  const setSelectedHotelId = useMapStore((s) => s.setSelectedHotelId);
  const nearbyAnchor = useMapStore((s) => s.nearbyAnchor);
  const setNearbyAnchor = useMapStore((s) => s.setNearbyAnchor);
  const viewportTarget = useMapStore((s) => s.viewportTarget);
  const setViewportTarget = useMapStore((s) => s.setViewportTarget);
  const viewportCity = useMapStore((s) => s.viewportCity);
  const setViewportCity = useMapStore((s) => s.setViewportCity);
  const selectHotel = useMapStore((s) => s.selectHotel);
  const exitNearbyMode = useMapStore((s) => s.exitNearbyMode);
  const refreshViewport = useMapStore((s) => s.refreshViewport);

  const nearbyActQ = useNearbyQuery({ anchor: nearbyAnchor, category: 'activities' });
  const nearbyRestQ = useNearbyQuery({ anchor: nearbyAnchor, category: 'restaurants' });
  const nearbyNatQ = useNearbyQuery({ anchor: nearbyAnchor, category: 'nature' });
  const nearbyGemsQ = useNearbyQuery({ anchor: nearbyAnchor, category: 'gems' });
  const nearbyItems = useMemo(
    () => ({
      activities: nearbyActQ.data ?? null,
      restaurants: nearbyRestQ.data ?? null,
      nature: nearbyNatQ.data ?? null,
      gems: nearbyGemsQ.data ?? null
    }),
    [nearbyActQ.data, nearbyRestQ.data, nearbyNatQ.data, nearbyGemsQ.data]
  );
  const nearbyLoading =
    nearbyActQ.isFetching ||
    nearbyRestQ.isFetching ||
    nearbyNatQ.isFetching ||
    nearbyGemsQ.isFetching;

  // ---- Viewport refresh state --------------------------------------------
  // viewportTarget controls the five useViewportQuery hooks. Null = no viewport
  // override; viewports queries are disabled and the map shows city tabData.
  const vpActQ = useViewportQuery({ target: viewportTarget, category: 'activities' });
  const vpRestQ = useViewportQuery({ target: viewportTarget, category: 'restaurants' });
  const vpNatQ = useViewportQuery({ target: viewportTarget, category: 'nature' });
  const vpGemsQ = useViewportQuery({ target: viewportTarget, category: 'gems' });
  const vpHotelsQ = useViewportQuery({ target: viewportTarget, category: 'hotels' });
  const viewportItems = useMemo(() => {
    if (!viewportTarget) return null;
    return {
      activities: vpActQ.data ?? null,
      restaurants: vpRestQ.data ?? null,
      nature: vpNatQ.data ?? null,
      gems: vpGemsQ.data ?? null,
      hotels: vpHotelsQ.data ?? null
    };
  }, [viewportTarget, vpActQ.data, vpRestQ.data, vpNatQ.data, vpGemsQ.data, vpHotelsQ.data]);
  const viewportLoading =
    vpActQ.isFetching ||
    vpRestQ.isFetching ||
    vpNatQ.isFetching ||
    vpGemsQ.isFetching ||
    vpHotelsQ.isFetching;

  // Auth + cloud sync — per-mutation writes via wishlistStore.cloudWriter
  // (installed on sign-in below). No more bulk doc rewrites.
  const { user } = useAuth();
  const lastSyncedUserRef = useRef(null);

  const requestSeq = useRef(0);

  // Whenever viewportTarget changes (user panned), re-resolve place display
  // so the search-bar chip stays in sync with the visible map center.
  const placeResolveSeq = useRef(0);
  useEffect(() => {
    if (!viewportTarget) return;
    const { lat, lng } = viewportTarget;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const seq = ++placeResolveSeq.current;
    // Cost: reverseGeocodeCity uses Geocoding API (~$5/1000) instead of the
    // Places Text Search "city" probe (~$32/1000). See milestone Fix 2.
    Promise.all([
      reverseGeocodePlaceName({ lat, lng }).catch(() => null),
      reverseGeocodeCity({ lat, lng }).catch(() => null)
    ]).then(([name, locality]) => {
      if (seq !== placeResolveSeq.current) return;
      if (!name && !locality) return;
      let area = name || locality || '';
      let city = '';
      if (name) {
        const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          area = parts[0];
          city = parts[1];
        } else if (parts.length === 1) {
          area = parts[0];
          if (locality && locality.toLowerCase() !== parts[0].toLowerCase()) {
            city = locality;
          }
        }
      }
      setPlaceDisplay({ area, city });
    });
  }, [viewportTarget?.lat, viewportTarget?.lng, setPlaceDisplay]);

  // Sync state -> URL (shareable)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (destination) u.searchParams.set('dest', destination);
    else u.searchParams.delete('dest');
    if (date) u.searchParams.set('date', date);
    window.history.replaceState({}, '', u.toString());
  }, [destination, date]);

  // On sign-in: migrate legacy v3 blob → v4 subcollections (one-shot, idempotent),
  // hydrate local stores from cloud, then install per-mutation cloud writers.
  // On sign-out: tear down writers so mutations stay local-only.
  useEffect(() => {
    if (!user) {
      lastSyncedUserRef.current = null;
      useWishlistStore.getState().setCloudWriter(null);
      setRecentTripsCloudWriter(null);
      useMapStore.getState().setCloudPrefsWriter(null);
      return;
    }
    if (lastSyncedUserRef.current === user.uid) return;
    lastSyncedUserRef.current = user.uid;

    const uid = user.uid;
    let cancelled = false;
    const wishlistStore = useWishlistStore.getState();

    (async () => {
      try {
        await migrateLegacyUserDoc(uid);
        if (cancelled) return;

        const [cloudWishlist, cloudTrips, cloudPrefs] = await Promise.all([
          wishlistSync.loadAllWishlist(uid),
          recentTripsSync.loadAllTrips(uid),
          userPrefsSync.loadPrefs(uid).catch(() => null),
        ]);
        if (cancelled) return;

        const hasCloudData = (cloudWishlist.lists?.length || 0) > 0 || cloudTrips.length > 0;

        if (hasCloudData) {
          // Cloud is source of truth. Apply under sync-guard so the dual-write
          // path in stores/utils doesn't echo back to Firestore.
          wishlistStore.setSyncing(true);
          setRecentTripsSyncing(true);
          try {
            wishlistStore.replace(cloudWishlist);
            replaceRecentTrips(cloudTrips);
          } finally {
            wishlistStore.setSyncing(false);
            setRecentTripsSyncing(false);
          }
        }

        // Hydrate map prefs under syncing guard so the setter doesn't echo back.
        const mapStore = useMapStore.getState();
        if (cloudPrefs?.mapProvider) {
          mapStore.setSyncingPrefs(true);
          try {
            mapStore.setMapProvider(cloudPrefs.mapProvider);
          } finally {
            mapStore.setSyncingPrefs(false);
          }
        }
        mapStore.setCloudPrefsWriter({
          setMapProvider: (provider) => userPrefsSync.setMapProvider(uid, provider),
        });
        // First-time / empty cloud: seed current local provider.
        if (!cloudPrefs?.mapProvider) {
          await userPrefsSync.setMapProvider(uid, mapStore.mapProvider);
        }

        // Bind writers to this uid. Each store mutation now writes a delta.
        wishlistStore.setCloudWriter({
          upsertList: (list) => wishlistSync.upsertList(uid, list),
          deleteList: (list) => wishlistSync.deleteList(uid, list),
          upsertItem: (list, item) => wishlistSync.upsertItem(uid, list, item),
          removeItem: (list, placeId) => wishlistSync.removeItem(uid, list, placeId),
          updatePlan: (list) => wishlistSync.updatePlan(uid, list),
          setActiveListId: (id) => wishlistSync.setActiveListId(uid, id),
        });
        setRecentTripsCloudWriter({
          upsertTrip: (trip) => recentTripsSync.upsertTrip(uid, trip),
          deleteTrip: (trip) => recentTripsSync.deleteTrip(uid, trip),
        });

        // First-time / post-migration empty cloud: seed from current local state.
        if (!hasCloudData) {
          const localLists = wishlistStore.wishlist.lists || [];
          for (const list of localLists) {
            await wishlistSync.upsertList(uid, list);
            for (const item of list.items || []) {
              await wishlistSync.upsertItem(uid, list, item);
            }
            if (list.mode === 'plan' && list.plan) {
              await wishlistSync.updatePlan(uid, list);
            }
          }
          if (wishlistStore.wishlist.activeListId) {
            await wishlistSync.setActiveListId(uid, wishlistStore.wishlist.activeListId);
          }
          for (const trip of getRecentTrips()) {
            await recentTripsSync.upsertTrip(uid, trip);
          }
        }
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          console.warn('Cloud sync on sign-in failed:', err);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // ---- Tab switching ------------------------------------------------------
  // All five tab queries are subscribed at the top of this provider, so tab
  // data auto-fetches when destination/coords change. fetchTabIfNeeded is kept
  // as a noop for backward compatibility with consumers that still call it.
  const fetchTabIfNeeded = useCallback(() => {}, []);

  // switchTab + selectPlace are searchStore actions — exposed via context for
  // legacy consumers that still go through useTrip(). Direct subscribers can
  // call useSearchStore((s) => s.switchTab) instead.
  const switchTab = useSearchStore((s) => s.switchTab);

  // ---- Main search --------------------------------------------------------

  const search = useCallback(
    async (overrides = {}) => {
      const { silentRefresh = false, skipRecents = false, preserveSelection = false } = overrides;
      const snap = useSearchStore.getState();
      const dest = overrides.destination ?? snap.destination;
      const dt = overrides.date ?? snap.date;

      if (!dest.trim()) {
        setError('Enter a destination first.');
        return;
      }

      if (overrides.destination && overrides.destination !== snap.destination) {
        setDestination(overrides.destination);
      }
      if (overrides.date && overrides.date !== snap.date) {
        setDate(overrides.date);
      }

      const myReq = ++requestSeq.current;
      setError(null);

      if (!silentRefresh) {
        // Clear stale tab + weather cache so the UI doesn't show old destination's
        // data during the geocode interval. Once coords/destination change, the
        // tab queries are disabled until the new coords land, so no fetch fires.
        queryClient.removeQueries({ queryKey: ['tab'] });
        setLoading(true);
        if (!preserveSelection) {
          setSelectedPlaceId(null);
          setActiveTab('activities');
          saveUIState({ activeTab: 'activities', selectedPlaceId: null });
        }
        setWeatherTarget(null);
        setPlaceDisplay({ area: '', city: '' });
        // Clear events query so old destination's events don't linger.
        queryClient.removeQueries({ queryKey: ['events'] });
        if (!preserveSelection) setSelectedHotelId(null);

        // Exit nearby-mode and clear viewport overrides on new search
        setNearbyAnchor(null);
        setViewportTarget(null);
        // Wipe the API-level viewport cache too — old city's data is irrelevant
        clearViewportCache();
      }

      try {
        // Cache geocode so repeated searches of the same destination skip API.
        const geo = await queryClient.fetchQuery({
          queryKey: ['geocode', dest],
          queryFn: () => geocodeDestination(dest)
        });
        if (myReq !== requestSeq.current) return;

        // Compute search radius from the geocode bounding box so that a state
        // like Meghalaya gets a radius matching its real extent (~100–150 km)
        // rather than the hardcoded 20 km that left outlier markers scattered.
        // Clamp: 5 km minimum (tiny towns), 300 km maximum (large countries).
        let radius;
        if (geo.viewportNE && geo.viewportSW) {
          const diagKm = haversineKm(geo.viewportNE, geo.viewportSW);
          radius = Math.min(300000, Math.max(5000, Math.round((diagKm / 2) * 1000)));
        } else {
          radius = 20000;
        }
        setSearchRadius(radius);

        setCoords(geo);
        // Prune empty lists from prior destinations and set the ghost city
        // for this search. Does NOT auto-create a real list — user must
        // explicitly promote via the + Add button or by adding content.
        useWishlistStore.getState().beginDestination({
          name: dest,
          destination: geo.formattedAddress || dest,
        });

        // Set weather target — auto-triggers useCurrentWeather hook subscribers.
        const weatherTarget = { lat: geo.lat, lng: geo.lng, dateISO: dt };
        setWeatherTarget(weatherTarget);

        // Derive area + city for the summary chip from the geocode result we
        // already have — no extra API calls. formattedAddress looks like
        // "Shibuya City, Tokyo, Japan" or "Tokyo, Japan". Trim trailing
        // country segment; first segment = area, second (if any) = city.
        // See milestone Fix 9.
        {
          const parts = (geo.formattedAddress || dest)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          let area = dest;
          let displayCity = '';
          if (parts.length >= 3) {
            area = parts[0];
            displayCity = parts[1];
          } else if (parts.length === 2) {
            area = parts[0];
          } else if (parts.length === 1) {
            area = parts[0];
          }
          setPlaceDisplay({ area, city: displayCity });
        }

        // Phase 1 (in parallel): current weather + activities (default tab).
        // fetchQuery both seeds the cache (so hook subscribers render) and
        // returns the value so we can persist it to localStorage.
        const activitiesKey = tabQueryKey({
          tabKey: 'activities',
          destination: dest,
          lat: geo.lat,
          lng: geo.lng,
          radiusMeters: radius
        });
        const [w, acts] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: weatherKey(weatherTarget),
            queryFn: () => fetchWeather(weatherTarget),
            staleTime: 0
          }),
          queryClient.fetchQuery({
            queryKey: activitiesKey,
            queryFn: buildTabQueryFn({
              tabKey: 'activities',
              destination: dest,
              lat: geo.lat,
              lng: geo.lng,
              radiusMeters: radius
            }),
            staleTime: 0
          })
        ]);
        if (myReq !== requestSeq.current) return;

        if (!silentRefresh && !skipRecents) {
          // saveRecentTrip dual-writes to localStorage + Firestore via
          // recentTripsCloudWriter (installed on sign-in). No explicit
          // cloud call needed here anymore.
          saveRecentTrip({ destination: dest, date: dt, formattedAddress: geo.formattedAddress });
        }

        // Persist Phase 1 immediately so restore shows activities + weather instantly.
        setCachedPlaces(dest, dt, {
          coords: geo,
          tabData: { activities: acts, restaurants: null, nature: null, gems: null, hotels: null },
          weather: w,
        });

        // Phase 2: background — last-year weather + events only.
        // Tab prefetch removed (Fix 3): restaurants/nature/gems/hotels now
        // lazy-fetch via useTabQuery when the user opens the tab or toggles
        // the map category visible. Each suppressed prefetch saves one
        // Places Text Search call (~₹3) per search.
        Promise.allSettled([
          queryClient.fetchQuery({
            queryKey: lastYearWeatherKey(weatherTarget),
            queryFn: () => fetchLastYearWeather(weatherTarget),
            staleTime: 0
          }),
          queryClient.fetchQuery({
            queryKey: eventsKey({ destination: dest, dateISO: dt }),
            queryFn: () => fetchAnnualEvents(dest, dt),
            staleTime: 0
          })
        ]).catch((err) => console.warn('Phase 2 error:', err));
      } catch (e) {
        if (myReq !== requestSeq.current) return;
        console.error(e);
        setError(e.message || 'Something went wrong fetching trip data.');
      } finally {
        if (!silentRefresh && myReq === requestSeq.current) setLoading(false);
      }
    },
    // All store setters are stable — search reads fresh state via getState().
    [setDestination, setDate, setCoords, setWeatherTarget, setSearchRadius, setPlaceDisplay, setLoading, setError, setSelectedPlaceId, setActiveTab]
  );


  // Auto-search on mount if URL had params.
  // If a fresh cache hit exists, pre-populate state immediately so the UI
  // renders instantly, then re-fetch silently in the background.
  // Also restores the active tab and selected place the user was on.
  useEffect(() => {
    if (!initialRef.current.destination) return;
    const cached = getCachedPlaces(initialRef.current.destination, initialRef.current.date);
    if (cached) {
      setCoords(cached.coords);
      // Compute the radius that would have been used (we didn't persist it).
      // Falls back to default — the silent refresh that follows will overwrite it.
      const radius = useSearchStore.getState().searchRadiusMeters;
      // Seed tab query cache from localStorage so UI renders cached items instantly.
      if (cached.tabData && cached.coords) {
        TAB_KEYS.forEach((tabKey) => {
          const items = cached.tabData[tabKey];
          if (items == null) return;
          queryClient.setQueryData(
            tabQueryKey({
              tabKey,
              destination: initialRef.current.destination,
              lat: cached.coords.lat,
              lng: cached.coords.lng,
              radiusMeters: radius
            }),
            items
          );
        });
      }
      if (cached.weather && cached.coords) {
        const target = { lat: cached.coords.lat, lng: cached.coords.lng, dateISO: initialRef.current.date };
        // Seed query cache so UI renders cached weather instantly.
        queryClient.setQueryData(weatherKey(target), cached.weather);
        setWeatherTarget(target);
      }

      const ui = getUIState();
      if (ui?.activeTab) setActiveTab(ui.activeTab);

      if (ui?.selectedPlaceId && cached.tabData) {
        const tabKey = ui.activeTab || 'activities';
        const place = (cached.tabData[tabKey] || []).find(
          (p) => p.placeId === ui.selectedPlaceId
        );
        if (place) {
          setSelectedPlaceId(ui.selectedPlaceId);
          setSelectedPlace(place);
          // Re-open mobile drawer after React renders the restored state
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('travelapp:openPlaces'));
          });
        }
      }
    }
    search({ silentRefresh: !!cached });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Selection (cross-tab) ---------------------------------------------
  const selectPlace = useSearchStore((s) => s.selectPlace);

  const wishlistLists = useMemo(() => wishlist.lists || [], [wishlist]);
  const activeWishlistId = useMemo(
    () => wishlist.activeListId || wishlistLists[0]?.id || null,
    [wishlist, wishlistLists]
  );
  const activeWishlist = useMemo(
    () => wishlistLists.find((list) => list.id === activeWishlistId) || null,
    [wishlistLists, activeWishlistId]
  );

  const addPlaceToWishlist = useCallback(
    (place, category, listId = activeWishlistId) => {
      useWishlistStore.getState().addPlace({ listId, place, category });
    },
    [activeWishlistId]
  );

  // The list to use for saving/checking in the current mode:
  // viewport mode → the city-named list (may be null until first save creates it)
  // normal mode   → active list
  const effectiveListId = useMemo(() => {
    if (!viewportCity) return activeWishlistId;
    const norm = viewportCity.toLowerCase();
    return wishlistLists.find((l) => l.destination?.toLowerCase() === norm)?.id || null;
  }, [viewportCity, wishlistLists, activeWishlistId]);

  // Like addPlaceToWishlist but auto-routes to the viewport city's list when active.
  // Creates the list on first save if it doesn't exist yet.
  const addPlaceToSmartWishlist = useCallback(
    (place, category) => {
      useWishlistStore.getState().addPlaceSmart({
        place,
        category,
        viewportCity,
        fallbackListId: activeWishlistId
      });
    },
    [viewportCity, activeWishlistId]
  );

  const removePlaceFromWishlist = useCallback(
    (placeId, listId = activeWishlistId) => {
      useWishlistStore.getState().removePlace({ listId, placeId });
    },
    [activeWishlistId]
  );

  const selectWishlistById = useCallback((listId) => {
    useWishlistStore.getState().selectList(listId);
  }, []);

  const renameWishlistById = useCallback((listId, name) => {
    useWishlistStore.getState().renameList({ listId, name });
  }, []);

  const deleteWishlistById = useCallback((listId) => {
    useWishlistStore.getState().deleteList(listId);
  }, []);

  const updateListPlan = useCallback((listId, plan) => {
    useWishlistStore.getState().updatePlan({ listId, plan });
  }, []);

  const isWishlisted = useCallback(
    (placeId, listId = activeWishlistId) =>
      useWishlistStore.getState().isWishlisted(listId, placeId),
    [activeWishlistId, wishlist]
  );

  // ---- Hotel nearby + viewport modes --------------------------------------
  // selectHotel, exitNearbyMode, refreshViewport are exposed by mapStore and
  // subscribed at the top of this provider. clearViewportItems wraps the store
  // action because it also dispatches a pan-to-city event.
  const clearViewportItems = useCallback(() => {
    useMapStore.getState().clearViewportTarget();
    const c = useSearchStore.getState().coords;
    if (c) {
      window.dispatchEvent(
        new CustomEvent('travelapp:panToCity', { detail: { lat: c.lat, lng: c.lng } })
      );
    }
  }, []);

  // Triggered by "Search here" button — sets viewport target (auto-fetches
  // places) and updates weather target (auto-refetches weather). Reverse
  // geocode for city label runs in parallel; failure is non-fatal.
  const searchHere = useCallback(
    async ({ lat, lng, radiusMeters, bounds }) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (nearbyAnchor) return;
      setWeatherTarget({ lat, lng, dateISO: useSearchStore.getState().date });
      refreshViewport({ lat, lng, radiusMeters, bounds });
      const city = await reverseGeocodeCity({ lat, lng }).catch(() => null);
      if (city) {
        setViewportCity(city);
        // Update ghost so the wishlist's + Add button + ghost chip track
        // the panned-to city live.
        useWishlistStore.getState().setGhostCity(city);
      }
    },
    [nearbyAnchor, refreshViewport, setWeatherTarget, setViewportCity]
  );

  // Derive: items for the currently-active tab. Map widget reads from this.
  // Priority order:
  //   1. Nearby-mode items (hotel selected)        → "near this hotel"
  //   2. Viewport items (user has zoomed/panned)   → "in this area"
  //   3. Normal tab data                            → "in this city"
  const activeTabItems = useMemo(() => {
    if (!TAB_KEYS.includes(activeTab)) return [];
    if (nearbyAnchor) return nearbyItems[activeTab] || [];
    if (viewportItems) return viewportItems[activeTab] || [];
    return tabData[activeTab] || [];
  }, [nearbyAnchor, nearbyItems, viewportItems, tabData, activeTab]);

  // Loading state should reflect whichever data source is currently active.
  const activeTabLoading = useMemo(
    () =>
      TAB_KEYS.includes(activeTab) &&
      ((nearbyAnchor && nearbyLoading) ||
        viewportLoading ||
        tabLoading[activeTab] ||
        false),
    [activeTab, nearbyAnchor, nearbyLoading, viewportLoading, tabLoading]
  );

  const value = useMemo(
    () => ({
      destination,
      setDestination,
      date,
      setDate,
      coords,
      weather,
      lastYearWeather,
      events,
      tabData,
      tabLoading,
      activeTab,
      switchTab,
      fetchTabIfNeeded,
      activeTabItems,
      activeTabLoading,
      loading,
      error,
      search,
      selectedPlaceId,
      selectedPlace,
      selectPlace,
      wishlist,
      wishlistLists,
      activeWishlist,
      activeWishlistId,
      selectWishlistById,
      renameWishlistById,
      deleteWishlistById,
      addPlaceToWishlist,
      addPlaceToSmartWishlist,
      removePlaceFromWishlist,
      isWishlisted,
      updateListPlan,
      effectiveListId,
      viewportCity,
      mapType,
      setMapType,
      transitOn,
      setTransitOn,
      selectedHotelId,
      selectHotel,
      nearbyAnchor,
      nearbyLoading,
      exitNearbyMode,
      viewportItems,
      viewportLoading,
      refreshViewport,
      clearViewportItems,
      searchHere,
    }),
    [
      destination,
      date,
      coords,
      weather,
      lastYearWeather,
      events,
      tabData,
      tabLoading,
      activeTab,
      switchTab,
      fetchTabIfNeeded,
      activeTabItems,
      activeTabLoading,
      loading,
      error,
      search,
      selectedPlaceId,
      selectedPlace,
      selectPlace,
      wishlist,
      wishlistLists,
      activeWishlist,
      activeWishlistId,
      selectWishlistById,
      renameWishlistById,
      deleteWishlistById,
      addPlaceToWishlist,
      addPlaceToSmartWishlist,
      removePlaceFromWishlist,
      isWishlisted,
      updateListPlan,
      effectiveListId,
      viewportCity,
      mapType,
      transitOn,
      selectedHotelId,
      selectHotel,
      nearbyAnchor,
      nearbyLoading,
      exitNearbyMode,
      viewportItems,
      viewportLoading,
      refreshViewport,
      clearViewportItems,
      searchHere,
    ]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}
