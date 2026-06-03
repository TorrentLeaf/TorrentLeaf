import { useQuery } from '@tanstack/react-query'
import { fetchSettings, type UserSettings } from '@/lib/settings'

const DEFAULTS: UserSettings = {
  downloadPath: '/data/torrents',
  defaultReadingMode: 'paginated',
  defaultFitMode: 'fit-width',
  readingDirection: 'ltr',
  autoAddLibrary: true,
  readerBackground: '#000000',
}

/**
 * Fetches user settings from the API with sensible defaults.
 * Reader components use this to initialize their state with
 * the user's saved preferences instead of hardcoded values.
 */
export function useUserSettings() {
  const { data, isLoading } = useQuery<UserSettings>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000, // cache for 5 min
  })

  return {
    settings: data ?? DEFAULTS,
    isLoading,
  }
}
