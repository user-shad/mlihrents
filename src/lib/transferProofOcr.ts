import Tesseract from 'tesseract.js'
import { amountsMatch, formatMoney, normalizeBankReference, type PaymentRecord } from '../data'

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
  const refToken = '[A-Z0-9]{6,15}'

  const labeledPatterns = [
    new RegExp(`reference\\s*number[:\\s]*(${refToken})`, 'gi'),
    new RegExp(`reference\\s*no\\.?[:\\s]*(${refToken})`, 'gi'),
    new RegExp(`ref(?:erence)?[:\\s#-]*(${refToken})`, 'gi'),
    new RegExp(`رقم\\s*المرجع[:\\s]*(${refToken})`, 'gi'),
  ]
  for (const pattern of labeledPatterns) {
    const match = pattern.exec(compact)
    if (match?.[1]) return match[1].toUpperCase()
  }

  const lines = compact.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/reference|ref\s*no|رقم\s*المرجع/i.test(line)) {
      const inline = line.match(new RegExp(`(${refToken})`, 'i'))
      if (inline) return inline[1].toUpperCase()
      const next = lines[i + 1]
      if (next) {
        const token = next.match(new RegExp(`^(${refToken})$`, 'i'))
        if (token) return token[1].toUpperCase()
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

/** Compare bank reference values (letters and/or numbers). */
export function bankRefsMatch(given: string | null, inScreenshot: string | null): boolean | null {
  if (!given || !inScreenshot) return null
  const a = normalizeBankReference(given)
  const b = normalizeBankReference(inScreenshot)
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
  const expectedRef = (givenBankRef ?? payment.bankReference)?.trim() || null
  const screenshotRef = ocr.extractedBankRef
  const refMatch = bankRefsMatch(expectedRef, screenshotRef)

  const lines: string[] = []
  lines.push(ar ? '📷 فحص رقم المرجع في اللقطة' : '📷 Reference check (screenshot)')
  lines.push(
    ar
      ? `${payment.residentName} · ${payment.unit} · ${formatMoney(payment.amount)}`
      : `${payment.residentName} · ${payment.unit} · ${formatMoney(payment.amount)}`,
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

  if (screenshotRef) {
    lines.push(
      ar
        ? `✅ رقم المرجع موجود في اللقطة: ${screenshotRef}`
        : `✅ Reference found in screenshot: ${screenshotRef}`,
    )
  } else {
    lines.push(
      ar
        ? '❌ رقم المرجع غير موجود في اللقطة — تأكد أن حقل Reference number ظاهر.'
        : '❌ Reference not found in screenshot — ensure the bank “Reference number” field is visible.',
    )
  }

  if (expectedRef) {
    lines.push(
      ar ? `المرجع المُدخل من الساكن: ${expectedRef}` : `Reference submitted by resident: ${expectedRef}`,
    )
    lines.push('')
    if (screenshotRef && refMatch === true) {
      lines.push(
        ar
          ? '✅ متطابق — رقم المرجع في اللقطة يطابق ما أدخله الساكن.'
          : '✅ Match — the screenshot reference matches what the resident submitted.',
      )
    } else if (screenshotRef && refMatch === false) {
      lines.push(
        ar
          ? '❌ غير متطابق — رقم المرجع في اللقطة لا يطابق ما أدخله الساكن. لا تؤكد الدفعة.'
          : '❌ Mismatch — the screenshot reference does not match what the resident submitted. Do not approve.',
      )
    } else if (!screenshotRef) {
      lines.push(
        ar
          ? '⚠️ لا يمكن التأكيد — المرجع المُدخل غير ظاهر في اللقطة.'
          : '⚠️ Cannot verify — the submitted reference is not visible in the screenshot.',
      )
    }
  } else if (screenshotRef) {
    lines.push('')
    lines.push(
      ar
        ? 'ℹ️ لم يُدخل الساكن رقم مرجع — راجع يدوياً أو قارن مع كشف الحساب.'
        : 'ℹ️ Resident did not enter a reference — review manually or compare with your bank statement.',
    )
  }

  if (ocr.extractedInvoiceRef) {
    const invOk = invoiceRefsMatch(payment.invoiceId, ocr.extractedInvoiceRef)
    lines.push('')
    lines.push(
      ar
        ? `مرجع الفاتورة في الوصف: ${ocr.extractedInvoiceRef}`
        : `Invoice ref in transfer description: ${ocr.extractedInvoiceRef}`,
    )
    if (invOk === true) {
      lines.push(ar ? '✓ يطابق رقم الفاتورة المتوقع' : '✓ Matches expected invoice number')
    } else if (invOk === false) {
      lines.push(ar ? '⚠️ لا يطابق رقم الفاتورة المتوقع' : '⚠️ Does not match expected invoice number')
    }
  }

  return lines.join('\n')
}

/** OCR a pending payment screenshot and summarize whether the bank reference is present. */
export async function analyzePaymentReference(
  payment: PaymentRecord,
  lang: 'en' | 'ar',
): Promise<string> {
  if (!payment.transferProof?.dataUrl) {
    return lang === 'ar' ? '⚠️ لا توجد لقطة تحويل مرفقة.' : '⚠️ No transfer screenshot attached.'
  }
  const ocr = await recognizeTransferProof(payment.transferProof.dataUrl, payment.amount)
  return formatScreenshotAnalysis(ocr, payment, lang, payment.bankReference ?? null)
}
