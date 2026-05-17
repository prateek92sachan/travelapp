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
  fetchTopActivities,
  fetchTopRestaurants,
  fetchTopNatureUnique,
  fetchHiddenGems,
  fetchTopHotels,
  fetchPlacesNearPoint,
  fetchPlacesInViewport,
  clearViewportCache
} from '../services/googleMaps';
import { fetchWeather, fetchLastYearWeather } from '../services/weather';
import { fetchAnnualEvents } from '../services/events';
import { enrichWithWiki } from '../services/wikipedia';
import { saveRecentTrip, getRecentTrips, replaceRecentTrips } from '../utils/recentTrips';
import { getCachedPlaces, setCachedPlaces } from '../utils/placeCache';
import { saveUIState, getUIState } from '../utils/uiState';
import { haversineKm } from '../utils/geo';
import {
  deleteWishlist,
  ensureWishlistForDestination,
  getWishlist,
  isPlaceWishlisted,
  renameWishlist,
  removeWishlistPlace,
  replaceWishlist,
  saveWishlistPlace,
  selectWishlist
} from '../utils/wishlist';
import { useAuth } from './useAuth';

const TripContext = createContext(null);

// All four tab keys; order matters for default rendering.
export const TAB_KEYS = ['activities', 'restaurants', 'nature', 'gems'];

// Map a tab key to its fetcher. Centralized so the lazy-loader stays simple.
const TAB_FETCHERS = {
  activities: fetchTopActivities,
  restaurants: fetchTopRestaurants,
  nature: fetchTopNatureUnique,
  gems: fetchHiddenGems
};

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

