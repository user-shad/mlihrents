import Tesseract from 'tesseract.js'
import { amountsMatch, formatMoney, type PaymentRecord } from '../data'

export interface ScreenshotOcrResult {
  rawText: string
  /** Bank "Reference number" field (e.g. Wio 1422869093). */
  extractedBankRef: string | null
  /** Invoice-style reference if present in description (INV-…). */
  extractedInvoiceRef: string | null
  extractedAmount: number | null
}

/** Normalize OCR misreads for invoice reference comparison. */
export function normalizeRefForCompare(ref: string) {
  return ref
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[—–_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^INV[^A-Z0-9]/i, 'INV-')
}

function parseAmountToken(token: string): number | null {
  const n = Number(token.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0.01 || n > 10_000_000) return null
  return n
}

function extractBankReferenceFromOcr(text: string): string | null {
  const compact = text.replace(/\r/g, '\n')

  const labeledPatterns = [
    /reference\s*number[:\s]*(\d{6,15})/gi,
    /reference\s*no\.?[:\s]*(\d{6,15})/gi,
    /ref(?:erence)?[:\s#-]*(\d{6,15})/gi,
    /رقم\s*المرجع[:\s]*(\d{6,15})/gi,
  ]
  for (const pattern of labeledPatterns) {
    const match = pattern.exec(compact)
    if (match?.[1]) return match[1]
  }

  const lines = compact.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/reference|ref\s*no|رقم\s*المرجع/i.test(line)) {
      const inline = line.match(/(\d{6,15})/)
      if (inline) return inline[1]
      const next = lines[i + 1]
      if (next) {
        const digits = next.match(/^(\d{6,15})$/)
        if (digits) return digits[1]
      }
    }
  }

  return null
}

function extractInvoiceRefFromOcr(text: string): string | null {
  const invPatterns = [/\b(INV[-\s][A-Z0-9-]+)\b/gi, /\b(I[Nl1][VW][-\s][A-Z0-9-]+)\b/gi]
  for (const pattern of invPatterns) {
    const matches = text.match(pattern)
    if (matches?.length) {
      return normalizeRefForCompare(matches[0].replace(/\s+/g, '-'))
    }
  }
  return null
}

/** Pull bank reference number and amount from a transfer screenshot. */
export function parseTransferScreenshotText(text: string, expectedAmount?: number): ScreenshotOcrResult {
  const compact = text.replace(/\r/g, '\n')
  const extractedBankRef = extractBankReferenceFromOcr(compact)
  const extractedInvoiceRef = extractInvoiceRefFromOcr(compact)

  const amounts: number[] = []
  const amountPatterns = [
    /[-+]?\s*[ÐDĐ]?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /AED\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*AED/gi,
    /(?:amount|total|transfer|paid|debit|credit|sent|value)[:\s]*([-+]?\s*[\d,]+(?:\.\d{1,2})?)/gi,
    /(?:مبلغ|درهم)\s*[:]?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ]
  for (const pattern of amountPatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(compact)) !== null) {
      const raw = match[1].replace(/[^\d.,]/g, '')
      const n = parseAmountToken(raw)
      if (n != null) amounts.push(Math.abs(n))
    }
  }

  const unique = [...new Set(amounts)]
  let extractedAmount: number | null = null
  if (unique.length === 1) {
    extractedAmount = unique[0]
  } else if (unique.length > 1) {
    if (expectedAmount != null) {
      const exact = unique.find((a) => amountsMatch(a, expectedAmount))
      extractedAmount =
        exact ??
        unique.sort((a, b) => Math.abs(a - expectedAmount) - Math.abs(b - expectedAmount))[0] ??
        null
    } else {
      extractedAmount = unique.sort((a, b) => b - a)[0] ?? null
    }
  }

  return {
    rawText: compact.trim(),
    extractedBankRef,
    extractedInvoiceRef,
    extractedAmount,
  }
}

/** Compare bank reference numbers (digits only). */
export function bankRefsMatch(given: string | null, inScreenshot: string | null): boolean | null {
  if (!given || !inScreenshot) return null
  const clean = (s: string) => s.replace(/\D/g, '')
  const a = clean(given)
  const b = clean(inScreenshot)
  if (!a || !b) return null
  return a === b
}

