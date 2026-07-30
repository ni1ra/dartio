import type { Metadata } from "next";
import Link from "next/link";
import { Surface } from "navi-ui";
export const metadata: Metadata={title:"Practice"};
const modes: ReadonlyArray<readonly [string,string,string,string,string]>=[
  ["01","X01","The complete match game","301–1001 · in/out rules · AI 1–20","/play"],
  ["02","Cricket","Own the numbers, close the board","Standard · cut-throat · tactics","/play/match?mode=cricket&variant=standard&opponent=local"],
  ["03","Around the clock","Build control across every segment","1 through 20, then the bull","/play/match?mode=aroundTheClock"],
  ["04","Shanghai","Three darts. Three beds. One big finish.","20 rounds · a Shanghai wins outright","/play/match?mode=shanghai"],
  ["05","Count-up","Simple scoring, honest progress","8 rounds · everything counts","/play/match?mode=countUp"],
  ["06","Bob’s 27","The unforgiving doubles workout","Start on 27 · every double, 1 to 20","/play/match?mode=bobs27"],
  ["07","Checkout lab","Solve finishes under pressure","12 classic finishes · land it on the double","/play/match?drill=checkoutLab"],
  ["08","Doubles matrix","Find your dependable corner","Every double, 1 to 20, then the bull","/play/match?drill=doublesMatrix"],
  ["09","Scoring sprint","Turn three darts into automatic rhythm","10 visits · everything counts","/play/match?drill=scoringSprint"],
];
// Every row is playable as of cycle 16, so the "coming next" branch that used to
// render an inert card is gone rather than left waiting for a mode that may never
// need it.
export default function PracticePage(){return <div className="page-frame catalog-page"><header className="page-heading wide"><p className="eyebrow">Practice room</p><h1>Pick a pressure.<br/><em>Build a weapon.</em></h1><p>Every mode has an input built for the drill—not a generic score box forced into a different game.</p></header><div className="catalog-list">{modes.map(([n,name,desc,meta,href])=><Surface key={name} className="catalog-row featured"><Link href={href}><span className="catalog-number">{n}</span><div><h2>{name}</h2><p>{desc}</p></div><small>{meta}</small><b>PLAY NOW →</b></Link></Surface>)}</div></div>}
