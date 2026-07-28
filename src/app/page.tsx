import Link from "next/link";
import { HeroBoard } from "@/components/hero-board";
import { Surface } from "navi-ui";

const modes = ["X01", "Cricket", "Around the clock", "Shanghai", "Count-up", "Bob’s 27"];

export default function HomePage() {
  return <>
    <section className="hero page-frame">
      <div className="hero-copy">
        <p className="eyebrow"><span className="live-dot" /> Your board. Fully alive.</p>
        <h1>Every dart<br /><em>tells a story.</em></h1>
        <p className="lede">A fast, expressive darts companion for solo sessions, serious practice, and match night. Tap the board, call the score, or enter each dart—the rest moves with you.</p>
        <div className="hero-actions"><Link className="button-link button-link-lg" href="/play">Play X01 now <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/practice">Explore 10 game modes →</Link></div>
        <div className="proof-line"><span>AI levels 1–20</span><span>Hands-free scoring</span><span>Pro checkout paths</span></div>
      </div>
      <div className="hero-orbit" aria-label="Live match preview">
        <div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" />
        <HeroBoard />
        <Surface className="floating-score"><span>You</span><strong>121</strong><small>T20 · T11 · D14</small></Surface>
        <Surface className="floating-ai"><span>AI / level 12</span><strong>74.2</strong><small>3-dart average</small></Surface>
      </div>
    </section>
    <section className="signal-band" aria-label="Dartio capabilities"><div className="signal-track">VISUAL SCORING <i>•</i> BELIEVABLE AI <i>•</i> VOICE INPUT <i>•</i> LIVE ROOMS <i>•</i> SMART CHECKOUTS <i>•</i></div></section>
    <section className="page-frame feature-story">
      <div><p className="eyebrow">One fluid match</p><h2>Throw. See it. Know what comes next.</h2></div>
      <div className="story-steps">
        <article><b>01</b><h3>Record naturally</h3><p>Touch the exact landing point, type a turn score, enter individual darts, or keep the mic listening.</p></article>
        <article><b>02</b><h3>Everything updates</h3><p>The board, remaining score, averages, leg history, and opponent react as one system.</p></article>
        <article><b>03</b><h3>Finish your way</h3><p>See the professional route, safer alternatives, setup shots, and why the route changed.</p></article>
      </div>
    </section>
    <section className="page-frame mode-ribbon"><div className="mode-intro"><p className="eyebrow">More than X01</p><h2>A mode for every kind of session.</h2><Link className="button-link button-link-secondary" href="/practice">See all modes</Link></div><div className="mode-list">{modes.map((mode, i) => <Link href={i === 0 ? "/play" : "/practice"} key={mode}><span>0{i + 1}</span>{mode}<b>→</b></Link>)}</div></section>
    <section className="page-frame closing-cta"><p>Meet your next favourite opponent.</p><h2>They never cancel.<br />They do get better.</h2><div><Link className="button-link button-link-lg inverted" href="/play">Challenge the AI</Link><span>20 levels · no waiting room</span></div></section>
  </>;
}
