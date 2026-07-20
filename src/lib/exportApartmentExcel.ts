import type { Invoice, PaymentRecord, Resident, Ticket } from '../data'
import { remainingBalance, rentScheduleLabel, unitCodeLabel } from '../data'
import type { Lang } from '../i18n'

function xmlEscape(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | number | null | undefined, type: 'String' | 'Number' = 'String') {
  if (type === 'Number' && (value === '' || value == null || Number.isNaN(Number(value)))) {
    return `<Cell><Data ss:Type="String"></Data></Cell>`
  }
  const t = type === 'Number' ? 'Number' : 'String'
  const v = type === 'Number' ? Number(value) : xmlEscape(value)
  return `<Cell><Data ss:Type="${t}">${v}</Data></Cell>`
}

function row(values: Array<{ v: string | number | null | undefined; t?: 'String' | 'Number' }>) {
  return `<Row>${values.map((c) => cell(c.v, c.t ?? 'String')).join('')}</Row>`
}

function sheet(name: string, rowsXml: string) {
  const safe = name.replace(/[\\/*?:\[\]]/g, '-').slice(0, 31)
  return `<Worksheet ss:Name="${xmlEscape(safe)}"><Table>${rowsXml}</Table></Worksheet>`
}

function workbook(sheetsXml: string) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheetsXml}
</Workbook>`
}

function downloadExcel(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function stamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

export type ApartmentExportBundle = {
  resident: Resident
  invoices: Invoice[]
  payments: PaymentRecord[]
  tickets: Ticket[]
}

function apartmentSheets(bundle: ApartmentExportBundle, lang: Lang, exportedAt: string) {
  const { resident: r, invoices, payments, tickets } = bundle
  const unit = unitCodeLabel(r)

  const summary = sheet(
    'Summary',
    [
      row([{ v: 'Exported at' }, { v: exportedAt }]),
      row([{ v: 'Unit' }, { v: unit }]),
      row([{ v: 'Building' }, { v: r.building }]),
      row([{ v: 'Apartment' }, { v: r.apartment }]),
      row([{ v: 'Resident name' }, { v: r.name }]),
      row([{ v: 'Phone' }, { v: r.phone }]),
      row([{ v: 'Email' }, { v: r.email ?? '' }]),
      row([{ v: 'Login PIN' }, { v: r.pin }]),
      row([{ v: 'Parking' }, { v: r.parking }]),
      row([{ v: 'Occupants' }, { v: r.occupants ?? '', t: 'Number' }]),
      row([{ v: 'Move in' }, { v: r.moveIn ?? '' }]),
      row([{ v: 'Lease end' }, { v: r.leaseEnd }]),
      row([{ v: 'Status' }, { v: r.status ?? '' }]),
      row([{ v: 'Rent schedule' }, { v: rentScheduleLabel(r.rentSchedule, lang) }]),
      row([{ v: 'Rent due day' }, { v: r.rentDueDay, t: 'Number' }]),
      row([{ v: 'Installment' }, { v: r.rentAmount, t: 'Number' }]),
      row([{ v: 'Contract total' }, { v: r.contractTotal, t: 'Number' }]),
      row([{ v: 'Amount paid' }, { v: r.amountPaid, t: 'Number' }]),
      row([{ v: 'Amount remaining' }, { v: remainingBalance(r), t: 'Number' }]),
      row([{ v: 'Currency' }, { v: r.currency }]),
    ].join(''),
  )

  const invoiceRows = [
    row([
      { v: 'Invoice ID' },
      { v: 'Period' },
      { v: 'Amount' },
      { v: 'Due date' },
      { v: 'Status' },
      { v: 'Extension days' },
    ]),
    ...(invoices.length
      ? invoices.map((inv) =>
          row([
            { v: inv.id },
            { v: inv.period },
            { v: inv.amount, t: 'Number' },
            { v: inv.dueDate },
            { v: inv.status },
            { v: inv.extensionDays ?? 0, t: 'Number' },
          ]),
        )
      : [row([{ v: '(none)' }])]),
  ]

  const paymentRows = [
    row([
      { v: 'Payment ID' },
      { v: 'Invoice ID' },
      { v: 'Amount' },
      { v: 'Confirmed amount' },
      { v: 'Method' },
      { v: 'Status' },
      { v: 'Paid at' },
      { v: 'Destination' },
      { v: 'Review note' },
      { v: 'Has screenshot' },
    ]),
    ...(payments.length
      ? payments.map((p) =>
          row([
            { v: p.id },
            { v: p.invoiceId },
            { v: p.amount, t: 'Number' },
            { v: p.confirmedAmount ?? '', t: p.confirmedAmount != null ? 'Number' : 'String' },
            { v: p.method },
            { v: p.status },
            { v: p.paidAt },
            { v: p.destination },
            { v: p.reviewNote ?? '' },
            { v: p.transferProof ? 'yes' : 'no' },
          ]),
        )
      : [row([{ v: '(none)' }])]),
  ]

  const ticketRows = [
    row([
      { v: 'Ticket ID' },
      { v: 'Title' },
      { v: 'Category' },
      { v: 'Status' },
      { v: 'Created' },
      { v: 'Note' },
    ]),
    ...(tickets.length
      ? tickets.map((t) =>
          row([
            { v: t.id },
            { v: t.title },
            { v: t.category },
            { v: t.status },
            { v: t.created },
            { v: t.note },
          ]),
        )
      : [row([{ v: '(none)' }])]),
  ]

  return [
    summary,
    sheet('Invoices', invoiceRows.join('')),
    sheet('Payments', paymentRows.join('')),
    sheet('Tickets', ticketRows.join('')),
  ].join('')
}

/** Excel file for one apartment (summary, invoices, payments, tickets). */
export function exportApartmentExcel(bundle: ApartmentExportBundle, lang: Lang = 'en') {
  const unit = unitCodeLabel(bundle.resident) || bundle.resident.id || 'apartment'
  const exportedAt = new Date().toISOString()
  downloadExcel(workbook(apartmentSheets(bundle, lang, exportedAt)), `MLIHrent-${unit}-${stamp()}.xls`)
}

/** Excel workbook covering every apartment. */
export function exportAllApartmentsExcel(bundles: ApartmentExportBundle[], lang: Lang = 'en') {
  const indexSheet = sheet(
    'Index',
    [
      row([
        { v: 'Unit' },
        { v: 'Resident' },
        { v: 'Phone' },
        { v: 'Contract total' },
        { v: 'Amount paid' },
        { v: 'Remaining' },
        { v: 'Invoices' },
        { v: 'Payments' },
        { v: 'Tickets' },
      ]),
      ...bundles.map((b) =>
        row([
          { v: unitCodeLabel(b.resident) },
          { v: b.resident.name },
          { v: b.resident.phone },
          { v: b.resident.contractTotal, t: 'Number' },
          { v: b.resident.amountPaid, t: 'Number' },
          { v: remainingBalance(b.resident), t: 'Number' },
          { v: b.invoices.length, t: 'Number' },
          { v: b.payments.length, t: 'Number' },
          { v: b.tickets.length, t: 'Number' },
        ]),
      ),
    ].join(''),
  )

  const residentsSheet = sheet(
    'Residents',
    [
      row([
        { v: 'Unit' },
        { v: 'Building' },
        { v: 'Apartment' },
        { v: 'Name' },
        { v: 'Phone' },
        { v: 'Email' },
        { v: 'PIN' },
        { v: 'Schedule' },
        { v: 'Due day' },
        { v: 'Installment' },
        { v: 'Contract' },
        { v: 'Paid' },
        { v: 'Remaining' },
        { v: 'Lease end' },
        { v: 'Status' },
      ]),
      ...bundles.map(({ resident: r }) =>
        row([
          { v: unitCodeLabel(r) },
          { v: r.building },
          { v: r.apartment },
          { v: r.name },
          { v: r.phone },
          { v: r.email ?? '' },
          { v: r.pin },
          { v: rentScheduleLabel(r.rentSchedule, lang) },
          { v: r.rentDueDay, t: 'Number' },
          { v: r.rentAmount, t: 'Number' },
          { v: r.contractTotal, t: 'Number' },
          { v: r.amountPaid, t: 'Number' },
          { v: remainingBalance(r), t: 'Number' },
          { v: r.leaseEnd },
          { v: r.status ?? '' },
        ]),
      ),
    ].join(''),
  )

  const allInvoices = sheet(
    'Invoices',
    [
      row([
        { v: 'Unit' },
        { v: 'Resident' },
        { v: 'Invoice ID' },
        { v: 'Period' },
        { v: 'Amount' },
        { v: 'Due date' },
        { v: 'Status' },
      ]),
      ...bundles.flatMap(({ resident: r, invoices }) =>
        invoices.map((inv) =>
          row([
            { v: unitCodeLabel(r) },
            { v: r.name },
            { v: inv.id },
            { v: inv.period },
            { v: inv.amount, t: 'Number' },
            { v: inv.dueDate },
            { v: inv.status },
          ]),
        ),
      ),
    ].join(''),
  )

  const allPayments = sheet(
    'Payments',
    [
      row([
        { v: 'Unit' },
        { v: 'Resident' },
        { v: 'Payment ID' },
        { v: 'Invoice ID' },
        { v: 'Amount' },
        { v: 'Confirmed' },
        { v: 'Status' },
        { v: 'Paid at' },
        { v: 'Note' },
        { v: 'Screenshot' },
      ]),
      ...bundles.flatMap(({ resident: r, payments }) =>
        payments.map((p) =>
          row([
            { v: unitCodeLabel(r) },
            { v: r.name || p.residentName },
            { v: p.id },
            { v: p.invoiceId },
            { v: p.amount, t: 'Number' },
            { v: p.confirmedAmount ?? '', t: p.confirmedAmount != null ? 'Number' : 'String' },
            { v: p.status },
            { v: p.paidAt },
            { v: p.reviewNote ?? '' },
            { v: p.transferProof ? 'yes' : 'no' },
          ]),
        ),
      ),
    ].join(''),
  )

  const allTickets = sheet(
    'Tickets',
    [
      row([
        { v: 'Unit' },
        { v: 'Resident' },
        { v: 'Ticket ID' },
        { v: 'Title' },
        { v: 'Category' },
        { v: 'Status' },
        { v: 'Created' },
        { v: 'Note' },
      ]),
      ...bundles.flatMap(({ resident: r, tickets }) =>
        tickets.map((t) =>
          row([
            { v: unitCodeLabel(r) },
            { v: r.name },
            { v: t.id },
            { v: t.title },
            { v: t.category },
            { v: t.status },
            { v: t.created },
            { v: t.note },
          ]),
        ),
      ),
    ].join(''),
  )

  downloadExcel(
    workbook([indexSheet, residentsSheet, allInvoices, allPayments, allTickets].join('')),
    `MLIHrent-all-apartments-${stamp()}.xls`,
  )
}
