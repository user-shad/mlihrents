import { siteLegal } from '../legal/siteLegal'
import { useLang } from '../context/LangContext'
import LegalLayout from '../components/LegalLayout'

export default function PrivacyPage() {
  const { lang, tr } = useLang()
  const ar = lang === 'ar'

  return (
    <LegalLayout title={tr('privacyPolicy')}>
      <p>
        {ar
          ? `تحترم ${siteLegal.brandName} خصوصيتك. توضح هذه السياسة كيفية جمع البيانات الشخصية واستخدامها وحمايتها عند استخدام منصتنا لإدارة السكن والإيجار في دولة الإمارات العربية المتحدة.`
          : `${siteLegal.brandName} respects your privacy. This policy explains how we collect, use, and protect personal data when you use our residential and rent platform in the United Arab Emirates.`}
      </p>

      <h2>{ar ? '1. المسؤول عن المعالجة' : '1. Data controller'}</h2>
      <p>
        {siteLegal.legalName}
        <br />
        {siteLegal.registeredAddress}
        <br />
        {ar ? 'الرخصة التجارية' : 'Trade license'}: {siteLegal.tradeLicenseNumber}
        <br />
        {ar ? 'للتواصل بشأن حماية البيانات' : 'Data protection contact'}:{' '}
        <a href={`mailto:${siteLegal.dataProtectionContact}`}>{siteLegal.dataProtectionContact}</a>
      </p>

      <h2>{ar ? '2. الإطار القانوني في الإمارات' : '2. UAE legal framework'}</h2>
      <p>
        {ar
          ? 'نعالج البيانات الشخصية وفقاً للمرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية (PDPL) والأنظمة ذات الصلة الصادرة في دولة الإمارات، بالإضافة إلى متطلبات سرية الاتصالات عند الاقتضاء.'
          : 'We process personal data in line with Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL) and related UAE regulations, and applicable confidentiality rules for electronic communications.'}
      </p>

      <h2>{ar ? '3. البيانات التي نجمعها' : '3. Data we collect'}</h2>
      <ul>
        <li>
          {ar
            ? 'بيانات الحساب: الاسم، رقم الهاتف، كلمة مرور الدخول المكوّنة من 4 أرقام التي يُنشئها المدير، والبريد الإلكتروني إن وُجد.'
            : 'Account data: name, phone number, admin-issued 4-digit login password, and email if provided.'}
        </li>
        <li>
          {ar
            ? 'بيانات الوحدة والعقد: رقم المبنى والشقة، الإيجار، جدول الدفع، والمدفوعات.'
            : 'Unit and lease data: building/apartment numbers, rent, payment schedule, and payment records.'}
        </li>
        <li>
          {ar
            ? 'تذاكر الصيانة وسجلات الدردشة مع المساعد الذكي أو موظفي الدعم.'
            : 'Maintenance tickets and chat logs with the AI assistant or human support agents.'}
        </li>
        <li>
          {ar
            ? 'بيانات تقنية أساسية للكوكيز الضرورية لتشغيل الجلسة والأمان.'
            : 'Technical data for essential cookies needed for session and security.'}
        </li>
      </ul>

      <h2>{ar ? '4. أغراض الاستخدام' : '4. Purposes of use'}</h2>
      <ul>
        <li>{ar ? 'توفير حساب الساكن وخدمات المبنى' : 'Providing resident accounts and building services'}</li>
        <li>{ar ? 'تحصيل الإيجار وإصدار الإيصالات' : 'Collecting rent and issuing receipts'}</li>
        <li>{ar ? 'إدارة الصيانة والدعم' : 'Managing maintenance and support'}</li>
        <li>{ar ? 'الامتثال للالتزامات القانونية والمحاسبية' : 'Meeting legal and accounting obligations'}</li>
      </ul>

      <h2>{ar ? '5. الأساس القانوني' : '5. Legal basis'}</h2>
      <p>
        {ar
          ? 'نعتمد على تنفيذ العقد مع الساكن/المالك، والمصلحة المشروعة لتشغيل المبنى بأمان، والموافقة حيث يُطلب ذلك (مثل ملفات تعريف الارتباط غير الضرورية)، والالتزام القانوني عند الاقتضاء.'
          : 'We rely on performance of a contract with the resident/owner, legitimate interests in operating the building safely, consent where required (e.g. non-essential cookies), and legal obligation when applicable.'}
      </p>

      <h2>{ar ? '6. المشاركة والتخزين' : '6. Sharing and storage'}</h2>
      <p>
        {ar
          ? 'قد نشارك البيانات مع مدير العقار، مزوّدي الدفع المرخّصين، ومزوّدي الاستضافة ضمن عقود معالجة مناسبة. لا نبيع بياناتك الشخصية. تُخزَّن البيانات على خوادم تُدار وفقاً لمعايير أمنية مناسبة، وقد تُنقل داخل أو خارج الإمارات مع ضمانات مناسبة وفق PDPL.'
          : 'We may share data with the property manager, licensed payment providers, and hosting vendors under appropriate processing terms. We do not sell personal data. Data is stored on systems with appropriate security controls and may be transferred inside or outside the UAE with PDPL-compliant safeguards.'}
      </p>

      <h2>{ar ? '7. حقوقك' : '7. Your rights'}</h2>
      <p>
        {ar
          ? 'وفقاً لـ PDPL، يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو محوها أو تقييد معالجتها، والاعتراض في الحالات المقررة، وتقديم شكوى للجهة المختصة. تواصل عبر'
          : 'Under the PDPL you may request access, correction, erasure, or restriction of processing, object where applicable, and lodge a complaint with the competent UAE authority. Contact'}{' '}
        <a href={`mailto:${siteLegal.dataProtectionContact}`}>{siteLegal.dataProtectionContact}</a>.
      </p>

      <h2>{ar ? '8. الاحتفاظ والأمان' : '8. Retention and security'}</h2>
      <p>
        {ar
          ? 'نحتفظ بالبيانات طالما كان الحساب نشطاً وبالقدر الذي تتطلبه العقود أو القانون (مثل السجلات المالية). نستخدم كلمات مرور، وتحكم بالصلاحيات، وإجراءات تقنية وتنظيمية معقولة لحماية البيانات.'
          : 'We keep data while the account is active and as required by contracts or law (e.g. financial records). We use passwords, role-based access, and reasonable technical and organisational measures to protect data.'}
      </p>

      <h2>{ar ? '9. القاصرون' : '9. Minors'}</h2>
      <p>
        {ar
          ? 'الخدمة مخصّصة للبالغين المرتبطين بعقد إيجار أو ملكية. لا نجمع عن قصد بيانات أطفال دون السن القانوني دون ولي الأمر.'
          : 'The service is intended for adults linked to a lease or ownership. We do not knowingly collect children’s data without a guardian.'}
      </p>

      <h2>{ar ? '10. التحديثات' : '10. Updates'}</h2>
      <p>
        {ar
          ? 'قد نحدّث هذه السياسة. يستمر استخدام المنصة بعد التحديث وفق النسخة المنشورة هنا.'
          : 'We may update this policy. Continued use of the platform after changes means you accept the published version.'}
      </p>
    </LegalLayout>
  )
}
