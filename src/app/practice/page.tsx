import type { Metadata } from "next";
import Link from "next/link";
import { Surface } from "navi-ui";
export const metadata: Metadata={title:"Practice"};
const modes: ReadonlyArray<readonly [string,string,string,string,string]>=[
  ["01","X01","The complete match game","301–1001 · in/out rules · AI 1–20","/play"],
  ["02","Cricket","Own the numbers, close the board","Standard · cut-throat · tactics","/play/match?mode=cricket&variant=standard&opponent=local"],
  ["03","Around the clock","Build control across every segment","Singles, doubles, or triples · 1–20","#"],
  ["04","Shanghai","Three darts. Three beds. One big finish.","7, 10, or 20 rounds · Shanghai wins","#"],
  ["05","Count-up","Simple scoring, honest progress","8 rounds · personal-best pacing","#"],
  ["06","Bob’s 27","The unforgiving doubles workout","All doubles · pressure scoring","#"],
  ["07","Checkout lab","Solve finishes under pressure","2–170 · route preferences · speed","#"],
  ["08","Doubles matrix","Find your dependable corner","Adaptive targets · hit-rate heatmap","#"],
  ["09","Scoring sprint","Turn three darts into automatic rhythm","Timed rounds · accuracy bands","#"],
];
export default function PracticePage(){return <div className="page-frame catalog-page"><header className="page-heading wide"><p className="eyebrow">Practice room</p><h1>Pick a pressure.<br/><em>Build a weapon.</em></h1><p>Every mode has an input built for the drill—not a generic score box forced into a different game.</p></header><div className="catalog-list">{modes.map(([n,name,desc,meta,href])=>{const content=<><span className="catalog-number">{n}</span><div><h2>{name}</h2><p>{desc}</p></div><small>{meta}</small><b>{href==="#"?"COMING NEXT":"PLAY NOW →"}</b></>;return <Surface key={name} className={`catalog-row ${href==="#"?"":"featured"}`}>{href==="#"?<div className="catalog-static" aria-disabled="true">{content}</div>:<Link href={href}>{content}</Link>}</Surface>})}</div></div>}
