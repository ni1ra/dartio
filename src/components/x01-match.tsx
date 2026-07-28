"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import { AggregateVisitRequiresDartsError, applyDart, basicCheckoutAdvice, BOARD_CLOCKWISE, BOARD_RADII, chooseAiAim, createLog, dart, dartEvent, notation, replay, rewindToVisit, representativePoint, scoreBoardPoint, seededRandom, throwAiDart, undoLastEvent, visitEvent, x01PlayerStats, type Dart, type InRule, type OutRule, type X01Event, type X01Log, type X01State } from "@/domain";
import { clearActiveMatch, loadActiveMatch, matchesSetup, saveActiveMatch } from "@/lib/product/match-store";
import { AiTurnClientError, projectDartMarker, requestPremiumAiTurn } from "@/lib/product/ai-turn-client";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";
import { useAdvancedCheckout } from "./use-advanced-checkout";
import { useMatchKeyboard } from "./use-match-keyboard";
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
/**
 * Plays out a local AI visit and returns the darts, not the resulting state.
 *
 * Everything that scores has to reach the match as events, so a corrected or
 * resumed match replays the AI's throws exactly as it replays the player's.
 * The seed is derived from the completed-visit count so the same log always
 * produces the same visit.
 */
function localAiDarts(state:X01State,level:number):readonly Dart[] { if(!Number.isInteger(level)||level<1||level>8)throw new Error("Local AI level must be an integer from 1 to 8");let next=state;const thrown:Dart[]=[];const rng=seededRandom(state.turns.length*101+level);while(next.status==="playing"&&next.currentPlayer===1){const aim=chooseAiAim(next.scores[1]??501);const value=throwAiDart(level,aim,rng).dart;thrown.push(value);next=applyDart(next,value);}return thrown; }
type AiRecovery={readonly kind:"denied"|"unavailable";readonly message:string};

