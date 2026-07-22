export type ReminderResident = {
  id: string
  name?: string
  phone?: string
  apartment?: string
  buildingNumber?: string
  contractTotal?: number
  amountPaid?: number
  rentAmount?: number
  nextDueDateIso?: string
  leaseStart?: string
  rentDueDay?: number
  rentSchedule?: number | string
}

export type ReminderInvoice = {
  id: string
  period?: string
  dueDateIso?: string
  status?: string
}

function isValidIsoDate(iso?: string): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T12:00:00`)
  return !Number.isNaN(d.getTime())
}

function remainingBalance(resident: ReminderResident): number {
  const total = Math.max(0, Number(resident.contractTotal) || 0)
  const paid = Math.max(0, Number(resident.amountPaid) || 0)
  return Math.max(0, total - paid)
}

function hasRentPlan(resident: ReminderResident): boolean {
  return (Number(resident.contractTotal) || 0) > 0 && (Number(resident.rentAmount) || 0) > 0
}

function isOccupied(resident: ReminderResident): boolean {
  return Boolean(resident.name?.trim() || resident.phone?.trim())
}

export function unitCodeLabel(resident: ReminderResident): string {
  const apt = resident.apartment?.trim()
  if (apt) return apt.replace(/\s+/g, '')
  return resident.id
}

export function resolveNextDueDateIso(resident: ReminderResident): string {
  if (isValidIsoDate(resident.nextDueDateIso)) return resident.nextDueDateIso!
  return ''
}

export function rentReminderLogKey(residentId: string, dueDateIso: string): string {
  return `${residentId}:${dueDateIso.slice(0, 7)}`
}

/** True when a rent reminder should be sent (on or after due date, within 30 days overdue). */
export function isRentReminderDue(
  resident: ReminderResident,
  today = new Date(),
  daysBefore = 0,
): boolean {
  if (!resident.phone?.trim()) return false
  if (!isOccupied(resident) || !hasRentPlan(resident)) return false
  if (remainingBalance(resident) <= 0) return false

  const dueIso = resolveNextDueDateIso(resident)
  if (!dueIso) return false

  const due = new Date(`${dueIso}T12:00:00`)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const remindFrom = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  remindFrom.setDate(remindFrom.getDate() - daysBefore)
  const overdueUntil = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  overdueUntil.setDate(overdueUntil.getDate() + 30)

  return todayStart >= remindFrom && todayStart <= overdueUntil
}

export function residentsForRentReminder(
  residents: ReminderResident[],
  today = new Date(),
  daysBefore = 0,
): ReminderResident[] {
  return residents.filter((resident) => isRentReminderDue(resident, today, daysBefore))
}

export function wasRentReminderSent(
  resident: ReminderResident,
  log: Record<string, string> | undefined,
): boolean {
  const dueIso = resolveNextDueDateIso(resident)
  if (!dueIso || !log) return false
  return Boolean(log[rentReminderLogKey(resident.id, dueIso)])
}

export function buildRentReminderWhatsAppMessage(
  resident: ReminderResident,
  portalUrl: string,
  brandName = 'MLIH Rents',
  invoices: ReminderInvoice[] = [],
): string {
  const name = resident.name?.trim() || 'Resident'
  const unit = unitCodeLabel(resident)
  const dueIso = resolveNextDueDateIso(resident)
  const dueLabel = dueIso
    ? new Date(`${dueIso}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''

  const open = invoices.find((inv) => inv.status === 'overdue' || inv.status === 'due')
  const invoiceLineEn = open?.period
    ? `Invoice ${open.period}${dueLabel ? ` · due ${dueLabel}` : ''}.`
    : dueLabel
      ? `Next payment due ${dueLabel}.`
      : ''

  const en = `Hello ${name},\n\nThis is a rent reminder from ${brandName} for unit ${unit}.\n${invoiceLineEn ? `\n${invoiceLineEn}\n` : '\n'}\nPay via the resident portal:\n${portalUrl}\n\nThank you.`

  const nameAr = resident.name?.trim() || 'الساكن'
  const invoiceLineAr = open?.period
    ? `فاتورة ${open.period}${dueLabel ? ` · مستحق ${dueLabel}` : ''}.`
    : dueLabel
      ? `الدفعة القادمة مستحقة ${dueLabel}.`
      : ''

  const ar = `مرحباً ${nameAr}،\n\nتذكير من ${brandName} بخصوص الوحدة ${unit}.\n${invoiceLineAr ? `\n${invoiceLineAr}\n` : '\n'}\nادفع عبر بوابة السكان:\n${portalUrl}\n\nشكراً لكم.`

  return `${en}\n\n———\n\n${ar}`
}
