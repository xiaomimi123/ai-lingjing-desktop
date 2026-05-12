// Phase 3 占位页面。所有路由初期都用它，Phase 4+ 逐个替换为真实页面。

interface PlaceholderPageProps {
  title: string
  description?: string
  phase?: string
}

export function PlaceholderPage({ title, description, phase }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div className="text-2xl font-semibold tracking-tight">{title}</div>
      {description && (
        <div className="max-w-md text-center text-sm text-muted-foreground">{description}</div>
      )}
      {phase && (
        <div className="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
          {phase}
        </div>
      )}
    </div>
  )
}
