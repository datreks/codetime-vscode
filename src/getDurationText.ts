import { formatDuration } from 'date-fns'

const localeMap: Record<string, () => Promise<any>> = {
  'en-US': () => import('date-fns/locale/en-US'),
  'zh-CN': () => import('date-fns/locale/zh-CN'),
  'zh-TW': () => import('date-fns/locale/zh-TW'),
  'ja': () => import('date-fns/locale/ja'),
  'de': () => import('date-fns/locale/de'),
  'fr': () => import('date-fns/locale/fr'),
  'es': () => import('date-fns/locale/es'),
  'it': () => import('date-fns/locale/it'),
  'pt-BR': () => import('date-fns/locale/pt-BR'),
  'ru': () => import('date-fns/locale/ru'),
  'ko': () => import('date-fns/locale/ko'),
  'hi': () => import('date-fns/locale/hi'),
}

async function getLocale(locale: string = 'en') {
  const key = Object.keys(localeMap).find(k => k.toLowerCase() === locale.toLowerCase()) || 'en-US'
  const localeModule = await localeMap[key]()
  return localeModule.default || localeModule
}

/**
 * 获取本地化的“xh ym”时长文本
 * @param minutes 分钟数
 * @param locale 语言（如 "en"、"zh-CN"、"ja"），默认 "en"
 * @returns Promise<string>
 */
export async function getDurationText(minutes: number, locale: string = 'en'): Promise<string> {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const l = await getLocale(locale)

  const text = formatDuration(
    { hours, minutes: mins },
    { locale: l, format: ['hours', 'minutes'], zero: false },
  )
  return text
}
