"use client";
import { useState } from "react";
import Link from "next/link";
import { SegmentedControl, SelectField, Surface } from "navi-ui";

export function MatchSetup() {
  const [opponent, setOpponent] = useState("ai");
  const [start, setStart] = useState("501");
  const [level, setLevel] = useState("8");
  const [bestOf, setBestOf] = useState("5");
  const [inRule, setInRule] = useState("straight");
  const [outRule, setOutRule] = useState("double");
  return <div className="page-frame setup-page">
    <header className="page-heading"><p className="eyebrow">New match</p><h1>Set the oche.</h1><p>Choose the rules now. You can correct throws during the leg without breaking the rhythm.</p></header>
    <div className="setup-layout">
      <section className="setup-form" aria-label="Match settings">
        <div className="setup-section"><span className="setup-number">01</span><div><h2>Who are you playing?</h2><SegmentedControl label="Opponent" value={opponent} onChange={setOpponent} options={[{label:"Dartio AI",value:"ai"},{label:"Local friend",value:"local"}]} /></div></div>
        <div className="setup-section"><span className="setup-number">02</span><div><h2>Match format</h2><div className="field-grid"><SelectField label="Starting score" value={start} onChange={(e) => setStart(e.target.value)} options={[301,501,701,1001].map(value=>({value:String(value),label:String(value)}))}/><SelectField label="Best of legs" value={bestOf} onChange={(e)=>setBestOf(e.target.value)} options={[1,3,5,7].map(value=>({value:String(value),label:`${value} leg${value===1?"":"s"}`}))}/><SelectField label="In rule" value={inRule} onChange={(e)=>setInRule(e.target.value)} options={[{value:"straight",label:"Straight in"},{value:"double",label:"Double in"},{value:"master",label:"Master in"}]}/><SelectField label="Out rule" value={outRule} onChange={(e) => setOutRule(e.target.value)} options={[{value:"straight",label:"Straight out"},{value:"double",label:"Double out"},{value:"master",label:"Master out"}]}/></div></div></div>
        {opponent === "ai" && <div className="setup-section"><span className="setup-number">03</span><div><h2>AI opponent</h2><label className="level-control"><span><b>Level {level}</b><small>{Number(level) < 7 ? "Learning the board" : Number(level) < 14 ? "League-night regular" : "Tournament pressure"}</small></span><input aria-label="AI level" type="range" min="1" max="20" value={level} onChange={e => setLevel(e.target.value)} /><span className="level-scale"><i>1</i><i>Accuracy and checkout discipline</i><i>20</i></span></label></div></div>}
      </section>
      <aside><Surface className="match-ticket"><span className="ticket-kicker">Tonight’s match</span><div className="ticket-versus"><div><span>You</span><strong>PLAYER 1</strong></div><b>VS</b><div><span>{opponent === "ai" ? `AI · LV ${level}` : "LOCAL"}</span><strong>{opponent === "ai" ? "THE NAVIGATOR" : "PLAYER 2"}</strong></div></div><dl><div><dt>Game</dt><dd>{start} X01</dd></div><div><dt>Format</dt><dd>Best of {bestOf}</dd></div><div><dt>Rules</dt><dd>{inRule} in · {outRule} out</dd></div></dl><Link className="button-link button-link-lg" href={`/play/match?start=${start}&level=${level}&best=${bestOf}&in=${inRule}&out=${outRule}&opponent=${opponent}`}>Walk to the oche →</Link><small>Match stays on this device. No account required.</small></Surface></aside>
    </div>
  </div>;
}
