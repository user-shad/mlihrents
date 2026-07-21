import { describe, expect, it } from 'vitest'
import {
  blankResident,
  buildEmptyApartment,
  buildResidentFromListing,
  findVacantUnitForListing,
  isVacantAutoListing,
  listingFromVacantResident,
  mergeAvailableListings,
  normalizeUnitCode,
  type AvailableApartment,
} from './data'

const sampleListing = (overrides: Partial<AvailableApartment> = {}): AvailableApartment => ({
  id: 'list-1',
  building: 'Building A',
  buildingNumber: 'A',
  apartment: 'A5',
  floor: 5,
  bedrooms: 2,
  bathrooms: 2,
  sizeSqm: 100,
  rentMonthly: 8500,
  currency: 'AED',
  availableFrom: 'Now',
  parking: true,
  highlight: 'Bright unit',
  highlightAr: 'وحدة مشرقة',
  ...overrides,
})

describe('listing to apartment helpers', () => {
  it('normalizes unit codes', () => {
    expect(normalizeUnitCode('a-5')).toBe('A5')
    expect(normalizeUnitCode(' B 12 ')).toBe('B12')
  })

  it('finds vacant inventory units by apartment code', () => {
    const vacant = buildEmptyApartment('A', 5)
    const occupied = { ...buildEmptyApartment('A', 6), name: 'Tenant', phone: '0501234567' }
    const found = findVacantUnitForListing(sampleListing(), [vacant, occupied])
    expect(found?.id).toBe(vacant.id)
  })

  it('builds resident fields from a listing', () => {
    const resident = buildResidentFromListing(sampleListing(), buildEmptyApartment('A', 5))
    expect(resident.apartment).toBe('A5')
    expect(resident.rentAmount).toBe(8500)
    expect(resident.parking).toBe('Included')
  })

  it('creates available listings from vacant apartments', () => {
    const vacant = buildEmptyApartment('B', 4)
    const occupied = { ...buildEmptyApartment('A', 6), name: 'Tenant', phone: '0501234567' }
    const auto = listingFromVacantResident(vacant)
    expect(isVacantAutoListing(auto)).toBe(true)
    expect(auto.apartment).toBe('B4')

    const merged = mergeAvailableListings([sampleListing()], [vacant, occupied])
    expect(merged).toHaveLength(2)
    expect(merged.some((item) => item.apartment === 'A5')).toBe(true)
    expect(merged.some((item) => item.apartment === 'B4')).toBe(true)
  })

  it('skips auto listings when a manual listing already exists for the unit', () => {
    const vacant = buildEmptyApartment('A', 5)
    const merged = mergeAvailableListings([sampleListing()], [vacant])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('list-1')
  })

  it('hides auto listings when a hidden manual suppressor exists for the unit', () => {
    const vacant = buildEmptyApartment('A', 3)
    const hidden = sampleListing({
      id: 'hidden-a3',
      apartment: 'A3',
      hidden: true,
    })
    const merged = mergeAvailableListings([hidden], [vacant])
    expect(merged).toHaveLength(0)
  })
})

describe('ensureSeedApartments extras', () => {
  it('preserves custom units beyond fixed inventory', () => {
    const extra = buildResidentFromListing(
      sampleListing({ apartment: 'E9' }),
      { ...blankResident, id: 'apt-extra-1', apartment: 'E9' },
    )
    expect(extra.apartment).toBe('E9')
  })
})
