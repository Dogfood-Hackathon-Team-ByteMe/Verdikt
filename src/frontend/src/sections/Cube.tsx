/**
 * Cube — the hero illustration: a draggable, slowly self-rotating 3D cube whose
 * six faces spell out the lifecycle of a hackathon (build → submit → judge →
 * win → teams → create). Pure CSS 3D; the drag/spin loop is plain rAF.
 *
 * Styles are scoped under `.hero-cube` so the generic class names (.face,
 * .cube, .front …) cannot leak into the rest of the app.
 */
import { useEffect, useRef } from 'react'
import { cn } from '../ui'

const FACES = [
  { cls: 'front', n: '01', title: 'BUILD', body: 'Teams turn ideas into working projects under one shared deadline.', card: '48 PROJECTS', action: 'IDEATE →', blocks: true },
  { cls: 'right', n: '02', title: 'SUBMIT', body: 'Package the idea, demo the work, and put it in front of the judges.', card: 'DEADLINE', action: 'UPLOAD →' },
  { cls: 'top', n: '03', title: 'JUDGE', body: 'Projects are evaluated using structured criteria and real-time scoring.', card: '24 JUDGES', action: 'SCORE →' },
  { cls: 'left', n: '04', title: 'WIN', body: 'The strongest projects rise to the top and take their place on the leaderboard.', card: 'LEADERBOARD', action: '🏆' },
  { cls: 'back', n: '05', title: 'TEAMS', body: 'Find teammates, discover ideas, and build something worth showing.', card: 'CONNECT', action: 'PEOPLE →' },
  { cls: 'bottom', n: '06', title: 'CREATE', body: 'One idea. One deadline. One opportunity to make something real.', card: 'START NOW', action: '→' },
]

