import type { Category, MerchantRule } from './types'
import { merchantKey } from './utils'

/**
 * Keyword rules for Indian merchants. Used as the first-pass suggestion before
 * (optional) AI categorisation on the backend. Order matters: first match wins. Rules name a default category; the
 * id is looked up from the user's category list (local ids differ from DB UUIDs).
 */
const RULES: Array<[RegExp, string]> = [
  [/\b(swiggy|zomato|eatsure|domino|pizza|kfc|mcdonald|burger|starbucks|cafe|restaurant|biryani|chai|haldiram)\b/, 'Food & Dining'],
  [/\b(bigbasket|blinkit|zepto|grofers|dmart|jiomart|instamart|reliance fresh|more supermarket|kirana|nature s basket)\b/, 'Groceries'],
  [/\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata cliq|croma|reliance digital|decathlon|ikea)\b/, 'Shopping'],
  [/\b(uber|ola|rapido|metro|irctc|redbus|namma yatri|fastag|parking|bmtc|best bus)\b/, 'Transportation'],
  [/\b(petrol|diesel|indian oil|iocl|bharat petroleum|bpcl|hpcl|hp petrol|shell|fuel)\b/, 'Fuel'],
  [/\b(rent|nobroker|housing|landlord|pg )\b/, 'Rent'],
  [/\b(electricity|bescom|tneb|msedcl|tata power|adani electricity|water bill|gas bill|indane|bharat gas|hp gas|piped gas)\b/, 'Electricity & Utilities'],
  [/\b(airtel|jio|vodafone|vi |bsnl|act fibernet|hathway|broadband|recharge|tata play|dth)\b/, 'Mobile & Internet'],
  [/\b(netflix|spotify|hotstar|disney|prime video|sonyliv|zee5|jiocinema|bookmyshow|pvr|inox|youtube premium|gaana)\b/, 'Entertainment'],
  [/\b(apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|pharmacy|diagnostic|practo)\b/, 'Healthcare'],
  [/\b(makemytrip|goibibo|cleartrip|yatra|indigo|air india|vistara|akasa|oyo|airbnb|hotel)\b/, 'Travel'],
  [/\b(byju|unacademy|udemy|coursera|school|college|tuition|fees)\b/, 'Education'],
  [/\b(emi|loan|bajaj finserv|home credit|credit card bill|cred bill)\b/, 'EMI & Loans'],
  [/\b(zerodha|groww|upstox|kuvera|mutual fund|sip|coin by zerodha|smallcase)\b/, 'Investments'],
  [/\b(salon|spa|urban company|lakme|barber|parlour)\b/, 'Personal Care'],
  [/\b(lic|insurance|policybazaar|acko|digit|hdfc ergo|icici lombard|star health)\b/, 'Insurance'],
]

export interface Suggestion { categoryId: string | null; confident: boolean; reason: 'learned' | 'rule' | 'none' }

export function suggestCategory(merchant: string, description: string | undefined, learned: MerchantRule[], categories: Category[]): Suggestion {
  const key = merchantKey(merchant)
  const rule = learned.find((r) => r.merchantKey === key)
  if (rule) return { categoryId: rule.categoryId, confident: true, reason: 'learned' }
  const hay = ` ${key} ${(description ?? '').toLowerCase()} `
  for (const [re, name] of RULES) {
    if (!re.test(hay)) continue
    const c = categories.find((x) => !x.parentId && !x.isIncome && x.name === name)
    if (c) return { categoryId: c.id, confident: true, reason: 'rule' }
  }
  return { categoryId: null, confident: false, reason: 'none' }
}
