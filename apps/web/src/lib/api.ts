import axios from 'axios'
import { env } from './env'
import { getAccessToken, useAuthStore } from '../stores/authStore'

export const api = axios.create({
  baseURL: env().API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)
