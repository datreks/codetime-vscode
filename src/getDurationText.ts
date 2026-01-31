import { formatDuration, type Locale } from 'date-fns'

export const urduLocale: Locale = {
  code: 'ur',
  formatDistance: (_token, count) => {
    return `${count}`
  },
  formatLong: {
    date: () => '',
    time: () => '',
    dateTime: () => ''
  },
  formatRelative: () => '',
  localize: {
    ordinalNumber: (n) => `${n}`,
    era: () => '',
    quarter: () => '',
    month: () => '',
    day: () => '',
    dayPeriod: () => ''
  },
  match: {
    ordinalNumber: () => null,
    era: () => null,
    quarter: () => null,
    month: () => null,
    day: () => null,
    dayPeriod: () => null
  },
  options: { weekStartsOn: 0, firstWeekContainsDate: 1 }
}

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
  'ur': async () => urduLocale
}

async function getLocale(locale: string = 'en') {
  const key = Object.keys(localeMap).find(k => k.toLowerCase() === locale.toLowerCase()) || 'en-US'
  const localeModule = await localeMap[key]()
  return localeModule.default || localeModule
}

async function toUrduNumber(n: number): Promise<string> {
  const urduDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return n.toString().split('').map(d => urduDigits[+d] || d).join('')
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

  let text = formatDuration(
    { hours, minutes: mins },
    { locale: l, format: ['hours', 'minutes'], zero: false },
  )

  if (locale.toLowerCase() === 'ur') {
    const parts = []

    // Using custom Urdu numbers & text because date-fns doesn't support Urdu yet
    // Pending PR: https://github.com/date-fns/date-fns/pull/3776

    if (hours > 0) parts.push(`${await toUrduNumber(hours)} گھنٹے`)
    if (mins > 0) parts.push(`${await toUrduNumber(mins)} منٹ`)
    text = parts.join(' ')
  }
  
  return text
}
