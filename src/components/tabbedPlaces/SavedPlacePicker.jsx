import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useTabQuery, prefetchTab } from '../../hooks/queries/useTabQuery';
import { useViewportQuery } from '../../hooks/queries/useViewportQuery';
import { PlacePickerModal, PICKER_TABS } from '../PlacePickerModal';
import PlanSlotChooser from '../PlanSlotChooser';
import { toast } from 'sonner';
import { ensurePlan, PHASE_LABEL } from '../../utils/plan';

// Live-POI picker for Saved mode. Mounted only while open so the 5 category
// queries don't fire (and bill) when closed. Mirrors plan-mode add-session
// picker but toggles places into the active saved list (multi-add, stays
// open) and includes hotels. viewport data takes precedence over city tab.
export function SavedPlacePicker({ listId, onClose, footerSlot }) {
  const activeTab = useSearchStore((s) => s.activeTab);
  const viewportTarget = useMapStore((s) => s.viewportTarget);
  const wAddPlace = useWishlistStore((s) => s.addPlace);
  const wRemovePlace = useWishlistStore((s) => s.removePlace);
  const items = useWishlistStore(
    (s) => s.wishlist.lists.find((l) => l.id === listId)?.items
  );

  const savedList = useWishlistStore((s) => s.wishlist.lists.find((l) => l.id === listId));
  const savedDest = savedList?.destination || null;
  const savedCountry = savedList?.country || null;
  const wAddToPlanSlot = useWishlistStore((s) => s.addToPlanSlot);
  const planList = useWishlistStore((s) =>
    savedDest
      ? s.wishlist.lists.find(
          (l) => l.mode === 'plan' && l.destination?.toLowerCase() === savedDest.toLowerCase()
        )
      : null
  );
  const { planDayCount, hotelFullDays } = useMemo(() => {
    const p = ensurePlan(planList?.plan);
    const full = new Set();
    p.itinerary.forEach((d, i) => { if ((d.hotels?.length || 0) >= 2) full.add(i); });
    return { planDayCount: p.days, hotelFullDays: full };
  }, [planList]);
  const [planFor, setPlanFor] = useState(null); // { place, category } | null

  const activitiesQ = useTabQuery('activities');
  const restaurantsQ = useTabQuery('restaurants');
  const natureQ = useTabQuery('nature');
  const gemsQ = useTabQuery('gems');
  const hotelsQ = useTabQuery('hotels');
  const vpActQ = useViewportQuery({ target: viewportTarget, category: 'activities' });
  const vpRestQ = useViewportQuery({ target: viewportTarget, category: 'restaurants' });
  const vpNatQ = useViewportQuery({ target: viewportTarget, category: 'nature' });
  const vpGemsQ = useViewportQuery({ target: viewportTarget, category: 'gems' });
  const vpHotelsQ = useViewportQuery({ target: viewportTarget, category: 'hotels' });

  const liveDataByCategory = useMemo(() => {
    const tab = {
      activities: activitiesQ.data ?? null,
      restaurants: restaurantsQ.data ?? null,
      nature: natureQ.data ?? null,
      gems: gemsQ.data ?? null,
      hotels: hotelsQ.data ?? null,
    };
    const vp = viewportTarget
      ? {
          activities: vpActQ.data ?? null,
          restaurants: vpRestQ.data ?? null,
          nature: vpNatQ.data ?? null,
          gems: vpGemsQ.data ?? null,
          hotels: vpHotelsQ.data ?? null,
        }
      : null;
    const out = {};
    for (const t of PICKER_TABS) out[t.key] = (vp && vp[t.key]) || tab[t.key] || null;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activitiesQ.data, restaurantsQ.data, natureQ.data, gemsQ.data, hotelsQ.data,
    viewportTarget, vpActQ.data, vpRestQ.data, vpNatQ.data, vpGemsQ.data, vpHotelsQ.data,
  ]);

  const tabLoading = useMemo(() => ({
    activities: activitiesQ.isFetching || vpActQ.isFetching,
    restaurants: restaurantsQ.isFetching || vpRestQ.isFetching,
    nature: natureQ.isFetching || vpNatQ.isFetching,
    gems: gemsQ.isFetching || vpGemsQ.isFetching,
    hotels: hotelsQ.isFetching || vpHotelsQ.isFetching,
  }), [
    activitiesQ.isFetching, restaurantsQ.isFetching, natureQ.isFetching, gemsQ.isFetching, hotelsQ.isFetching,
    vpActQ.isFetching, vpRestQ.isFetching, vpNatQ.isFetching, vpGemsQ.isFetching, vpHotelsQ.isFetching,
  ]);

  const savedIds = useMemo(() => new Set((items || []).map((i) => i.placeId)), [items]);
  const plannedSet = useMemo(() => new Set(), []);
  const isSavedFn = (p) => savedIds.has(p.placeId);
  const initialTab = PICKER_TABS.some((t) => t.key === activeTab) ? activeTab : 'activities';

  const toggle = (place, category) => {
    if (savedIds.has(place.placeId)) wRemovePlace({ listId, placeId: place.placeId });
    else wAddPlace({ listId, place, category });
  };

  const commitPlan = ({ dayIndex, phase, newDay }) => {
    if (!planFor || !savedDest) { setPlanFor(null); return; }
    const res = wAddToPlanSlot({
      destination: savedDest,
      country: savedCountry,
      place: planFor.place,
      category: planFor.category,
      dayIndex,
      phase,
      asHotel: planFor.category === 'hotels',
      newDay,
    });
    if (res?.blocked === 'hotelFull') {
      toast.error(`Day ${res.dayIndex + 1} already has 2 hotels`);
      return; // keep sheet open so user can pick another day
    }
    if (res) {
      const label = `Day ${res.dayIndex + 1}`;
      toast.success(res.asHotel ? `Hotel set · ${label}` : `Added to ${label} · ${PHASE_LABEL[res.phase]}`);
    } else {
      toast.error("Couldn't add to plan");
    }
    setPlanFor(null);
  };

  return createPortal(
    <>
      <PlacePickerModal
        plannedSet={plannedSet}
        tabs={PICKER_TABS}
        initialTab={initialTab}
        liveDataByCategory={liveDataByCategory}
        tabLoading={tabLoading}
        fetchTabIfNeeded={prefetchTab}
        isSavedFn={isSavedFn}
        onToggleSave={toggle}
        onPick={({ place, category }) => toggle(place, category)}
        onAddToPlan={(place, category) => setPlanFor({ place, category })}
        onClose={onClose}
        title="Add to saved"
        footerSlot={footerSlot}
      />
      {planFor && (
        <PlanSlotChooser
          placeName={planFor.place.name}
          dayCount={planDayCount}
          isHotel={planFor.category === 'hotels'}
          hotelFullDays={hotelFullDays}
          onCommit={commitPlan}
          onClose={() => setPlanFor(null)}
        />
      )}
    </>,
    document.body
  );
}