export function TripProvider({ children }) {
  const initialRef = useRef(readInitialFromUrl());
  const [destination, setDestination] = useState(initialRef.current.destination);
  const [date, setDate] = useState(initialRef.current.date);
  const [coords, setCoords] = useState(null);
  const [weather, setWeather] = useState(null);
  const [lastYearWeather, setLastYearWeather] = useState(null);
  const [events, setEvents] = useState([]);
  // Per-tab data: { activities: [], restaurants: null, nature: null, gems: null }
  // null = not yet loaded; [] = loaded but empty
  const [tabData, setTabData] = useState({
    activities: null,
    restaurants: null,
    nature: null,
    gems: null
  });
  const [tabLoading, setTabLoading] = useState({
    activities: false,
    restaurants: false,
    nature: false,
    gems: false
  });
  const [activeTab, setActiveTab] = useState('activities');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [wishlist, setWishlist] = useState(() =>
    typeof window === 'undefined' ? {} : getWishlist()
  );

  // ---- Map layer state ----------------------------------------------------
  // Default: standard map, no transit, hotels off (cleanest first impression)
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite' | 'terrain' | 'hybrid'
  const [transitOn, setTransitOn] = useState(false);
  const [hotelsOn, setHotelsOn] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  // When set, the map draws a 2km ring around this hotel and dims markers
  // outside that ring. Null = no proximity highlight active.
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  // Hotels are ref-mirrored too so the lazy-fetcher doesn't churn re-renders
  const hotelsLoadedForRef = useRef(null); // {lat, lng} we already fetched for

  // ---- Nearby-mode state -------------------------------------------------
  // When user clicks a hotel, we fetch a fresh slice of places near the hotel
  // and display those instead of the city-wide markers. nearbyItems is keyed
  // by tab, so the user can still flip tabs while in nearby-mode.
  const [nearbyItems, setNearbyItems] = useState({
    activities: null,
    restaurants: null,
    nature: null,
    gems: null
  });
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // The hotel that anchors nearby-mode; null when not in nearby-mode
  const [nearbyAnchor, setNearbyAnchor] = useState(null);

  // ---- Viewport refresh state --------------------------------------------
  // When user pans/zooms, the map's idle event fires viewportChanged.
  // We track the latest viewport and a "stale" flag so the UI can show
  // a "Search this area" button for manual refresh if auto-refresh is off.
  const [viewportItems, setViewportItems] = useState(null); // null = use tabData
  const [viewportLoading, setViewportLoading] = useState(false);
  // Ref mirrors to let switchTab read these without adding them to dep arrays
  const viewportItemsRef = useRef(null);
  const lastViewportParamsRef = useRef(null); // { lat, lng, radiusMeters }

  // Auth + cloud sync
  const { user, saveToCloud, loadFromCloud } = useAuth();
  const saveToCloudRef = useRef(saveToCloud);
  const lastSyncedUserRef = useRef(null);
  const wishlistRef = useRef(wishlist);

  const requestSeq = useRef(0);
  // Stale-request guards for nearby and viewport modes
  const nearbyRequestSeq = useRef(0);
  const viewportRequestSeq = useRef(0);
  const tabRequestSeq = useRef({}); // per-tab seqs to handle stale tab fetches
  // Radius derived from geocode viewport — scales place searches to match the
  // actual size of the searched region. Reset to 20km default on each search.
  const searchRadiusRef = useRef(20000);
  // Mirror of tabData in a ref so callbacks can read the freshest value
  // without taking tabData as a dependency (which would thrash render).
  const tabDataRef = useRef({
    activities: null,
    restaurants: null,
    nature: null,
    gems: null
  });

  // Refs for stable callbacks that need current destination/coords without
  // recreating on every keystroke.
  const destinationRef = useRef(destination);
  const dateRef = useRef(date);
  const coordsRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const selectedPlaceIdRef = useRef(null);
  const weatherRef = useRef(null);
  useEffect(() => {
    destinationRef.current = destination;
    dateRef.current = date;
    coordsRef.current = coords;
    activeTabRef.current = activeTab;
    selectedPlaceIdRef.current = selectedPlaceId;
    weatherRef.current = weather;
  }, [destination, date, coords, activeTab, selectedPlaceId, weather]);

  // Sync state -> URL (shareable)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (destination) u.searchParams.set('dest', destination);
    else u.searchParams.delete('dest');
    if (date) u.searchParams.set('date', date);
    window.history.replaceState({}, '', u.toString());
  }, [destination, date]);

  // Keep tabDataRef synced with tabData state so the callback below can
  // make decisions without depending on tabData (which would thrash render).
  useEffect(() => {
    tabDataRef.current = tabData;
    wishlistRef.current = wishlist;
    saveToCloudRef.current = saveToCloud;
  }, [tabData, wishlist, saveToCloud]);

  // On sign-in: load from Firestore → restore state; if no cloud data, upload local
  useEffect(() => {
    if (!user) { lastSyncedUserRef.current = null; return; }
    if (lastSyncedUserRef.current === user.uid) return;
    lastSyncedUserRef.current = user.uid;

    loadFromCloud()
      .then((cloudData) => {
        if (!cloudData?.wishlist) {
          saveToCloud({ wishlist: wishlistRef.current, recentTrips: getRecentTrips() });
          return;
        }
        setWishlist(replaceWishlist(cloudData.wishlist));
        if (cloudData.recentTrips) replaceRecentTrips(cloudData.recentTrips);
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('Cloud load on sign-in failed:', err); });
  }, [user, loadFromCloud, saveToCloud]);

  // Debounced cloud save whenever wishlist changes (also ships latest recentTrips)
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      saveToCloud({ wishlist, recentTrips: getRecentTrips() });
    }, 2000);
    return () => clearTimeout(timer);
  }, [wishlist, user, saveToCloud]);

  // ---- Tab lazy-loading ---------------------------------------------------

  // Helper that updates both state and ref in one go. Using this everywhere
  // keeps tabDataRef trustworthy without needing the useEffect mirror to
  // tick first.
  const writeTabData = useCallback((updater) => {
    setTabData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      tabDataRef.current = next;
      return next;
    });
  }, []);

  const fetchTabIfNeeded = useCallback(
    async (tabKey, geo, dest) => {
      // Read latest tabData via ref — avoids needing it in the deps array.
      if (tabDataRef.current[tabKey] != null) return;

      const fetcher = TAB_FETCHERS[tabKey];
      if (!fetcher) return;

      const localCoords = geo || coordsRef.current;
      const localDest = dest || destinationRef.current;
      if (!localCoords || !localDest) return;

      const seq = (tabRequestSeq.current[tabKey] || 0) + 1;
      tabRequestSeq.current[tabKey] = seq;

      setTabLoading((prev) => ({ ...prev, [tabKey]: true }));
      try {
        const items = await fetcher({
          destination: localDest,
          lat: localCoords.lat,
          lng: localCoords.lng,
          radiusMeters: searchRadiusRef.current
        });
        if (tabRequestSeq.current[tabKey] !== seq) return; // stale
        writeTabData((prev) => ({ ...prev, [tabKey]: items }));

        // Wikipedia enrichment in the background — catch its own errors
        enrichWithWiki(items, localDest)
          .then((enriched) => {
            if (tabRequestSeq.current[tabKey] !== seq) return;
            writeTabData((prev) => ({ ...prev, [tabKey]: enriched }));
          })
          .catch((err) => console.warn('Wiki enrich failed:', err));
      } catch (e) {
        if (tabRequestSeq.current[tabKey] !== seq) return;
        console.error(`Tab ${tabKey} fetch failed:`, e);
        writeTabData((prev) => ({ ...prev, [tabKey]: [] }));
      } finally {
        if (tabRequestSeq.current[tabKey] === seq) {
          setTabLoading((prev) => ({ ...prev, [tabKey]: false }));
        }
      }
    },
    // No tabData, coords, or destination here — read via refs.
    [writeTabData]
  );

  // Switching tabs auto-loads if data isn't already there. If we're in
  // nearby-mode the tab still affects which nearby category is shown.
  const switchTab = useCallback(
    (tabKey) => {
      setActiveTab(tabKey);
      setSelectedPlaceId(null);
      setSelectedPlace(null);
      saveUIState({ activeTab: tabKey, selectedPlaceId: null });
      // City-wide path: lazy-load the tab's data
      fetchTabIfNeeded(tabKey);

      // Viewport-mode path: if the user has panned the map, viewportItems holds
      // data for the OLD tab. Re-fetch immediately for the new tab so the list
      // doesn't freeze on stale data. Uses refs to avoid stale closures.
      if (viewportItemsRef.current !== null && lastViewportParamsRef.current && TAB_KEYS.includes(tabKey)) {
        const { lat, lng, radiusMeters } = lastViewportParamsRef.current;
        const seq = ++viewportRequestSeq.current;
        setViewportLoading(true);
        fetchPlacesInViewport({ lat, lng, radiusMeters, category: tabKey })
          .then((items) => {
            if (seq !== viewportRequestSeq.current) return;
            viewportItemsRef.current = items;
            setViewportItems(items);
          })
          .catch((err) => console.warn('Viewport tab re-fetch failed:', err))
          .finally(() => {
            if (seq === viewportRequestSeq.current) setViewportLoading(false);
          });
      }

      // Nearby-mode path: if this category isn't pre-fetched yet, fetch it now
      if (nearbyAnchor && TAB_KEYS.includes(tabKey) && !nearbyItems[tabKey]) {
        const seq = nearbyRequestSeq.current;
        fetchPlacesNearPoint({
          lat: nearbyAnchor.lat,
          lng: nearbyAnchor.lng,
          radiusKm: 2,
          category: tabKey
        })
          .then((items) => {
            if (seq !== nearbyRequestSeq.current) return;
            setNearbyItems((prev) => ({ ...prev, [tabKey]: items }));
          })
          .catch((err) => console.warn('Nearby tab fetch failed:', err));
      }
    },
    [fetchTabIfNeeded, nearbyAnchor, nearbyItems]
  );

  // Ref mirror so selectPlace can call the latest switchTab without adding it
  // as a dependency (switchTab changes whenever nearbyAnchor/nearbyItems change)
  const switchTabRef = useRef(null);
  switchTabRef.current = switchTab;

  // ---- Main search --------------------------------------------------------

  const search = useCallback(
    async (overrides = {}) => {
      const { silentRefresh = false } = overrides;
      const dest = overrides.destination ?? destinationRef.current;
      const dt = overrides.date ?? dateRef.current;

      if (!dest.trim()) {
        setError('Enter a destination first.');
        return;
      }

      if (overrides.destination && overrides.destination !== destinationRef.current) {
        setDestination(overrides.destination);
      }
      if (overrides.date && overrides.date !== dateRef.current) {
        setDate(overrides.date);
      }

      const myReq = ++requestSeq.current;
      setError(null);

      // Bump every per-tab seq so any in-flight fetch from the previous
      // destination resolves stale and is ignored. (Critical: a user-clicked
      // tab from the prior city must not write its data into the new city's
      // slot when it eventually returns.)
      TAB_KEYS.forEach((k) => {
        tabRequestSeq.current[k] = (tabRequestSeq.current[k] || 0) + 1;
      });

      if (!silentRefresh) {
        // Reset all tab data on new search — old destination's data is invalid
        const cleared = { activities: null, restaurants: null, nature: null, gems: null };
        writeTabData(cleared);
        setLoading(true);
        setSelectedPlaceId(null);
        setActiveTab('activities');
        saveUIState({ activeTab: 'activities', selectedPlaceId: null });
        setLastYearWeather(null);
        setEvents([]);
        // Hotels are city-specific — wipe and re-fetch on next toggle
        setHotels([]);
        setSelectedHotelId(null);
        hotelsLoadedForRef.current = null;

        // Exit nearby-mode and clear viewport overrides on new search
        setNearbyAnchor(null);
        setNearbyItems({ activities: null, restaurants: null, nature: null, gems: null });
        nearbyRequestSeq.current++;
        setViewportItems(null);
        viewportRequestSeq.current++;
        // Wipe the API-level viewport cache too — old city's data is irrelevant
        clearViewportCache();
      }

      try {
        const geo = await geocodeDestination(dest);
        if (myReq !== requestSeq.current) return;

        // Compute search radius from the geocode bounding box so that a state
        // like Meghalaya gets a radius matching its real extent (~100–150 km)
        // rather than the hardcoded 20 km that left outlier markers scattered.
        // Clamp: 5 km minimum (tiny towns), 300 km maximum (large countries).
        if (geo.viewportNE && geo.viewportSW) {
          const diagKm = haversineKm(geo.viewportNE, geo.viewportSW);
          searchRadiusRef.current = Math.min(300000, Math.max(5000, Math.round((diagKm / 2) * 1000)));
        } else {
          searchRadiusRef.current = 20000;
        }

        setCoords(geo);
        setWishlist(
          ensureWishlistForDestination({
            name: dest,
            destination: geo.formattedAddress || dest
          })
        );

        // Phase 1 (in parallel): current weather + activities (default tab)
        const [w, acts] = await Promise.all([
          fetchWeather({ lat: geo.lat, lng: geo.lng, dateISO: dt }),
          fetchTopActivities({ destination: dest, lat: geo.lat, lng: geo.lng, radiusMeters: searchRadiusRef.current })
        ]);
        if (myReq !== requestSeq.current) return;

        setWeather(w);
        writeTabData((prev) => ({ ...prev, activities: acts }));

        if (!silentRefresh) {
          saveRecentTrip({ destination: dest, date: dt, formattedAddress: geo.formattedAddress });
          if (saveToCloudRef.current) {
            saveToCloudRef.current({ wishlist: getWishlist(), recentTrips: getRecentTrips() });
          }
        }

        // Persist Phase 1 immediately so restore shows activities + weather instantly.
        setCachedPlaces(dest, dt, {
          coords: geo,
          tabData: { activities: acts, restaurants: null, nature: null, gems: null },
          weather: w,
        });

        // Phase 2: background — remaining categories + history. No activities update
        // to avoid visible list re-render while user is on the activities tab.
        const p2RestsSeq = tabRequestSeq.current.restaurants || 0;
        const p2NatSeq   = tabRequestSeq.current.nature      || 0;
        const p2GemsSeq  = tabRequestSeq.current.gems        || 0;
        const r = searchRadiusRef.current;
        Promise.allSettled([
          fetchLastYearWeather({ lat: geo.lat, lng: geo.lng, dateISO: dt }),
          fetchAnnualEvents(dest, dt),
          fetchTopRestaurants({ destination: dest, lat: geo.lat, lng: geo.lng, radiusMeters: r }),
          fetchTopNatureUnique({ destination: dest, lat: geo.lat, lng: geo.lng, radiusMeters: r }),
          fetchHiddenGems({ destination: dest, lat: geo.lat, lng: geo.lng, radiusMeters: r }),
        ]).then(([lywRes, evRes, restsRes, natRes, gemsRes]) => {
          if (myReq !== requestSeq.current) return;
          if (lywRes.status === 'fulfilled' && lywRes.value) setLastYearWeather(lywRes.value);
          if (evRes.status === 'fulfilled' && evRes.value?.length) setEvents(evRes.value);
          const extra = {};
          if (restsRes.status === 'fulfilled' && restsRes.value
              && (tabRequestSeq.current.restaurants || 0) === p2RestsSeq)
            extra.restaurants = restsRes.value;
          if (natRes.status === 'fulfilled' && natRes.value
              && (tabRequestSeq.current.nature || 0) === p2NatSeq)
            extra.nature = natRes.value;
          if (gemsRes.status === 'fulfilled' && gemsRes.value
              && (tabRequestSeq.current.gems || 0) === p2GemsSeq)
            extra.gems = gemsRes.value;
          if (Object.keys(extra).length) writeTabData((prev) => ({ ...prev, ...extra }));
          const td = tabDataRef.current;
          setCachedPlaces(dest, dt, {
            coords: geo,
            tabData: {
              activities: td.activities,
              restaurants: extra.restaurants ?? td.restaurants ?? null,
              nature: extra.nature ?? td.nature ?? null,
              gems: extra.gems ?? td.gems ?? null,
            },
            weather: weatherRef.current,
          });
        }).catch((err) => console.warn('Phase 2 error:', err));
      } catch (e) {
        if (myReq !== requestSeq.current) return;
        console.error(e);
        setError(e.message || 'Something went wrong fetching trip data.');
      } finally {
        if (!silentRefresh && myReq === requestSeq.current) setLoading(false);
      }
    },
    [] // reads destination/date via refs; stable across all renders
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
      writeTabData(cached.tabData);
      if (cached.weather) setWeather(cached.weather);

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

  const selectPlace = useCallback((place, category) => {
    if (!place) {
      // Close detail but keep selectedPlaceId — preserves list highlight for
      // context after the user dismisses the detail card.
      setSelectedPlace(null);
      setSelectedHotelId(null);
      return;
    }
    // Switch tab first (before setting selectedPlaceId) so React batches both
    // state updates in one render — detail card finds place in the correct tab.
    if (category) {
      // Exit viewport mode without panning the map — detail is opening and
      // the background list should show city-wide results, not re-fetch
      // viewport data for the new category (which would visibly refresh the list).
      if (viewportItemsRef.current !== null) {
        viewportRequestSeq.current++;
        viewportItemsRef.current = null;
        setViewportItems(null);
        setViewportLoading(false);
      }
      switchTabRef.current(category);
    }
    setSelectedPlaceId(place.placeId);
    setSelectedPlace(place);
    setSelectedHotelId(null);
    saveUIState({
      activeTab: category || activeTabRef.current,
      selectedPlaceId: place.placeId,
    });
    // Only pan map when selection came from a map marker (category known).
    // List-row selections must not move the map — user would return to map
    // displaced from city context ("unknown section" bug).
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
  }, []);

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
      if (!listId || !place) return;
      const next = saveWishlistPlace({
        listId,
        place,
        category
      });
      setWishlist(next);
    },
    [activeWishlistId]
  );

  const removePlaceFromWishlist = useCallback(
    (placeId, listId = activeWishlistId) => {
      if (!listId || !placeId) return;
      setWishlist(removeWishlistPlace({ listId, placeId }));
    },
    [activeWishlistId]
  );

  const selectWishlistById = useCallback((listId) => {
    setWishlist(selectWishlist(listId));
  }, []);

  const renameWishlistById = useCallback((listId, name) => {
    setWishlist(renameWishlist({ listId, name }));
  }, []);

  const deleteWishlistById = useCallback((listId) => {
    setWishlist(deleteWishlist(listId));
  }, []);

  const isWishlisted = useCallback(
    (placeId, listId = activeWishlistId) => isPlaceWishlisted(wishlist, listId, placeId),
    [wishlist, activeWishlistId]
  );

  // ---- Hotels (map-only layer) -------------------------------------------

  // Lazy-fetch hotels the first time the user toggles them on for a given
  // destination. Caches by lat/lng key so toggling on/off doesn't refetch.
  // The cache key is invalidated by `search()` which sets the ref to null
  // — that's how we drop a stale in-flight fetch from a previous city.
  const fetchHotelsIfNeeded = useCallback(async () => {
    const c = coordsRef.current;
    if (!c) return;
    const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
    if (hotelsLoadedForRef.current === key) return;

    hotelsLoadedForRef.current = key;
    setHotelsLoading(true);
    try {
      const items = await fetchTopHotels({
        destination: destinationRef.current,
        lat: c.lat,
        lng: c.lng
      });
      if (hotelsLoadedForRef.current !== key) return;
      setHotels(items);
    } catch (e) {
      console.warn('Hotels fetch failed:', e);
      hotelsLoadedForRef.current = null;
      setHotels([]);
    } finally {
      setHotelsLoading(false);
    }
  }, []);

  const toggleHotels = useCallback(() => {
    setHotelsOn((prev) => {
      const next = !prev;
      if (next) fetchHotelsIfNeeded();
      else setSelectedHotelId(null); // turning off clears the highlight
      return next;
    });
  }, [fetchHotelsIfNeeded]);

  const selectHotel = useCallback(async (hotel) => {
    setSelectedHotelId(hotel?.placeId ?? null);

    if (!hotel) {
      // Exit nearby-mode
      setNearbyAnchor(null);
      setNearbyItems({ activities: null, restaurants: null, nature: null, gems: null });
      return;
    }

    setNearbyAnchor(hotel);
    setNearbyLoading(true);
    setNearbyItems({ activities: null, restaurants: null, nature: null, gems: null });

    const seq = ++nearbyRequestSeq.current;
    try {
      const acts = await fetchPlacesNearPoint({
        lat: hotel.lat,
        lng: hotel.lng,
        radiusKm: 2,
        category: 'activities'
      });
      if (seq !== nearbyRequestSeq.current) return; // stale
      setNearbyItems((prev) => ({ ...prev, activities: acts }));

      // Background-fetch the other categories so tab switches feel instant
      Promise.all([
        fetchPlacesNearPoint({ lat: hotel.lat, lng: hotel.lng, radiusKm: 2, category: 'restaurants' }),
        fetchPlacesNearPoint({ lat: hotel.lat, lng: hotel.lng, radiusKm: 2, category: 'nature' }),
        fetchPlacesNearPoint({ lat: hotel.lat, lng: hotel.lng, radiusKm: 2, category: 'gems' })
      ])
        .then(([rests, nat, gms]) => {
          if (seq !== nearbyRequestSeq.current) return;
          setNearbyItems((prev) => ({
            ...prev,
            restaurants: rests,
            nature: nat,
            gems: gms
          }));
        })
        .catch((err) => console.warn('Nearby background fetch failed:', err));
    } catch (e) {
      if (seq !== nearbyRequestSeq.current) return;
      console.warn('Nearby fetch failed:', e);
    } finally {
      // Always clear the loading flag if we're still the latest request —
      // including the stale-bail path, otherwise the spinner sticks.
      if (seq === nearbyRequestSeq.current) setNearbyLoading(false);
    }
  }, []);

  const exitNearbyMode = useCallback(() => {
    nearbyRequestSeq.current++; // invalidate any in-flight nearby fetches
    setSelectedHotelId(null);
    setNearbyAnchor(null);
    setNearbyItems({ activities: null, restaurants: null, nature: null, gems: null });
    // Also clear any stale viewport-mode data so the user lands cleanly
    // back on city tabData rather than on a previous pan's results.
    viewportRequestSeq.current++;
    viewportItemsRef.current = null;
    lastViewportParamsRef.current = null;
    setViewportItems(null);
    setViewportLoading(false);
  }, []);

  // ---- Viewport refresh -------------------------------------------------
  //
  // When the map idles (user stopped panning/zooming), refetch places for
  // the active tab's category in the new viewport. Fetches are cached and
  // deduped at the service layer — rapid pans don't multiply API calls.
  const refreshViewport = useCallback(
    async ({ lat, lng, radiusMeters }) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (nearbyAnchor) return;

      lastViewportParamsRef.current = { lat, lng, radiusMeters: radiusMeters || 5000 };
      const seq = ++viewportRequestSeq.current;
      setViewportLoading(true);

      try {
        const items = await fetchPlacesInViewport({
          lat,
          lng,
          radiusMeters: radiusMeters || 5000,
          category: activeTab
        });
        if (seq !== viewportRequestSeq.current) return;
        viewportItemsRef.current = items;
        setViewportItems(items);
      } catch (e) {
        if (seq !== viewportRequestSeq.current) return;
        console.warn('Viewport refresh failed:', e);
      } finally {
        if (seq === viewportRequestSeq.current) setViewportLoading(false);
      }
    },
    [activeTab, nearbyAnchor]
  );

  const clearViewportItems = useCallback(() => {
    viewportRequestSeq.current++;
    viewportItemsRef.current = null;
    setViewportItems(null);
    setViewportLoading(false);
    const c = coordsRef.current;
    if (c) {
      window.dispatchEvent(
        new CustomEvent('travelapp:panToCity', { detail: { lat: c.lat, lng: c.lng } })
      );
    }
  }, []);

  // Derive: items for the currently-active tab. Map widget reads from this.
  // Priority order:
  //   1. Nearby-mode items (hotel selected)        → "near this hotel"
  //   2. Viewport items (user has zoomed/panned)   → "in this area"
  //   3. Normal tab data                            → "in this city"
  const activeTabItems = useMemo(() => {
    if (!TAB_KEYS.includes(activeTab)) {
      return [];
    }
    if (nearbyAnchor) {
      return nearbyItems[activeTab] || [];
    }
    if (viewportItems) {
      return viewportItems;
    }
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
      removePlaceFromWishlist,
      isWishlisted,
      mapType,
      setMapType,
      transitOn,
      setTransitOn,
      hotelsOn,
      toggleHotels,
      hotels,
      hotelsLoading,
      selectedHotelId,
      selectHotel,
      nearbyAnchor,
      nearbyLoading,
      exitNearbyMode,
      viewportItems,
      viewportLoading,
      refreshViewport,
      clearViewportItems,
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
      removePlaceFromWishlist,
      isWishlisted,
      mapType,
      transitOn,
      hotelsOn,
      toggleHotels,
      hotels,
      hotelsLoading,
      selectedHotelId,
      selectHotel,
      nearbyAnchor,
      nearbyLoading,
      exitNearbyMode,
      viewportItems,
      viewportLoading,
      refreshViewport,
      clearViewportItems,
    ]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}
