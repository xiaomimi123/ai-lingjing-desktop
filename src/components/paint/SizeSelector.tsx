import { IMAGE_SIZE_PRESETS } from '@/types/painting'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function SizeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="paint-size-selector">
      {IMAGE_SIZE_PRESETS.map((preset) => {
        const active = preset.value === value
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
              active
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-accent/60',
            )}
            data-testid={`size-${preset.label}`}
          >
            <span>{preset.label}</span>
            <span className="text-[10px] opacity-70">{preset.value}</span>
          </button>
        )
      })}
    </div>
  )
}
