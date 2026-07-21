export interface SavedLogin {
  phone: string
}

export function readSavedLogin(key: string): SavedLogin | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { phone?: string; pin?: string }
    const phone = parsed?.phone?.trim()
    if (!phone) return null
    return { phone }
  } catch {
    /* ignore */
  }
  return null
}

export function writeSavedLogin(key: string, login: SavedLogin) {
  const phone = login.phone.trim()
  if (!phone) {
    clearSavedLogin(key)
    return
  }
  localStorage.setItem(key, JSON.stringify({ phone }))
}

export function clearSavedLogin(key: string) {
  localStorage.removeItem(key)
}

export const RESIDENT_LOGIN_SAVE_KEY = 'mlihrents_resident_login_saved'
export const STAFF_LOGIN_SAVE_KEY = 'mlihrents_staff_login_saved'