export function invoiceRefsMatch(given: string | null, inScreenshot: string | null): boolean | null {
  if (!given || !inScreenshot) return null
  const e = normalizeRefForCompare(given)
  const x = normalizeRefForCompare(inScreenshot)
  if (e === x) return true
  const clean = (s: string) => s.replace(/[^A-Z0-9]/g, '')
  return clean(e) === clean(x)
}

let ocrWorker: Tesseract.Worker | null = null

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker('eng+ara', 1, {
      logger: () => {},
    })
  }
  return ocrWorker
}

/** Run OCR on a resident transfer proof image (data URL). */
export async function recognizeTransferProof(
  dataUrl: string,
  expectedAmount?: number,
): Promise<ScreenshotOcrResult> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(dataUrl)
  return parseTransferScreenshotText(data.text, expectedAmount)
}

export function formatScreenshotAnalysis(
  ocr: ScreenshotOcrResult,
  payment: PaymentRecord,
  lang: 'en' | 'ar',
  givenBankRef?: string | null,
): string {
  const ar = lang === 'ar'
  const screenshotRef = ocr.extractedBankRef
  const refMatch = bankRefsMatch(givenBankRef ?? null, screenshotRef)

  const lines: string[] = []
  lines.push(ar ? '📷 مقارنة رقم المرجع في اللقطة' : '📷 Reference comparison (screenshot)')
  lines.push(
    ar
      ? `${payment.residentName} · ${payment.invoiceId} · ${formatMoney(payment.amount)}`
      : `${payment.residentName} · ${payment.invoiceId} · ${formatMoney(payment.amount)}`,
  )
  lines.push('')

  if (!ocr.rawText) {
    lines.push(
      ar
        ? '⚠️ لم أستطع قراءة نص من الصورة — تأكد أن اللقطة واضحة.'
        : '⚠️ Could not read text from the screenshot — ensure the image is clear.',
    )
    return lines.join('\n')
  }

  if (givenBankRef) {
    lines.push(
      ar ? `المرجع الذي أدخلته: ${givenBankRef}` : `Reference you provided: ${givenBankRef}`,
    )
  }

  if (screenshotRef) {
    lines.push(
      ar ? `رقم المرجع في اللقطة: ${screenshotRef}` : `Reference number in screenshot: ${screenshotRef}`,
    )
  } else {
    lines.push(
      ar
        ? '⚠️ لم أجد حقل «Reference number» في اللقطة — تأكد أن اللقطة تظهر رقم المرجع البنكي.'
        : '⚠️ Could not find “Reference number” in the screenshot — ensure the bank reference field is visible.',
    )
  }

  lines.push('')

  if (givenBankRef && refMatch === true) {
    lines.push(
      ar
        ? '✅ المرجع متطابق — رقم المرجع في اللقطة يطابق ما أدخلته.'
        : '✅ Reference matches — the screenshot reference number matches what you provided.',
    )
  } else if (givenBankRef && refMatch === false) {
    lines.push(
      ar
        ? '❌ المرجع غير متطابق — رقم المرجع في اللقطة لا يطابق ما أدخلته. لا تؤكد الدفعة.'
        : '❌ Reference mismatch — the screenshot reference does not match what you provided. Do not confirm this payment.',
    )
  } else if (givenBankRef && refMatch === null) {
    lines.push(
      ar
        ? '⚠️ تعذرت المقارنة — راجع رقم المرجع يدوياً في اللقطة.'
        : '⚠️ Could not compare — check the reference number manually in the screenshot.',
    )
  } else if (screenshotRef) {
    lines.push(
      ar
        ? 'ℹ️ أدخل رقم المرجع من كشف الحساب للمقارنة، مثل: «قارن المرجع 1422869093»'
        : 'ℹ️ Enter the reference from your bank statement to compare, e.g. “Compare reference 1422869093”',
    )
  }

  if (ocr.extractedInvoiceRef) {
    const invOk = invoiceRefsMatch(payment.invoiceId, ocr.extractedInvoiceRef)
    lines.push('')
    lines.push(
      ar
        ? `مرجع الفاتورة في الوصف: ${ocr.extractedInvoiceRef}`
        : `Invoice ref in description: ${ocr.extractedInvoiceRef}`,
    )
    if (invOk === true) {
      lines.push(ar ? '✓ يطابق رقم الفاتورة المتوقع' : '✓ Matches expected invoice number')
    } else if (invOk === false) {
      lines.push(ar ? '⚠️ لا يطابق رقم الفاتورة المتوقع' : '⚠️ Does not match expected invoice number')
    }
  }

  return lines.join('\n')
}
