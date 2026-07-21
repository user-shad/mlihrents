import { describe, expect, it } from 'vitest'
import type { Session } from '../context/AuthContext'
import { isBuildingAdmin, staffCan } from './staffPermissions'

const buildingAdmin: Session = {
  role: 'admin',
  phone: '0553262626',
  name: 'Building Admin',
  staffTier: 'admin',
}

const operationsManager: Session = {
  role: 'admin',
  phone: '0505001021',
  name: 'Operations Manager',
  staffTier: 'staff',
}

const resident: Session = {
  role: 'resident',
  phone: '0501234567',
  name: 'Resident',
  residentId: 'r1',
}

describe('staffPermissions', () => {
  it('identifies building admin vs operations staff', () => {
    expect(isBuildingAdmin(buildingAdmin)).toBe(true)
    expect(isBuildingAdmin(operationsManager)).toBe(false)
    expect(isBuildingAdmin(resident)).toBe(false)
    expect(isBuildingAdmin(null)).toBe(false)
  })

  it('grants restricted capabilities only to building admin', () => {
    const caps = [
      'bank_settings',
      'clear_apartment',
      'delete_payment',
      'manage_listings',
      'manage_apartments',
    ] as const
    for (const cap of caps) {
      expect(staffCan(buildingAdmin, cap)).toBe(true)
      expect(staffCan(operationsManager, cap)).toBe(false)
      expect(staffCan(resident, cap)).toBe(false)
      expect(staffCan(null, cap)).toBe(false)
    }
  })
})
