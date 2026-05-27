import { Compass, Utensils, Leaf, Gem, BedDouble } from 'lucide-react';

export const VIEWPORT_DEBOUNCE_MS = 600;
export const VIEWPORT_MIN_MOVE_KM = 0.5;
export const DENSITY_RADIUS_KM = 3;

// Colors match the tab icons in PlacesDrawer / TabbedPlacesWidget
export const CATEGORY_CONFIG = {
  activities:  { color: '#f97316', label: 'Activities',  Icon: Compass   },
  restaurants: { color: '#ef4444', label: 'Restaurants', Icon: Utensils  },
  nature:      { color: '#22c55e', label: 'Nature',      Icon: Leaf      },
  gems:        { color: '#6366f1', label: 'Hidden gems', Icon: Gem       },
  hotels:      { color: '#0ea5e9', label: 'Hotels',      Icon: BedDouble },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG);
