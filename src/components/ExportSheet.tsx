import { useState } from 'react'
import { format } from 'date-fns'
import { Download, FileSpreadsheet, FileText, Loader2, Share2 } from 'lucide-react'
import { Sheet } from './ui/misc'
import { Button } from './ui/button'
import { useToast } from './toast'
import { useStore } from '@/data/store'
import { toCSV } from '@/lib/csv'
import { PRESET_LABELS, type DateRange, type RangePreset } from '@/lib/dates'
import { canShareFiles, saveFile, shareFile, type SavedFile } from '@/lib/saveFile'
import type { Transaction } from '@/lib/types'

type Kind = 'csv' | 'xlsx' | 'pdf'

/** Export the transactions currently shown (filters applied) as CSV, Excel or a PDF statement. */
export function ExportSheet({ open, onOpenChange, list, range, preset, filterParts }:
  { open: boolean; onOpenChange: (o: boolean) => void; list: Transaction[]; range: DateRange; preset: RangePreset; filterParts: string[] }) {
  const { categories, sources, profile } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState<Kind | null>(null)
  const [saved, setSaved] = useState<SavedFile | null>(null)

  // "All time" uses the span of the exported transactions instead of the year 2000.
  const dates = list.map((t) => t.occurredAt).sort()
  const period = preset === 'all' && dates.length ? { from: new Date(dates[0]), to: new Date(dates[dates.length - 1]) } : range
  const periodLabel = preset === 'all' ? 'All time' : preset === 'custom' ? `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}` : PRESET_LABELS[preset]
  const filterNote = `Period: ${periodLabel}.${filterParts.length ? ` Filters: ${filterParts.join(', ')}.` : ' No other filters.'}`

  const run = async (kind: Kind) => {
    setBusy(kind); setSaved(null)
    try {
      const base = `spendwise-${format(period.from, 'yyyyMMdd')}-${format(period.to, 'yyyyMMdd')}`
      let file: SavedFile
      if (kind === 'csv') file = await saveFile(`${base}.csv`, toCSV(list, categories, sources), 'text/csv')
      else if (kind === 'xlsx') {
        const { buildExcel } = await import('@/lib/exportExcel')
        file = await saveFile(`${base}.xlsx`, await buildExcel(list, categories, sources), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      } else {
        const { buildStatementPdf } = await import('@/lib/exportPdf')
        const blob = await buildStatementPdf(list, categories, sources, { name: profile.fullName, email: profile.email, from: period.from, to: period.to, filterNote })
        file = await saveFile(`${base}-statement.pdf`, blob, 'application/pdf')
      }
      setSaved(file)
      toast(file.location ? `Saved to ${file.location}` : 'File ready to share')
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSaved(null) }} title={`Export ${list.length} transaction${list.length === 1 ? '' : 's'}`}>
      <p className="mb-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Only the transactions shown on screen are exported. {filterNote}</p>
      <div className="grid gap-2">
        <Button variant="outline" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText />}PDF statement</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}Excel (.xlsx)</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => run('csv')}>{busy === 'csv' ? <Loader2 className="animate-spin" /> : <Download />}CSV file</Button>
      </div>
      {saved && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-accent p-3 text-sm text-accent-foreground">
          <p className="font-medium">{saved.name}</p>
          <p className="mt-0.5 text-xs">{saved.location ? `Saved in ${saved.location}. Open the Files app to find it.` : 'Couldn’t save to your Documents folder. Use Share to send or save it.'}</p>
          {canShareFiles() && <Button size="sm" className="mt-3 w-full" onClick={() => shareFile(saved)}><Share2 />Share or open</Button>}
        </div>
      )}
    </Sheet>
  )
}
