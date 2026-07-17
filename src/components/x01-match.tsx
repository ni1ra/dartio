"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import { AggregateVisitRequiresDartsError, applyAggregateVisit, applyDart, BOARD_CLOCKWISE, BOARD_RADII, checkoutAdvice, chooseAiAim, createX01, dart, notation, representativePoint, scoreBoardPoint, seededRandom, throwAiDart, undoLastDart, x01PlayerStats, type Dart, type InRule, type OutRule, type X01State } from "@/domain";
import { VoiceControl } from "./voice-control";
import { CheckoutCompanion } from "./checkout-companion";
import { MatchResult } from "./match-result";
import { VisitEntry } from "./visit-entry";

const SEGMENTS = BOARD_CLOCKWISE;
const BOARD_CENTER=160,BOARD_RADIUS=136;
const R={innerBull:BOARD_RADII.innerBull*BOARD_RADIUS,outerBull:BOARD_RADII.outerBull*BOARD_RADIUS,trebleInner:BOARD_RADII.trebleInner*BOARD_RADIUS,trebleOuter:BOARD_RADII.trebleOuter*BOARD_RADIUS,doubleInner:BOARD_RADII.doubleInner*BOARD_RADIUS,outer:BOARD_RADII.outer*BOARD_RADIUS};
function polar(radius:number,degrees:number){const angle=degrees*Math.PI/180,round=(value:number)=>Math.round(value*10_000)/10_000;return{x:round(BOARD_CENTER+radius*Math.cos(angle)),y:round(BOARD_CENTER+radius*Math.sin(angle))}}
function ringPath(inner:number,outer:number,start:number,end:number){const a=polar(outer,start),b=polar(outer,end),c=polar(inner,end),d=polar(inner,start);return `M${a.x} ${a.y} A${outer} ${outer} 0 0 1 ${b.x} ${b.y} L${c.x} ${c.y} A${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;}
function positioned(value:Dart):Dart{return value.x!==undefined&&value.y!==undefined?value:dart(value.segment,value.multiplier,representativePoint(value))}
function runAiTurn(state:X01State,level:number):X01State { let next=state;const rng=seededRandom(state.turns.length*101+level);while(next.status==="playing"&&next.currentPlayer===1){const aim=chooseAiAim(next.scores[1]??501);next=applyDart(next,throwAiDart(level,aim,rng).dart);}return next; }

export function X01Match() {
  const params=useSearchParams();
  const requestedStart=Number(params.get("start")),requestedLevel=Number(params.get("level")),requestedBest=Number(params.get("best"));
  const start=[301,501,701,1001].includes(requestedStart)?requestedStart:501,level=Number.isInteger(requestedLevel)?Math.min(20,Math.max(1,requestedLevel)):8,bestOf=[1,3,5,7].includes(requestedBest)?requestedBest:5;
  const inParam=params.get("in"),outParam=params.get("out"),inRule:InRule=inParam==="double"||inParam==="master"?inParam:"straight",outRule:OutRule=outParam==="straight"||outParam==="master"?outParam:"double",isAi=params.get("opponent")!=="local";
  const [game,setGame]=useState(()=>createX01({startingScore:start,legsToWin:Math.ceil(bestOf/2),setsToWin:1,inRule,outRule},[{id:"you",name:"Player 1"},{id:"ai",name:isAi?"The Navigator":"Player 2"}]));
  const aiTimer=useRef<number|null>(null),aiGeneration=useRef(0);
  const [inputMode,setInputMode]=useState<"board"|"score"|"darts">("board"), [correction,setCorrection]=useState(false), [message,setMessage]=useState("Your throw · 3 darts");
  const you=game.scores[0]??start,ai=game.scores[1]??start,darts=game.currentDarts,checkoutScore=game.scores[game.currentPlayer]??start;
  const canCorrectLatestDart=darts.length>0||game.turns.at(-1)?.source==="darts";
  const checkout=useMemo(()=>checkoutAdvice(checkoutScore,Math.max(1,3-darts.length) as 1|2|3,outRule),[checkoutScore,darts.length,outRule]);
  const stats=useMemo(()=>game.players.map(player=>x01PlayerStats(game,player.id)),[game]);
  useEffect(()=>()=>{aiGeneration.current+=1;if(aiTimer.current!==null)window.clearTimeout(aiTimer.current)},[]);

  function cancelAi(){aiGeneration.current+=1;if(aiTimer.current!==null){window.clearTimeout(aiTimer.current);aiTimer.current=null}}
  function commit(next:X01State){setGame(next);if(next.status==="complete"){cancelAi();setMessage(`${next.players.find(p=>p.id===next.winnerId)?.name} wins the match`);return;}if(next.currentPlayer===1&&isAi){cancelAi();const generation=aiGeneration.current;setMessage("AI is at the oche…");aiTimer.current=window.setTimeout(()=>{if(generation!==aiGeneration.current)return;const result=runAiTurn(next,level);setGame(result);aiTimer.current=null;setMessage(result.status==="complete"?`${result.players.find(player=>player.id===result.winnerId)?.name} wins the match`:"Your throw · 3 darts");},450);}else setMessage(`${next.players[next.currentPlayer]?.name} · ${3-next.currentDarts.length} darts`);}
  function addDart(value:Dart){if((isAi&&game.currentPlayer!==0)||game.status==="complete")return;const placed=positioned(value);commit(applyDart(game,placed));setMessage(`${notation(placed)} registered`);}
  function submitAggregate(score:number,dartsThrown:1|2|3){if((isAi&&game.currentPlayer!==0)||game.status==="complete")return;commit(applyAggregateVisit(game,{score,dartsThrown}));setMessage(`Visit total ${score} registered`);}
  function submitVoiceAggregate(score:number){try{submitAggregate(score,3);}catch(problem){if(problem instanceof AggregateVisitRequiresDartsError){setInputMode("darts");setMessage(problem.reason==="in-rule"?"Enter each dart until you are in":problem.reason==="out-rule"?"Enter each dart to verify the finish":"Finish this visit one dart at a time");}else setMessage(problem instanceof Error?problem.message:"That visit cannot be recorded");}}
  function refuseSyntheticEnd(){setInputMode("darts");setMessage("Record every dart, including misses, before ending the visit");}
  function undo(){cancelAi();const previous=undoLastDart(game);if(previous===game)return;commit(previous);setMessage("Latest dart removed");}
  function boardClick(e:React.MouseEvent<SVGSVGElement>){const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)*320/rect.width,y=(e.clientY-rect.top)*320/rect.height;addDart(scoreBoardPoint({x:(x-BOARD_CENTER)/BOARD_RADIUS,y:(y-BOARD_CENTER)/BOARD_RADIUS}));}
  return <div className="match-page">
    <header className="match-header"><div><span className={game.status==="playing"?"match-live":"match-complete"}>{game.status==="playing"&&<i />} {game.status==="playing"?`LEG ${game.legNumber} · LIVE`:"MATCH COMPLETE"}</span><b>{start} / best of {bestOf}</b></div><div className="match-tools"><span>{isAi?`AI level ${level}`:"Local match"}</span><IconButton label="Correct last dart" onClick={()=>setCorrection(true)} disabled={!canCorrectLatestDart}>✎</IconButton><IconButton label="Undo last dart" onClick={undo} disabled={!game.past.length}>↶</IconButton></div></header>
    <section className="score-race" aria-label="Scoreboard"><div className={`score-player ${game.currentPlayer===0&&game.status==="playing"?"active":""}`}><span>{game.players[0]?.name??"Player 1"} <i>{game.status==="complete"?"finished":game.currentPlayer===0?"at the oche":"waiting"}</i></span><strong>{you}</strong><small>{stats[0]?.dartsThrown?`${stats[0].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div><div className="leg-score"><span>{game.options.setsToWin>1?"SETS · LEGS":"LEGS"}</span><b>{game.options.setsToWin>1?`${game.sets[0]}–${game.sets[1]} · `:""}{game.legs[0]} — {game.legs[1]}</b></div><div className={`score-player opponent ${game.currentPlayer===1&&game.status==="playing"?"active":""}`}><span>{game.players[1]?.name??"Player 2"} <i>{game.status==="complete"?"finished":isAi?`LV ${level}`:game.currentPlayer===1?"at the oche":"waiting"}</i></span><strong>{ai}</strong><small>{stats[1]?.dartsThrown?`${stats[1].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div></section>
    {game.status==="complete"&&<MatchResult players={game.players} winnerId={game.winnerId} legs={game.legs} averages={stats.map(value=>value.threeDartAverage)} />}
    <div className="match-grid">
      <section className="board-zone"><div className="board-wrap"><svg className="dartboard" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" role="button" tabIndex={0} aria-label="Dartboard. Click a landing point to record a dart. Press Enter to record treble twenty." onClick={boardClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();addDart(dart(20,3));}}}>
        <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r="151" className="board-shadow"/>
        {SEGMENTS.map((number,index)=>{const center=index*18-90,start=center-9,end=center+9;const label=polar(145,center);const bed=index%2===0?"bed-dark":"bed-light";const color=index%2===0?"ring-red":"ring-green";return <g key={number} data-segment={number}><path d={ringPath(R.outerBull,R.trebleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.trebleInner,R.trebleOuter,start,end)} className={`board-bed ${color}`}/><path d={ringPath(R.trebleOuter,R.doubleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.doubleInner,R.outer,start,end)} className={`board-bed ${color}`}/><text x={label.x} y={label.y} className="board-number">{number}</text></g>})}
        <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.outerBull} className="outer-bull"/><circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.innerBull} className="inner-bull"/>
        <g className="board-wires" aria-hidden="true">{[R.innerBull,R.outerBull,R.trebleInner,R.trebleOuter,R.doubleInner,R.outer].map(radius=><circle key={radius} cx={BOARD_CENTER} cy={BOARD_CENTER} r={radius}/>)}{SEGMENTS.map((number,index)=>{const point=polar(R.outer,index*18-99),inner=polar(R.outerBull,index*18-99);return <line key={number} x1={inner.x} y1={inner.y} x2={point.x} y2={point.y}/>})}</g>
        {darts.map((d,i)=>{const x=BOARD_CENTER+(d.x??0)*BOARD_RADIUS,y=BOARD_CENTER+(d.y??0)*BOARD_RADIUS;return <g key={`${notation(d)}-${i}`} className="throw-mark"><circle cx={x} cy={y} r="7"/><text x={x} y={y+3}>{i+1}</text></g>})}
      </svg><div className="board-caption"><span>Tap the landing point</span><small>or use score entry below</small></div></div></section>
      <aside className="match-side">
        <CheckoutCompanion advice={checkout} playerName={game.players[game.currentPlayer]?.name??`Player ${game.currentPlayer+1}`} interactive={!isAi||game.currentPlayer===0} />
        <VisitEntry darts={darts} disabled={(isAi&&game.currentPlayer!==0)||game.status==="complete"} mode={inputMode} onModeChange={setInputMode} onDart={addDart} onAggregate={submitAggregate} />
        <VoiceControl disabled={(isAi&&game.currentPlayer!==0)||game.status==="complete"} onDart={(segment,multiplier)=>addDart(dart(segment as Dart["segment"],multiplier))} onTurnScore={submitVoiceAggregate} onUndo={undo} onNextPlayer={refuseSyntheticEnd} />
      </aside>
      <section className="history-strip" id="visit-history" tabIndex={-1}><header><h2>Visit history</h2><button onClick={undo} disabled={!game.past.length}>Undo latest</button></header>{!game.turns.length?<div className="empty-history"><span>↗</span><p>The first visit will appear here.</p></div>:<ol>{[...game.turns].reverse().slice(0,6).map((turn,i)=>{const player=game.players.find(value=>value.id===turn.playerId),visitScore=turn.source==="aggregate"?(turn.aggregateScore??0):turn.darts.reduce((total,value)=>total+value.score,0);return <li key={`${turn.legNumber}-${turn.playerId}-${game.turns.length-i}`}><span>{(player?.name??"Player").toUpperCase()}</span><div>{turn.source==="aggregate"?<b className="aggregate-visit">TOTAL {turn.aggregateScore} · {turn.dartsThrown} DART{turn.dartsThrown===1?"":"S"}</b>:turn.darts.map((d,j)=><b key={`${notation(d)}-${j}`}>{notation(d)}</b>)}</div><strong>{visitScore}</strong><small>LEG {turn.legNumber} · {turn.bust?"BUST":`${turn.scoreAfter} left`}</small></li>})}</ol>}</section>
    </div>
    <CommandDock className="match-dock"><span aria-live="polite">{message}</span><div><button onClick={undo} disabled={!game.past.length}>Undo</button><button onClick={()=>setCorrection(true)} disabled={!canCorrectLatestDart}>Correct latest dart</button></div></CommandDock>
    <Modal open={correction} onClose={()=>setCorrection(false)} title="Correct the latest dart"><div className="correction-body"><p>Undo exactly the latest editable dart, then record that dart again using the board or Each dart input.</p><Button onClick={()=>{undo();setCorrection(false);setInputMode("darts")}} disabled={!canCorrectLatestDart}>Undo latest dart</Button><Button variant="secondary" onClick={()=>setCorrection(false)}>Keep current score</Button></div></Modal>
  </div>;
}
