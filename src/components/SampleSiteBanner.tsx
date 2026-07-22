import { siteConfig } from '../config/siteConfig'
import { useLang } from '../context/LangContext'

export default function SampleSiteBanner() {
  const { lang } = useLang()
  if (!siteConfig.isSample) return null

  const message =
    lang === 'ar'
      ? 'موقع تجريبي — بيانات منفصلة عن MLIHrent. للعرض فقط.'
      : 'Demo site — separate data from MLIHrent production. For demonstration only.'

  return (
    <div className="sample-site-banner" role="status">
      {message}
    </div>
  )
}
