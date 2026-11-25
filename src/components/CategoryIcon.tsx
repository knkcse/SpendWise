import {
  Car, CircleEllipsis, Clapperboard, Fuel, GraduationCap, HeartPulse, Home, Landmark, Plane, PlusCircle, Shield,
  ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Tag, TrendingUp, Utensils, Wallet, Zap, type LucideIcon,
} from 'lucide-react'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, 'shopping-basket': ShoppingBasket, 'shopping-bag': ShoppingBag, car: Car, fuel: Fuel, home: Home,
  zap: Zap, smartphone: Smartphone, clapperboard: Clapperboard, 'heart-pulse': HeartPulse, plane: Plane,
  'graduation-cap': GraduationCap, landmark: Landmark, 'trending-up': TrendingUp, sparkles: Sparkles, shield: Shield,
  'circle-ellipsis': CircleEllipsis, wallet: Wallet, 'plus-circle': PlusCircle, tag: Tag,
}

export function CategoryIcon({ category, className }: { category: Category | null; className?: string }) {
  const Icon = (category && ICONS[category.icon]) || Tag
  const color = category?.color ?? '#94a3b8'
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', className)} style={{ backgroundColor: color + '1f', color }}>
      <Icon className="size-[18px]" />
    </span>
  )
}
