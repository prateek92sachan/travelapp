import { useQuery } from '@tanstack/react-query';
import { useSearchStore } from '../../stores/searchStore';
import { fetchAnnualEvents } from '../../services/events';

export const eventsKey = ({ destination, dateISO }) => [
  'events',
  destination,
  dateISO
];

export function useEvents() {
  const destination = useSearchStore((s) => s.destination);
  const date = useSearchStore((s) => s.date);
  const coords = useSearchStore((s) => s.coords);
  const enabled = !!destination && !!date && !!coords;
  return useQuery({
    queryKey: eventsKey({ destination, dateISO: date }),
    queryFn: () => fetchAnnualEvents(destination, date),
    enabled,
    staleTime: 60 * 60 * 1000 // 1h — events change slowly
  });
}
