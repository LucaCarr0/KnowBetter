'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function CopyInvite({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function copy() {
    if (timer.current) clearTimeout(timer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      if (!mounted.current) return
      setStatus('copied')
      timer.current = setTimeout(() => setStatus('idle'), 2000)
    } catch {
      if (mounted.current) setStatus('manual')
    }
  }

  return (
    <div className="min-w-0">
      <button type="button" onClick={copy} className="daisy-btn h-auto min-h-11 w-full gap-2 rounded-xl border-[#d8cfc3] bg-transparent px-3 py-2 text-xs font-bold text-[#10142f] shadow-none">
        {status === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {status === 'copied' ? 'Copied' : label}
      </button>
      <span role="status" className="sr-only">{status === 'copied' ? `${label} copied.` : ''}</span>
      {status === 'manual' && (
        <label className="mt-2 block text-xs leading-relaxed text-[#515570]">
          Copy unavailable. Select and copy manually:
          <input aria-label={`${label} manually`} readOnly value={value} onFocus={(event) => event.target.select()} className="daisy-input mt-1 h-10 w-full min-w-0 rounded-lg bg-white px-2 text-xs text-[#10142f]" />
        </label>
      )}
    </div>
  )
}
