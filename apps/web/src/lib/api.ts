import axios from 'axios'
import { env } from './env'
import { getAccessToken, useAuthStore } from '../stores/authStore'

export const api = axios.create()

api.interceptors.request.use((config) => {
  config.baseURL = env().API_BASE_URL
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = String(error.config?.url ?? '')
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register')
    if (error.response?.status === 401 && !isAuthAttempt) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)
