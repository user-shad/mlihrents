import { isTradeLicenseConfigured, siteLegal } from '../legal/siteLegal'
import { useLang } from '../context/LangContext'
import LegalLayout from '../components/LegalLayout'

export default function TermsPage() {
  const { lang, tr } = useLang()
  const ar = lang === 'ar'

  return (
    <LegalLayout title={tr('termsOfUse')}>
      <p>
        {ar
          ? `تحكم هذه الشروط استخدامك لموقع وخدمات ${siteLegal.brandName}. باستخدامك للمنصة فإنك توافق على هذه الشروط.`
          : `These terms govern your use of the ${siteLegal.brandName} website and services. By using the platform you agree to these terms.`}
      </p>

      <h2>{ar ? '1. مقدّم الخدمة' : '1. Service provider'}</h2>
      <p>
        {siteLegal.legalName}
        <br />
        {siteLegal.registeredAddress}
        {isTradeLicenseConfigured() && (
          <>
            <br />
            {ar ? 'الرخصة التجارية' : 'Trade license'}: {siteLegal.tradeLicenseNumber}
          </>
        )}
        <br />
        {siteLegal.licensedEmirate}
      </p>

      <h2>{ar ? '2. طبيعة الخدمة' : '2. Nature of the service'}</h2>
      <p>
        {ar
          ? 'توفر مليهرنتس أدوات رقمية لإدارة علاقات السكان والإيجار والصيانة والتواصل. المنصة ليست مكتباً عقارياً مرخّصاً للوساطة إلا إذا حصلت الشركة على الترخيص اللازم في الإمارة المعنية (مثل دائرة الأراضي والأملاك / مؤسسة التنظيم العقاري في دبي). عرض الشقق المتاحة هو لأغراض إعلامية وقد يتطلب استكمال التعاقد خارج المنصة وفق الأنظمة المحلية.'
          : 'MLIHrent provides digital tools for resident relations, rent, maintenance, and communication. The platform is not a licensed real-estate brokerage unless the company holds the required emirate licence (e.g. Dubai Land Department / RERA where applicable). Available apartment listings are informational and contracting may need to be completed in line with local regulations.'}
      </p>

      <h2>{ar ? '3. الحسابات وكلمات المرور' : '3. Accounts and passwords'}</h2>
      <p>
        {ar
          ? 'يُنشئ مدير المبنى حساب الساكن ورقم الهاتف وكلمة مرور من 4 أرقام. أنت مسؤول عن الحفاظ على سرية كلمة المرور. أبلغ الإدارة فوراً عند الاشتباه بأي استخدام غير مصرّح به.'
          : 'Building admins create resident accounts with a phone number and 4-digit password. You must keep your password confidential and notify management immediately of any suspected unauthorised use.'}
      </p>

      <h2>{ar ? '4. المدفوعات' : '4. Payments'}</h2>
      <p>
        {ar
          ? 'عند تفعيل بوابة دفع حقيقية، تتم المعاملات عبر مزوّدين مرخّصين في دولة الإمارات أو وفق ترتيبات البنك المعتمدة. الرسوم والإيجارات والمستحقات تُحدَّد في عقدك. الإيصالات الإلكترونية لا تغني عن المستندات التي يطلبها القانون أو جهة التنظيم العقاري.'
          : 'When a live payment gateway is enabled, transactions run through UAE-licensed providers or approved banking arrangements. Fees and rent amounts are set by your lease. Electronic receipts do not replace documents required by law or the real-estate regulator.'}
      </p>

      <h2>{ar ? '5. الاستخدام المقبول' : '5. Acceptable use'}</h2>
      <ul>
        <li>{ar ? 'عدم إساءة استخدام الدردشة أو رفع محتوى غير قانوني أو مسيء' : 'Do not misuse chat or upload unlawful or abusive content'}</li>
        <li>{ar ? 'عدم محاولة اختراق المنصة أو حسابات الآخرين' : 'Do not attempt to breach the platform or other accounts'}</li>
        <li>{ar ? 'تقديم معلومات صحيحة عن الوحدة والسكان' : 'Provide accurate unit and occupancy information'}</li>
      </ul>

      <h2>{ar ? '6. المحتوى والذكاء الاصطناعي' : '6. Content and AI'}</h2>
      <p>
        {ar
          ? 'المساعد الذكي (مليح) يقدّم معلومات مساعدة وقد يحوّلك لموظف بشري. الردود الآلية قد لا تكون كاملة؛ للحالات الطارئة اتصل بخدمات الطوارئ أو أمن المبنى مباشرة.'
          : 'The AI assistant (MLIH) provides helpful information and may escalate to a human. Automated replies may be incomplete; for emergencies contact emergency services or building security directly.'}
      </p>

      <h2>{ar ? '7. إخلاء المسؤولية' : '7. Disclaimer'}</h2>
      <p>
        {ar
          ? 'تُقدَّم الخدمة «كما هي» ضمن الحدود التي يسمح بها قانون الإمارات. لا نضمن عدم انقطاع الخدمة. المسؤولية تُحدَّد وفق العقد والقانون النافذ.'
          : 'The service is provided “as is” to the extent permitted by UAE law. We do not guarantee uninterrupted service. Liability is limited as allowed by contract and applicable law.'}
      </p>

      <h2>{ar ? '8. القانون والاختصاص' : '8. Governing law and jurisdiction'}</h2>
      <p>
        {ar
          ? `تخضع هذه الشروط لـ${siteLegal.governingLaw}. يُحال أي نزاع إلى ${siteLegal.disputeVenue} ما لم ينص القانون على خلاف ذلك.`
          : `These terms are governed by the ${siteLegal.governingLaw}. Disputes are submitted to the ${siteLegal.disputeVenue}, unless mandatory law provides otherwise.`}
      </p>

      <h2>{ar ? '9. التواصل' : '9. Contact'}</h2>
      <p>
        <a href={`mailto:${siteLegal.contactEmail}`}>{siteLegal.contactEmail}</a>
        <br />
        {siteLegal.phone}
      </p>
    </LegalLayout>
  )
}