export function Cube({ className }: { className?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cubeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const cube = cubeRef.current
    if (!wrapper || !cube) return

    let rotationX = -18
    let rotationY = -35
    let targetX = rotationX
    let targetY = rotationY

    let dragging = false
    let paused = false
    let startMouseX = 0
    let startMouseY = 0
    let startRotationX = 0
    let startRotationY = 0
    let lastTime = performance.now()
    let frame = 0

    const animate = (time: number) => {
      const delta = time - lastTime
      lastTime = time
      if (!dragging && !paused) targetY += delta * 0.018
      rotationX += (targetX - rotationX) * 0.08
      rotationY += (targetY - rotationY) * 0.08
      cube.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)

    const onEnter = () => { paused = true }
    const onLeave = () => { if (!dragging) paused = false }

    const beginDrag = (x: number, y: number) => {
      dragging = true
      startMouseX = x
      startMouseY = y
      startRotationX = targetX
      startRotationY = targetY
    }
    const moveDrag = (x: number, y: number) => {
      if (!dragging) return
      targetY = startRotationY + (x - startMouseX) * 0.45
      targetX = startRotationX - (y - startMouseY) * 0.45
    }

    const onMouseDown = (e: MouseEvent) => beginDrag(e.clientX, e.clientY)
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onMouseUp = () => { dragging = false; if (!wrapper.matches(':hover')) paused = false }

    const onTouchStart = (e: TouchEvent) => beginDrag(e.touches[0].clientX, e.touches[0].clientY)
    const onTouchMove = (e: TouchEvent) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)
    const onTouchEnd = () => { dragging = false; paused = false }

    wrapper.addEventListener('mouseenter', onEnter)
    wrapper.addEventListener('mouseleave', onLeave)
    wrapper.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    wrapper.addEventListener('touchstart', onTouchStart, { passive: true })
    wrapper.addEventListener('touchmove', onTouchMove, { passive: true })
    wrapper.addEventListener('touchend', onTouchEnd)

    return () => {
      cancelAnimationFrame(frame)
      wrapper.removeEventListener('mouseenter', onEnter)
      wrapper.removeEventListener('mouseleave', onLeave)
      wrapper.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      wrapper.removeEventListener('touchstart', onTouchStart)
      wrapper.removeEventListener('touchmove', onTouchMove)
      wrapper.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <div className={cn('hero-cube', className)}>
      <style>{CUBE_CSS}</style>
      <div className="scene">
        <div className="grid" />
        <div className="orbit" />
        <div className="shadow" />
        <span className="particle p1" />
        <span className="particle p2" />
        <span className="particle p3" />
        <span className="particle p4" />

        <div className="cube-wrapper" ref={wrapperRef}>
          <div className="cube" ref={cubeRef}>
            {FACES.map((f) => (
              <section key={f.cls} className={`face ${f.cls}`}>
                <div className="face-top">
                  <span className="number">{f.n}</span>
                  <span className="dot" />
                </div>
                <div>
                  <h2>{f.title}</h2>
                  <p>{f.body}</p>
                </div>
                <div className="face-bottom">
                  <span className="mini-card">{f.card}</span>
                  <span className="number">{f.action}</span>
                </div>
                {f.blocks && <div className="blocks" />}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const CUBE_CSS = `
.hero-cube .scene {
  position: relative;
  width: 100%;
  height: 520px;
  display: grid;
  place-items: center;
  perspective: 1200px;
  font-family: 'Space Grotesk', Inter, Arial, sans-serif;
  color: #151515;
  user-select: none;
  -webkit-user-select: none;
}
.hero-cube .grid {
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image:
    linear-gradient(#d8d4cb 1px, transparent 1px),
    linear-gradient(90deg, #d8d4cb 1px, transparent 1px);
  background-size: 35px 35px;
  mask-image: radial-gradient(circle, black 15%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle, black 15%, transparent 75%);
}
.hero-cube .shadow {
  position: absolute;
  width: 300px;
  height: 70px;
  bottom: 70px;
  background: rgba(30, 30, 25, 0.14);
  filter: blur(22px);
  border-radius: 50%;
  transform: rotateX(65deg);
}
.hero-cube .cube-wrapper {
  position: relative;
  width: 240px;
  height: 240px;
  transform-style: preserve-3d;
  cursor: grab;
  z-index: 5;
}
.hero-cube .cube-wrapper:active { cursor: grabbing; }
.hero-cube .cube {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.08s linear;
}
.hero-cube .face {
  position: absolute;
  width: 240px;
  height: 240px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  backface-visibility: hidden;
  overflow: hidden;
}
.hero-cube .face-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.hero-cube .number {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  opacity: 0.55;
}
.hero-cube .face h2 {
  font-size: 32px;
  line-height: 1;
  letter-spacing: -0.06em;
  font-weight: 800;
}
.hero-cube .face p {
  max-width: 165px;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.65;
}
.hero-cube .face-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-cube .mini-card {
  padding: 7px 9px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(5px);
}
.hero-cube .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #171717;
}
.hero-cube .front  { transform: translateZ(120px);                 background: #f0df62; }
.hero-cube .back   { transform: rotateY(180deg) translateZ(120px); background: #e8e5dd; }
.hero-cube .right  { transform: rotateY(90deg) translateZ(120px);  background: #d7e5d4; }
.hero-cube .left   { transform: rotateY(-90deg) translateZ(120px); background: #e3d7ec; }
.hero-cube .top    { transform: rotateX(90deg) translateZ(120px);  background: #d9e5e8; }
.hero-cube .bottom { transform: rotateX(-90deg) translateZ(120px); background: #e2ddd2; }
.hero-cube .blocks {
  position: absolute;
  right: 20px;
  bottom: 55px;
  width: 45px;
  height: 45px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  transform: rotate(8deg);
}
.hero-cube .blocks::before,
.hero-cube .blocks::after {
  content: "";
  position: absolute;
  border: 1px solid rgba(0, 0, 0, 0.18);
}
.hero-cube .blocks::before { width: 20px; height: 20px; top: -12px; left: 13px; }
.hero-cube .blocks::after  { width: 16px; height: 16px; bottom: -9px; right: -9px; }
.hero-cube .particle {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #191919;
  opacity: 0.2;
  animation: hero-cube-float 4s ease-in-out infinite;
}
.hero-cube .p1 { top: 130px; left: 60px; }
.hero-cube .p2 { top: 230px; right: 50px; animation-delay: 1s; }
.hero-cube .p3 { bottom: 150px; left: 90px; animation-delay: 2s; }
.hero-cube .p4 { bottom: 190px; right: 70px; animation-delay: 0.5s; }
@keyframes hero-cube-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
}
.hero-cube .orbit {
  position: absolute;
  width: 350px;
  height: 350px;
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 50%;
  transform: rotateX(70deg) rotateZ(-15deg);
  z-index: 1;
}
.hero-cube .orbit::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 7px;
  top: 14px;
  left: 50%;
  border-radius: 50%;
  background: #171717;
}
@media (max-width: 600px) {
  .hero-cube .scene { height: 440px; }
  .hero-cube .cube-wrapper,
  .hero-cube .face { width: 190px; height: 190px; }
  .hero-cube .front  { transform: translateZ(95px); }
  .hero-cube .back   { transform: rotateY(180deg) translateZ(95px); }
  .hero-cube .right  { transform: rotateY(90deg) translateZ(95px); }
  .hero-cube .left   { transform: rotateY(-90deg) translateZ(95px); }
  .hero-cube .top    { transform: rotateX(90deg) translateZ(95px); }
  .hero-cube .bottom { transform: rotateX(-90deg) translateZ(95px); }
  .hero-cube .face { padding: 19px; }
  .hero-cube .face h2 { font-size: 27px; }
  .hero-cube .orbit { width: 290px; height: 290px; }
}
`
