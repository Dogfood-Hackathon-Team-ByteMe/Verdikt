/**
 * Cta — the closing call-to-action band on a blue Panel: a copyable
 * `docker compose up` snippet on one side and "host an event" on the other,
 * echoing MLH's "stay in the loop" block.
 */
import { useState } from 'react'
import { Button, Icon, Panel } from '../ui'

const COMMANDS = ['git clone https://github.com/your-team/verdikt', 'cd verdikt', 'docker compose up']

export function Cta() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDS.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be blocked; fall back to selecting the text to copy by hand.
      const el = document.getElementById('cta-code')
      if (el) window.getSelection()?.selectAllChildren(el)
    }
  }

  return (
    <div id="host" className="scroll-mt-24 px-4 py-10 sm:px-6">
      <Panel className="mx-auto max-w-[1180px] px-5 py-16 sm:px-12 sm:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="label-mono flex items-center gap-2 text-white/80">
              <span aria-hidden="true">//</span> Self-host
            </div>
            <h2 className="headline mt-5 text-[clamp(2.2rem,5vw,3.8rem)]">
              One command. <span className="text-yellow">No cloud.</span>
            </h2>
            <p className="mt-5 max-w-md font-mono text-[0.92rem] leading-relaxed text-white/85">
              Verdikt runs on a laptop with the network off. Seeded data, no hosted database, no outside sign-in service.
            </p>
            <ul className="mt-6 flex flex-col gap-2 font-mono text-[0.9rem] text-white/90">
              {['MIT licensed, no CLA', 'CSV export at every stage', 'Every score change in the audit log'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-yellow text-on-bright">
                    <Icon name="check" size={11} strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button href="#top" size="lg" icon="arrowRight" magnetic>
                Host an event
              </Button>
              <Button href="#gallery" variant="dark" size="lg">
                See the gallery
              </Button>
            </div>
          </div>

          {/* Terminal card */}
          <div className="animate-float rounded-card bg-slab text-slab-fg ring-2 ring-ink">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow" />
                <span className="h-2.5 w-2.5 rounded-full bg-green" />
              </div>
              <button
                type="button"
                onClick={copy}
                className="rounded-md bg-white/10 px-3 py-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-yellow hover:text-on-bright"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre id="cta-code" className="overflow-x-auto p-5 font-mono text-[0.82rem] leading-7">
              {COMMANDS.map((cmd) => (
                <div key={cmd}>
                  <span className="select-none text-yellow">$ </span>
                  {cmd}
                </div>
              ))}
              <div className="text-white/50">✓ verdikt-db    healthy</div>
              <div className="text-white/50">✓ verdikt-api   listening on :8080</div>
              <div className="text-white/50">
                ✓ verdikt-web   http://localhost:3000 <span className="animate-pulse text-yellow">▍</span>
              </div>
            </pre>
          </div>
        </div>
      </Panel>
    </div>
  )
}
