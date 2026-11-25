import type { MerchantRule } from './types'
import { merchantKey } from './utils'

/**
 * Keyword rules for Indian merchants. Used as the first-pass suggestion before
 * (optional) AI categorisation on the backend. Order matters: first match wins.
 */
const RULES: Array<[RegExp, string]> = [
  [/\b(swiggy|zomato|eatsure|domino|pizza|kfc|mcdonald|burger|starbucks|cafe|restaurant|biryani|chai|haldiram)\b/, 'cat_food'],
  [/\b(bigbasket|blinkit|zepto|grofers|dmart|jiomart|instamart|reliance fresh|more supermarket|kirana|nature s basket)\b/, 'cat_groceries'],
  [/\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata cliq|croma|reliance digital|decathlon|ikea)\b/, 'cat_shopping'],
  [/\b(uber|ola|rapido|metro|irctc|redbus|namma yatri|fastag|parking|bmtc|best bus)\b/, 'cat_transport'],
  [/\b(petrol|diesel|indian oil|iocl|bharat petroleum|bpcl|hpcl|hp petrol|shell|fuel)\b/, 'cat_fuel'],
  [/\b(rent|nobroker|housing|landlord|pg )\b/, 'cat_rent'],
  [/\b(electricity|bescom|tneb|msedcl|tata power|adani electricity|water bill|gas bill|indane|bharat gas|hp gas|piped gas)\b/, 'cat_utilities'],
  [/\b(airtel|jio|vodafone|vi |bsnl|act fibernet|hathway|broadband|recharge|tata play|dth)\b/, 'cat_mobile'],
  [/\b(netflix|spotify|hotstar|disney|prime video|sonyliv|zee5|jiocinema|bookmyshow|pvr|inox|youtube premium|gaana)\b/, 'cat_entertainment'],
  [/\b(apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|pharmacy|diagnostic|practo)\b/, 'cat_health'],
  [/\b(makemytrip|goibibo|cleartrip|yatra|indigo|air india|vistara|akasa|oyo|airbnb|hotel)\b/, 'cat_travel'],
  [/\b(byju|unacademy|udemy|coursera|school|college|tuition|fees)\b/, 'cat_education'],
  [/\b(emi|loan|bajaj finserv|home credit|credit card bill|cred bill)\b/, 'cat_emi'],
  [/\b(zerodha|groww|upstox|kuvera|mutual fund|sip|coin by zerodha|smallcase)\b/, 'cat_invest'],
  [/\b(salon|spa|urban company|lakme|barber|parlour)\b/, 'cat_care'],
  [/\b(lic|insurance|policybazaar|acko|digit|hdfc ergo|icici lombard|star health)\b/, 'cat_insurance'],
]

export interface Suggestion { categoryId: string | null; confident: boolean; reason: 'learned' | 'rule' | 'none' }

export function suggestCategory(merchant: string, description: string | undefined, learned: MerchantRule[]): Suggestion {
  const key = merchantKey(merchant)
  const rule = learned.find((r) => r.merchantKey === key)
  if (rule) return { categoryId: rule.categoryId, confident: true, reason: 'learned' }
  const hay = ` ${key} ${(description ?? '').toLowerCase()} `
  for (const [re, cat] of RULES) if (re.test(hay)) return { categoryId: cat, confident: true, reason: 'rule' }
  return { categoryId: null, confident: false, reason: 'none' }
}
