import { useQuery } from '@tanstack/react-query';
import { useSearchStore } from '../../stores/searchStore';
import { fetchWeather, fetchLastYearWeather } from '../../services/weather';

export const weatherKey = (target) =>
  ['weather', target?.lat, target?.lng, target?.dateISO];

export const lastYearWeatherKey = (target) =>
  ['weather', 'lastYear', target?.lat, target?.lng, target?.dateISO];

export function useCurrentWeather() {
  const target = useSearchStore((s) => s.weatherTarget);
  return useQuery({
    queryKey: weatherKey(target),
    queryFn: () => fetchWeather(target),
    enabled: !!target && Number.isFinite(target.lat) && Number.isFinite(target.lng)
  });
}

export function useLastYearWeather() {
  const target = useSearchStore((s) => s.weatherTarget);
  return useQuery({
    queryKey: lastYearWeatherKey(target),
    queryFn: () => fetchLastYearWeather(target),
    enabled: !!target && Number.isFinite(target.lat) && Number.isFinite(target.lng)
  });
}
