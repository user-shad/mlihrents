import { Link } from 'react-router-dom'
import { siteLegal } from '../legal/siteLegal'
import { useLang } from '../context/LangContext'
import LegalLayout from '../components/LegalLayout'

export default function CookiesPage() {
  const { lang, tr } = useLang()
  const ar = lang === 'ar'

  return (
    <LegalLayout title={tr('cookiePolicy')}>
      <p>
        {ar
          ? `تستخدم ${siteLegal.brandName} ملفات تعريف الارتباط وتقنيات مشابهة لتشغيل الموقع بأمان.`
          : `${siteLegal.brandName} uses cookies and similar technologies to run the site securely.`}
      </p>

      <h2>{ar ? '1. الكوكيز الضرورية' : '1. Essential cookies'}</h2>
      <p>
        {ar
          ? 'مطلوبة لتسجيل الدخول، حفظ الجلسة، تفضيل اللغة، وتفضيل موافقة الكوكيز. لا يمكن إيقافها إذا أردت استخدام الحساب.'
          : 'Required for login, session storage, language preference, and cookie-consent preference. These cannot be switched off if you use an account.'}
      </p>

      <h2>{ar ? '2. الكوكيز الاختيارية' : '2. Optional cookies'}</h2>
      <p>
        {ar
          ? 'قد نستخدم لاحقاً أدوات تحليلات بموافقتك. يمكنك اختيار «الضرورية فقط» من شريط الموافقة.'
          : 'We may later use analytics tools with your consent. You can choose “Essential only” on the consent banner.'}
      </p>

      <h2>{ar ? '3. الإدارة' : '3. Managing cookies'}</h2>
      <p>
        {ar
          ? 'يمكنك مسح بيانات المتصفح في أي وقت. لمزيد من التفاصيل راجع'
          : 'You can clear browser storage at any time. For more detail see'}{' '}
        <Link to="/privacy">{tr('privacyPolicy')}</Link>.
      </p>

      <h2>{ar ? '4. التواصل' : '4. Contact'}</h2>
      <p>
        <a href={`tel:${siteLegal.phone.replace(/\s/g, '')}`}>{siteLegal.phone}</a>
      </p>
    </LegalLayout>
  )
}
