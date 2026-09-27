/**
 * LogoStrip — the marquee of companies whose engineers are on the DOGFOOD panel.
 * Names come from content/dogfood.ts; the glyphs are generic placeholder marks.
 */
import { judgeCompanies } from '../content/dogfood'
import { Marquee } from '../ui'

const glyphs = ['M12 3l9 16H3z', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M4 4h7v7H4zM13 13h7v7h-7z', 'M3 12h18M12 3v18M6 6l12 12', 'M12 2l3 7h7l-5.5 4.5 2 7.5L12 16l-6.5 5 2-7.5L2 9h7z']

export function LogoStrip() {
  return (
    <div className="py-10">
      <p className="mb-6 text-center font-mono text-[0.68rem] uppercase tracking-[0.12em] text-subtle">The DOGFOOD 2026 judging panel works at</p>
      <Marquee duration={36} label="Companies represented on the judging panel">
        {judgeCompanies.map((name, i) => (
          <span key={name} className="flex items-center gap-2.5 px-8 text-[1.15rem] font-semibold tracking-[-0.03em] text-[#a3a3a0] transition-colors duration-300 hover:text-ink sm:px-11">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d={glyphs[i % glyphs.length]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            {name}
          </span>
        ))}
      </Marquee>
    </div>
  )
}
