import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return crypto.randomUUID()
}

/** lower-case, strip punctuation / UPI handles / trailing ids so "SWIGGY*1234" == "Swiggy" */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/@[a-z0-9.]+/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
