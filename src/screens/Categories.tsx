import { useState } from 'react'
import { ChevronRight, Lock, Plus, Trash2 } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Select } from '@/components/ui/input'
import { Confirm, Segmented, Sheet } from '@/components/ui/misc'
import { CategoryIcon, ICONS } from '@/components/CategoryIcon'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

const COLORS = ['#f97316', '#84cc16', '#ec4899', '#0ea5e9', '#eab308', '#8b5cf6', '#10b981', '#ef4444', '#6366f1', '#14b8a6', '#64748b']

export default function Categories() {
  const { categories, transactions, addCategory, updateCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [editing, setEditing] = useState<Partial<Category> | null>(null)
  const [del, setDel] = useState<Category | null>(null)
  const tops = categories.filter((c) => !c.parentId && c.isIncome === (kind === 'income'))
  const subs = (id: string) => categories.filter((c) => c.parentId === id)
  const used = (id: string) => transactions.filter((t) => t.categoryId === id || t.subcategoryId === id).length

  const save = () => {
    const name = editing?.name?.trim()
    if (!name) return toast('Enter a name')
    const clash = categories.some((c) => c.id !== editing!.id && c.parentId === (editing!.parentId ?? null) && c.name.toLowerCase() === name.toLowerCase())
    if (clash) return toast('A category with that name already exists')
    if (editing!.id) updateCategory(editing!.id, { name, icon: editing!.icon, color: editing!.color })
    else addCategory({ name, parentId: editing!.parentId ?? null, icon: editing!.icon ?? 'tag', color: editing!.color ?? COLORS[0], isIncome: kind === 'income' })
    toast(editing!.id ? 'Category updated' : 'Category added'); setEditing(null)
  }

  return (
    <Page>
      <PageHeader title="Categories" back right={<Button size="sm" onClick={() => setEditing({ parentId: null, icon: 'tag', color: COLORS[0] })}><Plus />New</Button>} />
      <div className="space-y-4 px-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
        <Card className="divide-y">
          {tops.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <CategoryIcon category={c} />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{used(c.id)} transactions{subs(c.id).length ? ` · ${subs(c.id).length} subcategories` : ''}</p></div>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ parentId: c.id, icon: c.icon, color: c.color })} aria-label={`Add subcategory to ${c.name}`}><Plus /></Button>
                {c.userId ? <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Edit"><ChevronRight /></Button> : <Lock className="mx-2 size-3.5 text-muted-foreground" aria-label="Default category" />}
              </div>
              {subs(c.id).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2 pl-[4.25rem] pr-4">
                  <span className="flex-1 text-sm">{s.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(s)} aria-label="Delete"><Trash2 /></Button>
                </div>
              ))}
            </div>
          ))}
        </Card>
        <p className="text-center text-xs text-muted-foreground">Default categories can’t be renamed or deleted, but you can add subcategories to them.</p>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? 'Edit category' : editing?.parentId ? 'New subcategory' : 'New category'}>
        {editing && (
          <div className="space-y-4">
            <div><Label htmlFor="cname">Name</Label><Input id="cname" autoFocus maxLength={60} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            {!editing.id && !editing.parentId && (
              <div><Label>Parent (optional)</Label>
                <Select value={editing.parentId ?? ''} onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })}>
                  <option value="">None, top-level</option>{tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            )}
            {!editing.parentId && (<>
              <div><Label>Colour</Label><div className="flex flex-wrap gap-2">{COLORS.map((col) => (
                <button key={col} aria-label={col} onClick={() => setEditing({ ...editing, color: col })} className={cn('size-8 rounded-full ring-offset-2 ring-offset-card', editing.color === col && 'ring-2 ring-foreground')} style={{ background: col }} />))}</div></div>
              <div><Label>Icon</Label><div className="grid grid-cols-7 gap-2">{Object.entries(ICONS).map(([k, I]) => (
                <button key={k} aria-label={k} onClick={() => setEditing({ ...editing, icon: k })} className={cn('grid size-10 place-items-center rounded-xl border', editing.icon === k && 'border-primary bg-accent text-accent-foreground')}><I className="size-4" /></button>))}</div></div>
            </>)}
            <div className="flex gap-2">
              {editing.id && <Button variant="outline" className="text-destructive" onClick={() => { setDel(editing as Category); setEditing(null) }}><Trash2 />Delete</Button>}
              <Button className="flex-1" onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Sheet>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete ${del?.name}?`}
        body={`${del ? used(del.id) : 0} transactions will become uncategorised and marked for review.`}
        onConfirm={() => { if (del) { deleteCategory(del.id); toast('Category deleted') } }} />
    </Page>
  )
}
