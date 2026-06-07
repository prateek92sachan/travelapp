import { Compass, Utensils, Leaf, Gem, BedDouble } from 'lucide-react';

export const VIEWPORT_DEBOUNCE_MS = 600;
export const VIEWPORT_MIN_MOVE_KM = 0.5;
export const DENSITY_RADIUS_KM = 3;

// "Search this box" feature
export const BOX_INSET_FRAC = 0.08;     // shrink visible rect ~8% inward
export const BOX_SEARCH_MIN_ZOOM = 11;  // below this, fall back to city-wide text search
export const GRID_CELLS = 4;            // grid-cap declutter: cells x cells
export const BOX_FETCH_LIMIT = 15;      // candidates fetched per category (display caps at 5)

// Colors match the tab icons in PlacesDrawer / TabbedPlacesWidget
export const CATEGORY_CONFIG = {
  activities:  { color: '#f97316', label: 'Activities',  Icon: Compass   },
  restaurants: { color: '#ef4444', label: 'Restaurants', Icon: Utensils  },
  nature:      { color: '#22c55e', label: 'Nature',      Icon: Leaf      },
  gems:        { color: '#6366f1', label: 'Hidden gems', Icon: Gem       },
  hotels:      { color: '#0ea5e9', label: 'Hotels',      Icon: BedDouble },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG);