export function X01Match() {
  const params=useSearchParams();
  const access=useAccess();
  const requestedStart=Number(params.get("start")),requestedLevel=Number(params.get("level")),requestedBest=Number(params.get("best"));
  const start=[301,501,701,1001].includes(requestedStart)?requestedStart:501,requestedAiLevel=Number.isInteger(requestedLevel)?Math.min(20,Math.max(1,requestedLevel)):8,bestOf=[1,3,5,7].includes(requestedBest)?requestedBest:5;
  const inParam=params.get("in"),outParam=params.get("out"),inRule:InRule=inParam==="double"||inParam==="master"?inParam:"straight",outRule:OutRule=outParam==="straight"||outParam==="master"?outParam:"double",isAi=params.get("opponent")!=="local";
  /*
   * The log is the match; the state is derived from it. That is what makes
   * correction reach any earlier visit and what lets a reload resume exactly
   * where the player left off — see src/domain/x01-log.ts.
   */
  const freshLog=useMemo(()=>createLog({startingScore:start,legsToWin:Math.ceil(bestOf/2),setsToWin:1,inRule,outRule},[{id:"you",name:"Player 1"},{id:"ai",name:isAi?"The Navigator":"Player 2"}]),[start,bestOf,inRule,outRule,isAi]);
  const [log,setLog]=useState<X01Log>(freshLog);
  const [resumed,setResumed]=useState(false);
  const [rejectedNotice,setRejectedNotice]=useState<string|null>(null);
  const replayed=useMemo(()=>replay(log),[log]);
  const game=replayed.state;
  const aiTimer=useRef<number|null>(null),aiController=useRef<AbortController|null>(null),aiGeneration=useRef(0);
  const [inputMode,setInputMode]=useState<"board"|"score"|"darts">("board"), [correction,setCorrection]=useState(false), [message,setMessage]=useState("Your throw · 3 darts");
  const [continueAtEight,setContinueAtEight]=useState(false),[aiRecovery,setAiRecovery]=useState<AiRecovery|null>(null);
  const premiumRequested=isAi&&requestedAiLevel>8;
  const premiumReady=premiumRequested&&!continueAtEight&&access.status==="ready"&&isProductAvailable(access.snapshot,"advancedAi")&&hasAccessEntitlement(access.snapshot,"advanced_ai")&&requestedAiLevel<=access.snapshot.limits.aiMaxLevel;
  const accessChecking=premiumRequested&&!continueAtEight&&access.status==="loading";
  const level=premiumReady?requestedAiLevel:premiumRequested?8:requestedAiLevel;
  const manualInputDisabled=game.status==="complete"||(isAi&&game.currentPlayer!==0)||accessChecking;
  const you=game.scores[0]??start,ai=game.scores[1]??start,darts=game.currentDarts,checkoutScore=game.scores[game.currentPlayer]??start;
  const canUndo=log.events.length>0;
  // Any completed visit can be corrected now, not only the latest dart.
  const correctableVisits=game.turns.length;
  const dartsInHand=Math.max(1,3-darts.length) as 1|2|3;
  // Free scoring never waits on the network: the basic route renders now and the
  // server-authorized advanced advice replaces it in place when it arrives.
  const basicCheckout=useMemo(()=>basicCheckoutAdvice(checkoutScore,dartsInHand,outRule),[checkoutScore,dartsInHand,outRule]);
  const advancedEntitled=access.status==="ready"&&isProductAvailable(access.snapshot,"advancedCheckout")&&hasAccessEntitlement(access.snapshot,"advanced_checkout");
  const advancedCheckout=useAdvancedCheckout(game.status==="playing"?{score:checkoutScore,dartsAvailable:dartsInHand,outRule}:null,advancedEntitled);
  const checkout=advancedCheckout.advice??basicCheckout;
  const checkoutTier=advancedCheckout.advice?"advanced":"basic";
  const stats=useMemo(()=>game.players.map(player=>x01PlayerStats(game,player.id)),[game]);
  useEffect(()=>()=>{aiGeneration.current+=1;if(aiTimer.current!==null)window.clearTimeout(aiTimer.current);aiController.current?.abort()},[]);

  // Reading the storage key on mount rather than during the initial state
  // computation keeps the server and first client render identical.
  // Deferred a frame so the first client render matches the server's, and so
  // the read never counts as a synchronous setState inside an effect.
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{const stored=loadActiveMatch();if(!stored||stored.events.length===0||!matchesSetup(stored,freshLog))return;setLog(stored);setResumed(true);setMessage("Match resumed where you left off")});return()=>window.cancelAnimationFrame(frame)},[freshLog]);
  useEffect(()=>{if(log.events.length===0)return;saveActiveMatch(log)},[log]);
  useEffect(()=>{if(game.status==="complete")clearActiveMatch()},[game.status]);

  function cancelAi(){aiGeneration.current+=1;if(aiTimer.current!==null){window.clearTimeout(aiTimer.current);aiTimer.current=null}aiController.current?.abort();aiController.current=null}
  function settledMessage(result:X01State){return result.status==="complete"?`${result.players.find(player=>player.id===result.winnerId)?.name} wins the match`:"Your throw · 3 darts"}
  function queueLocalAiTurn(next:X01State,localLevel:number){cancelAi();const generation=aiGeneration.current;setMessage(`AI level ${localLevel} is at the oche…`);aiTimer.current=window.setTimeout(()=>{if(generation!==aiGeneration.current)return;aiTimer.current=null;commitDarts(localAiDarts(next,localLevel));},450)}
  function premiumFailure(problem:unknown,generation:number){if(generation!==aiGeneration.current||aiController.current?.signal.aborted)return;aiController.current=null;if(problem instanceof AiTurnClientError&&(problem.status===401||problem.status===403)){setAiRecovery({kind:"denied",message:"Pro access could not authorize this AI visit."});setMessage("AI visit paused · Pro authorization required");void access.refresh();return}setAiRecovery({kind:"unavailable",message:problem instanceof AiTurnClientError&&problem.code==="access_status_unavailable"?"Pro verification is temporarily unavailable.":"The premium AI visit could not reach Dartio."});setMessage("AI visit paused · no score changed")}
  function queuePremiumAiTurn(next:X01State){cancelAi();const generation=aiGeneration.current,controller=new AbortController();aiController.current=controller;setAiRecovery(null);setMessage(`AI level ${requestedAiLevel} is calculating on Dartio…`);void requestPremiumAiTurn({level:requestedAiLevel,score:next.scores[1]??start,opened:next.opened[1]??false,inRule,outRule},{signal:controller.signal}).then(values=>{if(generation!==aiGeneration.current||controller.signal.aborted)return;let result=next;try{for(const value of values){if(result.status!=="playing"||result.currentPlayer!==1)throw new AiTurnClientError("invalid_response",200);result=applyDart(result,value)}if(result.status==="playing"&&result.currentPlayer===1)throw new AiTurnClientError("invalid_response",200)}catch(problem){premiumFailure(problem,generation);return}if(generation!==aiGeneration.current||controller.signal.aborted)return;aiController.current=null;commitDarts(values)}).catch(problem=>{if(controller.signal.aborted)return;premiumFailure(problem,generation)})}
  function queueAiTurn(next:X01State){if(premiumReady)queuePremiumAiTurn(next);else queueLocalAiTurn(next,level)}
  /**
   * Appends events, then reacts to the state they produce. Every scoring path —
   * board, keypad, voice, AI — goes through here, so correction and resume
   * behave identically no matter how the dart was recorded.
   */
  function commitEvents(events:readonly X01Event[],announce?:string){if(events.length===0)return;const next=replay({...log,events:[...log.events,...events]});if(next.rejected.length>0){setRejectedNotice("That input does not fit the rules from here.");return}setRejectedNotice(null);setLog(current=>({...current,events:[...current.events,...events]}));const result=next.state;if(announce)setMessage(announce);if(result.status==="complete"){cancelAi();setMessage(settledMessage(result));return}if(result.currentPlayer===1&&isAi){queueAiTurn(result);return}if(!announce)setMessage(`${result.players[result.currentPlayer]?.name} · ${3-result.currentDarts.length} darts`)}
  function commitDarts(values:readonly Dart[]){commitEvents(values.map(dartEvent))}
  function addDart(value:Dart){if(manualInputDisabled)return;const placed=positioned(value);commitEvents([dartEvent(placed)],`${notation(placed)} registered`)}
  function submitAggregate(score:number,dartsThrown:1|2|3){if(manualInputDisabled)return;commitEvents([visitEvent(score,dartsThrown)],`Visit total ${score} registered`)}
  function submitVoiceAggregate(score:number){try{submitAggregate(score,3);}catch(problem){if(problem instanceof AggregateVisitRequiresDartsError){setInputMode("darts");setMessage(problem.reason==="in-rule"?"Enter each dart until you are in":problem.reason==="out-rule"?"Enter each dart to verify the finish":"Finish this visit one dart at a time");}else setMessage(problem instanceof Error?problem.message:"That visit cannot be recorded");}}
  function refuseSyntheticEnd(){setInputMode("darts");setMessage("Record every dart, including misses, before ending the visit");}
  function undo(){cancelAi();setAiRecovery(null);setRejectedNotice(null);if(log.events.length===0)return;setLog(undoLastEvent(log));setMessage("Latest entry removed")}
  /**
   * Rewinds to just before a completed visit so it can be thrown again. Cutting
   * a visit out of the middle instead would hand every later visit to the wrong
   * player, because the log records what was thrown and turn order decides who
   * threw it.
   */
  function correctVisit(visitIndex:number){cancelAi();setAiRecovery(null);const rewound=rewindToVisit(log,visitIndex);const dropped=log.events.length-rewound.events.length;setLog(rewound);setCorrection(false);setRejectedNotice(null);setMessage(`Rewound ${dropped} ${dropped===1?"entry":"entries"} · throw the visit again`)}
  function openCorrection(){cancelAi();setAiRecovery(null);setCorrection(true);setMessage("AI paused while you review the latest dart")}
  function closeCorrection(){setCorrection(false);if(game.status==="playing"&&game.currentPlayer===1&&isAi)queueAiTurn(game)}
  function retryPremiumAi(){if(game.status!=="playing"||game.currentPlayer!==1||!isAi)return;queuePremiumAiTurn(game)}
  function continueWithLevelEight(){cancelAi();setContinueAtEight(true);setAiRecovery(null);setMessage("Continuing this match with AI level 8");if(game.status==="playing"&&game.currentPlayer===1&&isAi)queueLocalAiTurn(game,8)}
  const keyboard=useMatchKeyboard({onDart:addDart,onUndo:undo,disabled:manualInputDisabled});
  function boardClick(e:React.MouseEvent<SVGSVGElement>){const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)*320/rect.width,y=(e.clientY-rect.top)*320/rect.height;addDart(scoreBoardPoint({x:(x-BOARD_CENTER)/BOARD_RADIUS,y:(y-BOARD_CENTER)/BOARD_RADIUS}));}
  // The active input mode drives the phone layout: the board only claims the
  // screen while it is the thing being tapped. See src/app/match-layout.css.
  return <div className="match-page" data-input-mode={inputMode}>
    <header className="match-header"><div><span className={game.status==="playing"?"match-live":"match-complete"}>{game.status==="playing"&&<i />} {game.status==="playing"?`LEG ${game.legNumber} · LIVE`:"MATCH COMPLETE"}</span><b>{start} / best of {bestOf}</b></div><div className="match-tools"><span>{isAi?`AI level ${level}`:"Local match"}</span><IconButton label="Correct last dart" onClick={openCorrection} disabled={correctableVisits===0}>✎</IconButton><IconButton label="Undo last dart" onClick={undo} disabled={!canUndo}>↶</IconButton></div></header>
    {(resumed||rejectedNotice)&&<div className="match-notice" role="status">{rejectedNotice??"Resumed the match that was in progress on this device."}<button type="button" onClick={()=>{setResumed(false);setRejectedNotice(null)}}>Dismiss</button></div>}
    {premiumRequested&&<div className={`ai-access-status ${accessChecking?"checking":continueAtEight?"continued":access.status==="unavailable"?"unavailable":premiumReady?"verified":"required"}`} role={accessChecking||access.status==="unavailable"?"status":undefined}><b>{accessChecking?"CHECKING PRO ACCESS":continueAtEight?"LEVEL 8 CONTINUATION":access.status==="unavailable"?"VERIFICATION UNAVAILABLE":premiumReady?"PRO AI VERIFIED":"PRO REQUIRED"}</b><span>{accessChecking?"Scoring inputs are paused until Dartio verifies this level.":continueAtEight?"This match will stay on local AI level 8.":access.status==="unavailable"?"Dartio could not verify paid access, so this match is using local level 8.":premiumReady?`Level ${requestedAiLevel} visits are authorized by Dartio’s server.`:`Level ${requestedAiLevel} needs Pro. This match is continuing at local level 8.`}</span></div>}
    <section className="score-race" aria-label="Scoreboard"><div className={`score-player ${game.currentPlayer===0&&game.status==="playing"?"active":""}`}><span>{game.players[0]?.name??"Player 1"} <i>{game.status==="complete"?"finished":game.currentPlayer===0?"at the oche":"waiting"}</i></span><strong>{you}</strong><small>{stats[0]?.dartsThrown?`${stats[0].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div><div className="leg-score"><span>{game.options.setsToWin>1?"SETS · LEGS":"LEGS"}</span><b>{game.options.setsToWin>1?`${game.sets[0]}–${game.sets[1]} · `:""}{game.legs[0]} — {game.legs[1]}</b></div><div className={`score-player opponent ${game.currentPlayer===1&&game.status==="playing"?"active":""}`}><span>{game.players[1]?.name??"Player 2"} <i>{game.status==="complete"?"finished":isAi?`LV ${level}`:game.currentPlayer===1?"at the oche":"waiting"}</i></span><strong>{ai}</strong><small>{stats[1]?.dartsThrown?`${stats[1].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div></section>
    {game.status==="complete"&&<MatchResult players={game.players} winnerId={game.winnerId} legs={game.legs} averages={stats.map(value=>value.threeDartAverage)} />}
    <div className="match-grid">
      <section className="board-zone"><div className="board-wrap"><svg className="dartboard" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" role="button" tabIndex={manualInputDisabled?-1:0} aria-disabled={manualInputDisabled} aria-label="Dartboard. Click a landing point to record a dart. Press Enter to record treble twenty." onClick={boardClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();addDart(dart(20,3));}}}>
        <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r="151" className="board-shadow"/>
        {SEGMENTS.map((number,index)=>{const center=index*18-90,start=center-9,end=center+9;const label=polar(145,center);const bed=index%2===0?"bed-dark":"bed-light";const color=index%2===0?"ring-red":"ring-green";return <g key={number} data-segment={number}><path d={ringPath(R.outerBull,R.trebleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.trebleInner,R.trebleOuter,start,end)} className={`board-bed ${color}`}/><path d={ringPath(R.trebleOuter,R.doubleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.doubleInner,R.outer,start,end)} className={`board-bed ${color}`}/><text x={label.x} y={label.y} className="board-number">{number}</text></g>})}
        <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.outerBull} className="outer-bull"/><circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.innerBull} className="inner-bull"/>
        <g className="board-wires" aria-hidden="true">{[R.innerBull,R.outerBull,R.trebleInner,R.trebleOuter,R.doubleInner,R.outer].map(radius=><circle key={radius} cx={BOARD_CENTER} cy={BOARD_CENTER} r={radius}/>)}{SEGMENTS.map((number,index)=>{const point=polar(R.outer,index*18-99),inner=polar(R.outerBull,index*18-99);return <line key={number} x1={inner.x} y1={inner.y} x2={point.x} y2={point.y}/>})}</g>
        {darts.map((d,i)=>{const marker=projectDartMarker(d),x=BOARD_CENTER+marker.x*BOARD_RADIUS,y=BOARD_CENTER+marker.y*BOARD_RADIUS;return <g key={`${notation(d)}-${i}`} className={`throw-mark${marker.offBoard?" off-board":""}`} data-off-board={marker.offBoard||undefined}><title>{marker.offBoard?`Dart ${i+1}: off-board miss`:`Dart ${i+1}: ${notation(d)}`}</title><circle cx={x} cy={y} r="7"/><text x={x} y={y+3}>{marker.offBoard?"×":i+1}</text></g>})}
      </svg><div className="board-caption"><span>Tap the landing point</span><small>or use score entry below</small></div></div></section>
      <aside className="match-side">
        <CheckoutCompanion advice={checkout} playerName={game.players[game.currentPlayer]?.name??`Player ${game.currentPlayer+1}`} interactive={!isAi||game.currentPlayer===0} tier={checkoutTier} upgrading={advancedCheckout.pending} />
        <VisitEntry darts={darts} disabled={manualInputDisabled} mode={inputMode} onModeChange={setInputMode} onDart={addDart} onAggregate={submitAggregate} />
        <VoiceControl disabled={manualInputDisabled} onDart={(segment,multiplier)=>addDart(dart(segment as Dart["segment"],multiplier))} onTurnScore={submitVoiceAggregate} onUndo={undo} onNextPlayer={refuseSyntheticEnd} />
      </aside>
      <section className="history-strip" id="visit-history" tabIndex={-1}><header><h2>Visit history</h2><button onClick={undo} disabled={!canUndo}>Undo latest</button></header>{!game.turns.length?<div className="empty-history"><span>↗</span><p>The first visit will appear here.</p></div>:<ol>{[...game.turns].reverse().slice(0,6).map((turn,i)=>{const player=game.players.find(value=>value.id===turn.playerId),visitScore=turn.source==="aggregate"?(turn.aggregateScore??0):turn.darts.reduce((total,value)=>total+value.score,0);return <li key={`${turn.legNumber}-${turn.playerId}-${game.turns.length-i}`}><span>{(player?.name??"Player").toUpperCase()}</span><div>{turn.source==="aggregate"?<b className="aggregate-visit">TOTAL {turn.aggregateScore} · {turn.dartsThrown} DART{turn.dartsThrown===1?"":"S"}</b>:turn.darts.map((d,j)=><b key={`${notation(d)}-${j}`}>{notation(d)}</b>)}</div><strong>{visitScore}</strong><small>LEG {turn.legNumber} · {turn.bust?"BUST":`${turn.scoreAfter} left`}</small></li>})}</ol>}</section>
    </div>
    <CommandDock className="match-dock"><span aria-live="polite">{message}</span>{keyboard.pending!==""&&<span className="keyboard-buffer" aria-hidden="true">{keyboard.pending} · Enter single · D double · T treble</span>}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span><div className={aiRecovery?"ai-access-actions":undefined}>{aiRecovery&&<><span className="ai-access-recovery" role="alert">{aiRecovery.message}</span><button onClick={retryPremiumAi}>{aiRecovery.kind==="denied"?"Check again":"Retry"}</button><button onClick={continueWithLevelEight}>Continue at level 8</button></>}<button onClick={undo} disabled={!canUndo}>Undo</button><button onClick={openCorrection} disabled={correctableVisits===0}>Correct latest dart</button></div></CommandDock>
    <Modal open={correction} onClose={closeCorrection} title="Correct a visit"><div className="correction-body"><p>Pick the visit that was recorded wrongly. The match rewinds to just before it, and you throw it again from there. Everything before it stands.</p>{correctableVisits===0?<p className="correction-empty">No completed visit yet. Use Undo to take back the darts in this visit.</p>:<ol className="correction-visits">{game.turns.map((turn,index)=>{const scored=turn.bust?0:turn.scoreBefore-turn.scoreAfter;return <li key={`${turn.legNumber}-${index}`}><div><span>{game.players.find(player=>player.id===turn.playerId)?.name??"Player"}</span><b>{turn.source==="aggregate"?`TOTAL ${turn.aggregateScore}`:turn.darts.map(notation).join(" ")||"—"}</b><small>LEG {turn.legNumber} · {turn.bust?"BUST":`${scored} scored`}</small></div><Button size="sm" variant="secondary" onClick={()=>correctVisit(index)}>Rewind here</Button></li>})}</ol>}<Button variant="secondary" onClick={closeCorrection}>Keep current score</Button></div></Modal>
  </div>;
}
