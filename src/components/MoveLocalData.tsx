import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { useToast } from './toast'
import { useStore } from '@/data/store'
import { markLocalMigrated, mergeLocalIntoCloud, readLocalSnapshot } from '@/data/migrateLocal'

/** Offers to copy transactions entered in device-only mode into the signed-in account. */
export function MoveLocalData() {
  const s = useStore()
  const toast = useToast()
  const [local, setLocal] = useState(() => (s.repoKind === 'supabase' ? readLocalSnapshot() : null))
  if (!local || !s.ready || (!local.transactions.length && !local.budgets.length)) return null
  const n = local.transactions.length
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium"><Smartphone className="size-4 text-primary" />{n} transaction{n === 1 ? '' : 's'} saved on this phone</p>
      <p className="text-muted-foreground">You added these before signing in. Move them into your account so they’re backed up?</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setLocal(null)}>Not now</Button>
        <Button className="flex-1" onClick={() => {
          const { merged, added } = mergeLocalIntoCloud(local, s)
          s.replaceAll(merged); markLocalMigrated(); setLocal(null)
          toast(`Moved ${added} transaction${added === 1 ? '' : 's'} to your account`)
        }}>Move to account</Button>
      </div>
    </Card>
  )
}
