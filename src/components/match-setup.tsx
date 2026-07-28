"use client";
import { useState } from "react";
import Link from "next/link";
import { SegmentedControl, SelectField, Surface } from "navi-ui";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";

export function MatchSetup() {
  const access = useAccess();
  const [mode, setMode] = useState("x01");
  const [variant, setVariant] = useState("standard");
  const [opponent, setOpponent] = useState("ai");
  const [start, setStart] = useState("501");
  const [level, setLevel] = useState("8");
  const [bestOf, setBestOf] = useState("5");
  const [inRule, setInRule] = useState("straight");
  const [outRule, setOutRule] = useState("double");
  const advancedAi = access.status === "ready" && isProductAvailable(access.snapshot, "advancedAi") && hasAccessEntitlement(access.snapshot, "advanced_ai");
  const aiMaxLevel = advancedAi ? access.snapshot.limits.aiMaxLevel : 8;
  const selectedLevel = Math.min(Number(level), aiMaxLevel);
  return <div className="page-frame setup-page">
    <header className="page-heading"><p className="eyebrow">New match</p><h1>Set the oche.</h1><p>Choose the rules now. You can correct throws during the leg without breaking the rhythm.</p></header>
    <div className="setup-layout">
      <section className="setup-form" aria-label="Match settings">
        <div className="setup-section"><span className="setup-number">01</span><div><h2>Which game?</h2><SegmentedControl label="Game mode" value={mode} onChange={setMode} options={[{label:"X01",value:"x01"},{label:"Cricket",value:"cricket"}]} /></div></div>
        <div className="setup-section"><span className="setup-number">02</span><div><h2>Who are you playing?</h2><SegmentedControl label="Opponent" value={opponent} onChange={setOpponent} options={[{label:"Dartio AI",value:"ai"},{label:"Local friend",value:"local"}]} /></div></div>
        {mode==="cricket"?<div className="setup-section"><span className="setup-number">03</span><div><h2>Cricket rules</h2><SegmentedControl label="Cricket variant" value={variant} onChange={setVariant} options={[{label:"Standard",value:"standard"},{label:"Cut-throat",value:"cut-throat"},{label:"Tactics",value:"tactics"}]} /><p className="setup-note">{variant==="standard"?"Close a number, then score on it while your opponent is still open.":variant==="cut-throat"?"Points are inflicted on open opponents. The lowest score wins.":"No points at all. First to close everything takes it."}</p></div></div>:<div className="setup-section"><span className="setup-number">03</span><div><h2>Match format</h2><div className="field-grid"><SelectField label="Starting score" value={start} onChange={(e) => setStart(e.target.value)} options={[301,501,701,1001].map(value=>({value:String(value),label:String(value)}))}/><SelectField label="Best of legs" value={bestOf} onChange={(e)=>setBestOf(e.target.value)} options={[1,3,5,7].map(value=>({value:String(value),label:`${value} leg${value===1?"":"s"}`}))}/><SelectField label="In rule" value={inRule} onChange={(e)=>setInRule(e.target.value)} options={[{value:"straight",label:"Straight in"},{value:"double",label:"Double in"},{value:"master",label:"Master in"}]}/><SelectField label="Out rule" value={outRule} onChange={(e) => setOutRule(e.target.value)} options={[{value:"straight",label:"Straight out"},{value:"double",label:"Double out"},{value:"master",label:"Master out"}]}/></div></div></div>}
        {mode==="x01"&&opponent === "ai" && <div className="setup-section"><span className="setup-number">03</span><div><h2>AI opponent</h2><label className="level-control"><span><b>Level {selectedLevel}</b><small>{selectedLevel < 7 ? "Learning the board" : selectedLevel < 14 ? "League-night regular" : "Tournament pressure"}</small></span><input aria-label={`AI level, maximum ${aiMaxLevel}`} type="range" min="1" max={aiMaxLevel} value={selectedLevel} onChange={e => setLevel(e.target.value)} /><span className="level-scale"><i>1</i><i>Accuracy and checkout discipline</i><i>{aiMaxLevel}</i></span></label><div className={`level-access ${advancedAi?"unlocked":"locked"}`}><div><b>{advancedAi?"PRO RANGE ACTIVE":"LEVELS 9–20 · PRO"}</b><span>{access.status==="loading"?"Checking Pro access…":access.status==="unavailable"?"Paid access could not be verified. Levels 1–8 remain available.":advancedAi?"All twenty AI levels are available.":"Free play includes AI levels 1–8."}</span></div>{access.status==="unavailable"?<button type="button" onClick={()=>void access.retry()}>Retry</button>:!advancedAi&&access.status==="ready"?<Link href="/pricing">View Pro</Link>:null}</div></div></div>}
      </section>
      <aside><Surface className="match-ticket"><span className="ticket-kicker">Tonight’s match</span><div className="ticket-versus"><div><span>You</span><strong>PLAYER 1</strong></div><b>VS</b><div><span>{opponent === "ai" ? `AI · LV ${selectedLevel}` : "LOCAL"}</span><strong>{opponent === "ai" ? "THE NAVIGATOR" : "PLAYER 2"}</strong></div></div><dl><div><dt>Game</dt><dd>{mode==="cricket"?"Cricket":`${start} X01`}</dd></div><div><dt>Format</dt><dd>{mode==="cricket"?"First to close out":`Best of ${bestOf}`}</dd></div><div><dt>Rules</dt><dd>{mode==="cricket"?variant:`${inRule} in · ${outRule} out`}</dd></div></dl><Link className="button-link button-link-lg" href={mode==="cricket"?`/play/match?mode=cricket&variant=${variant}&opponent=${opponent}`:`/play/match?start=${start}&level=${selectedLevel}&best=${bestOf}&in=${inRule}&out=${outRule}&opponent=${opponent}`}>Walk to the oche →</Link><small>{advancedAi&&selectedLevel>8?"Pro AI access verified for this browser session.":"Local scoring and AI levels 1–8 need no account."}</small></Surface></aside>
    </div>
  </div>;
}
