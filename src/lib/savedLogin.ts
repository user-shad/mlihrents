export interface SavedLogin {
  phone: string
  pin: string
}

export function readSavedLogin(key: string): SavedLogin | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedLogin
    if (parsed?.phone?.trim()) {
      return { phone: parsed.phone, pin: parsed.pin ?? '' }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function writeSavedLogin(key: string, login: SavedLogin) {
  localStorage.setItem(key, JSON.stringify(login))
}

export function clearSavedLogin(key: string) {
  localStorage.removeItem(key)
}

export const RESIDENT_LOGIN_SAVE_KEY = 'mlihrents_resident_login_saved'
export const STAFF_LOGIN_SAVE_KEY = 'mlihrents_staff_login_saved'
