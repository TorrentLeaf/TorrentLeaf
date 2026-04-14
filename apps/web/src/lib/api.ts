import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/auth'

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
  timeout: 15_000,
  withCredentials: false,
})

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    cfg.headers = cfg.headers ?? {}
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

let refreshPromise: Promise<string | null> | null = null

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined

    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true
    refreshPromise ??= refreshToken()
    const newToken = await refreshPromise
    refreshPromise = null

    if (!newToken) {
      useAuthStore.getState().clear()
      return Promise.reject(error)
    }

    original.headers = original.headers ?? {}
    original.headers.Authorization = `Bearer ${newToken}`
    return api(original)
  },
)

async function refreshToken(): Promise<string | null> {
  const refresh = useAuthStore.getState().refreshToken
  if (!refresh) return null

  try {
    const { data } = await axios.post<{ accessToken: string }>(
      `${baseURL}/api/v1/auth/refresh`,
      { refreshToken: refresh },
    )
    useAuthStore.getState().setTokens(data.accessToken, refresh)
    return data.accessToken
  } catch {
    return null
  }
}
