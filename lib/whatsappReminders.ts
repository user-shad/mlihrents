import { sendWhatsAppText } from './whatsappCloud.js'
import {
  buildRentReminderWhatsAppMessage,
  rentReminderLogKey,
  residentsForRentReminder,
  resolveNextDueDateIso,
  wasRentReminderSent,
  type ReminderInvoice,
  type ReminderResident,
} from './rentReminder.js'

export type WhatsAppReminderRun = {
  at: string
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

export type PortalOpsLike = {
  residentList?: ReminderResident[]
  invoiceMap?: Record<string, ReminderInvoice[]>
  whatsappReminderLog?: Record<string, string>
  whatsappReminderLastRun?: WhatsAppReminderRun
}

export type RunRentRemindersOptions = {
  portalUrl: string
  brandName?: string
  daysBefore?: number
  force?: boolean
  today?: Date
}

export type RunRentRemindersResult = {
  run: WhatsAppReminderRun
  ops: PortalOpsLike
}

export async function runRentReminders(
  ops: PortalOpsLike,
  options: RunRentRemindersOptions,
): Promise<RunRentRemindersResult> {
  const {
    portalUrl,
    brandName = 'MLIH Rents',
    daysBefore = 0,
    force = false,
    today = new Date(),
  } = options

  const residents = ops.residentList ?? []
  const invoiceMap = ops.invoiceMap ?? {}
  const log: Record<string, string> = { ...(ops.whatsappReminderLog ?? {}) }
  const dueResidents = residentsForRentReminder(residents, today, daysBefore)

  const run: WhatsAppReminderRun = {
    at: today.toISOString(),
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  for (const resident of dueResidents) {
    if (!force && wasRentReminderSent(resident, log)) {
      run.skipped += 1
      continue
    }

    const phone = resident.phone?.trim() ?? ''
    const dueIso = resolveNextDueDateIso(resident)
    if (!phone || !dueIso) {
      run.skipped += 1
      continue
    }

    const invoices = invoiceMap[resident.id] ?? []
    const message = buildRentReminderWhatsAppMessage(
      resident,
      portalUrl,
      brandName,
      invoices,
    )

    const result = await sendWhatsAppText(phone, message)
    if (result.ok) {
      log[rentReminderLogKey(resident.id, dueIso)] = run.at
      run.sent += 1
    } else {
      run.failed += 1
      run.errors.push(`${unitLabel(resident)}: ${result.error ?? 'send_failed'}`)
    }
  }

  return {
    run,
    ops: {
      ...ops,
      whatsappReminderLog: log,
      whatsappReminderLastRun: run,
    },
  }
}

function unitLabel(resident: ReminderResident): string {
  return resident.apartment?.trim() || resident.id
}
