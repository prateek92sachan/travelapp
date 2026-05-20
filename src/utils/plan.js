// Plan model lives inside each wishlist list as list.plan.
// Shape:
//   plan = { days, itinerary, placeSnapshots }
//   itinerary[i] = { hotels: [placeId, ...], phases: { morning, evening, night } }
//   phases.morning = [ { id, placeId, startTime, endTime, expense } ]
//   placeSnapshots = { [placeId]: { name, address, photoUrl, lat, lng, rating, reviewCount, category } }
// Snapshots cover places added to the plan without being saved to the
// list's items (when the user opts out of auto-save on the picker).

export const PHASES = ['morning', 'evening', 'night'];

export const PHASE_LABEL = {
  morning: 'Morning',
  evening: 'Evening',
  night: 'Night',
};

export const PHASE_DEFAULT_TIMES = {
  morning: { start: '09:00', end: '13:00' },
  evening: { start: '17:00', end: '21:00' },
  night:   { start: '21:00', end: '23:30' },
};

const MAX_HOTELS_PER_DAY = 2;

function makeSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 's-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeEmptyDay() {
  return {
    hotels: [],
    phases: { morning: [], evening: [], night: [] },
  };
}

export function createEmptyPlan(days = 1) {
  const n = Math.max(1, Math.min(30, days | 0));
  return {
    days: n,
    itinerary: Array.from({ length: n }, makeEmptyDay),
    placeSnapshots: {},
  };
}

export function ensurePlan(plan) {
  if (!plan || !Array.isArray(plan.itinerary)) return createEmptyPlan(1);
  const days = Math.max(1, Math.min(30, plan.days || plan.itinerary.length || 1));
  const itinerary = Array.from({ length: days }, (_, i) => {
    const d = plan.itinerary[i] || makeEmptyDay();
    return {
      hotels: Array.isArray(d.hotels) ? d.hotels.slice(0, MAX_HOTELS_PER_DAY) : [],
      phases: {
        morning: Array.isArray(d.phases?.morning) ? d.phases.morning : [],
        evening: Array.isArray(d.phases?.evening) ? d.phases.evening : [],
        night:   Array.isArray(d.phases?.night)   ? d.phases.night   : [],
      },
    };
  });
  return {
    days,
    itinerary,
    placeSnapshots:
      plan.placeSnapshots && typeof plan.placeSnapshots === 'object' ? plan.placeSnapshots : {},
  };
}

function placeToSnapshot(place, category) {
  return {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    photoUrl: place.photoUrl,
    lat: place.lat,
    lng: place.lng,
    rating: place.rating,
    reviewCount: place.reviewCount,
    estCost: place.estCost,
    estDuration: place.estDuration,
    category: category || place.category,
  };
}

// Attach (or refresh) a snapshot for any place the plan refers to so it can
// render even if it was never saved into the list's items.
export function setPlaceSnapshot(plan, place, category) {
  const current = ensurePlan(plan);
  if (!place?.placeId) return current;
  return {
    ...current,
    placeSnapshots: {
      ...current.placeSnapshots,
      [place.placeId]: placeToSnapshot(place, category),
    },
  };
}

export function setDays(plan, nextDays) {
  const current = ensurePlan(plan);
  const n = Math.max(1, Math.min(30, nextDays | 0));
  if (n === current.days) return current;
  if (n > current.days) {
    const extra = Array.from({ length: n - current.days }, makeEmptyDay);
    return { ...current, days: n, itinerary: [...current.itinerary, ...extra] };
  }
  return { ...current, days: n, itinerary: current.itinerary.slice(0, n) };
}

export function removeDayAt(plan, dayIndex) {
  const current = ensurePlan(plan);
  if (current.days <= 1) return current;
  if (dayIndex < 0 || dayIndex >= current.days) return current;
  const itinerary = current.itinerary.filter((_, i) => i !== dayIndex);
  return { ...current, days: itinerary.length, itinerary };
}

export function addSession(plan, { dayIndex, phase, placeId }) {
  const current = ensurePlan(plan);
  if (dayIndex < 0 || dayIndex >= current.days) return current;
  if (!PHASES.includes(phase)) return current;
  const defaults = PHASE_DEFAULT_TIMES[phase];
  const session = {
    id: makeSessionId(),
    placeId,
    startTime: defaults.start,
    endTime: defaults.end,
    expense: '',
  };
  const itinerary = current.itinerary.map((d, i) => {
    if (i !== dayIndex) return d;
    return {
      ...d,
      phases: { ...d.phases, [phase]: [...d.phases[phase], session] },
    };
  });
  return { ...current, itinerary };
}

export function updateSession(plan, { dayIndex, phase, sessionId, patch }) {
  const current = ensurePlan(plan);
  const itinerary = current.itinerary.map((d, i) => {
    if (i !== dayIndex) return d;
    return {
      ...d,
      phases: {
        ...d.phases,
        [phase]: d.phases[phase].map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
      },
    };
  });
  return { ...current, itinerary };
}

export function removeSession(plan, { dayIndex, phase, sessionId }) {
  const current = ensurePlan(plan);
  const itinerary = current.itinerary.map((d, i) => {
    if (i !== dayIndex) return d;
    return {
      ...d,
      phases: { ...d.phases, [phase]: d.phases[phase].filter((s) => s.id !== sessionId) },
    };
  });
  return { ...current, itinerary };
}

export function setHotelsForDay(plan, { dayIndex, hotels }) {
  const current = ensurePlan(plan);
  const itinerary = current.itinerary.map((d, i) =>
    i === dayIndex ? { ...d, hotels: hotels.slice(0, MAX_HOTELS_PER_DAY) } : d
  );
  return { ...current, itinerary };
}

export function durationMinutes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

export function formatDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Used in the picker to warn-but-allow duplicates.
export function isPlacePlanned(plan, placeId) {
  const current = ensurePlan(plan);
  for (const day of current.itinerary) {
    for (const phase of PHASES) {
      if (day.phases[phase].some((s) => s.placeId === placeId)) return true;
    }
  }
  return false;
}
