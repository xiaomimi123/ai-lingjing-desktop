// 简易左侧垂直 Tabs（无 @radix-ui 依赖）。
// 设置页用：左 nav 列 + 右内容区。

import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsCtx<T extends string> {
  value: T
  setValue: (v: T) => void
}

const Ctx = createContext<TabsCtx<string> | null>(null)

export function VerticalTabs<T extends string>({
  defaultValue,
  children,
  className,
}: {
  defaultValue: T
  children: ReactNode
  className?: string
}) {
  const [value, setValue] = useState<T>(defaultValue)
  return (
    <Ctx.Provider value={{ value, setValue: setValue as (v: string) => void }}>
      <div className={cn('flex h-full', className)}>{children}</div>
    </Ctx.Provider>
  )
}

export function VerticalTabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <nav className={cn('flex w-44 shrink-0 flex-col gap-0.5 border-r p-3', className)}>
      {children}
    </nav>
  )
}

export function VerticalTabsTrigger({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('VerticalTabsTrigger must be inside VerticalTabs')
  const active = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        className,
      )}
      data-active={active || undefined}
    >
      {children}
    </button>
  )
}

export function VerticalTabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const ctx = useContext(Ctx)
  if (!ctx) return null
  if (ctx.value !== value) return null
  return <div className={cn('flex-1 overflow-auto', className)}>{children}</div>
}
