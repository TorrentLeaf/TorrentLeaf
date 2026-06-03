import { api } from './api'

export interface UserSettings {
  downloadPath: string
  defaultReadingMode: string
  defaultFitMode: string
  readingDirection: string
  autoAddLibrary: boolean
  readerBackground: string
}

export async function fetchSettings(): Promise<UserSettings> {
  const { data } = await api.get<UserSettings>('/settings')
  return data
}

export async function updateSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const { data } = await api.put<UserSettings>('/settings', partial)
  return data
}
