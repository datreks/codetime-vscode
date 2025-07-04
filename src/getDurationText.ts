import { formatDuration } from 'date-fns'

const localeMap: Record<string, () => Promise<any>> = {
  'en-US': () => import('date-fns/locale/en-US').then(m => m.default),
  'zh-CN': () => import('date-fns/locale/zh-CN').then(m => m.default),
  'zh-TW': () => import('date-fns/locale/zh-TW').then(m => m.default),
  'ja': () => import('date-fns/locale/ja').then(m => m.default),
  'de': () => import('date-fns/locale/de').then(m => m.default),
  'fr': () => import('date-fns/locale/fr').then(m => m.default),
  'es': () => import('date-fns/locale/es').then(m => m.default),
  'it': () => import('date-fns/locale/it').then(m => m.default),
  'pt-BR': () => import('date-fns/locale/pt-BR').then(m => m.default),
  'ru': () => import('date-fns/locale/ru').then(m => m.default),
  'ko': () => import('date-fns/locale/ko').then(m => m.default),
  'hi': () => import('date-fns/locale/hi').then(m => m.default),
}

async function getLocale(locale: string = 'en') {
  const key = Object.keys(localeMap).find(k => k.toLowerCase() === locale.toLowerCase()) || 'en-US'
  return await localeMap[key]()
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
  return text || formatDuration({ minutes: 0 }, { locale: l, format: ['minutes'] })
}
