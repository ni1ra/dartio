"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import { AggregateVisitRequiresDartsError, applyDart, basicCheckoutAdvice, chooseX01Aim, createLog, dart, dartEvent, notation, replay, rewindToVisit, undoLastEvent, visitEvent, x01MatchRecord, x01PlayerStats, type Dart, type InRule, type OutRule, type X01Event, type X01Log, type X01State } from "@/domain";
import { seededRandom, throwAiDart } from "@/domain/ai-throw";
import { clearActiveMatch, loadActiveMatch, matchesSetup, saveActiveMatch } from "@/lib/product/match-store";
import { requestPremiumAiThrow } from "@/lib/product/ai-throw-client";
import { collectAiVisit } from "@/lib/product/ai-visit";
import { opponentSeatIdentity } from "@/lib/product/ai-match-identity";
import { Dartboard, positioned } from "./dartboard";
import { TargetIcon } from "./icons";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";
import { useAdvancedCheckout } from "./use-advanced-checkout";
import { useMatchKeyboard } from "./use-match-keyboard";
import { VoiceControl } from "./voice-control";
import { CheckoutCompanion } from "./checkout-companion";
import { MatchResult } from "./match-result";
import { useRecordMatch } from "./use-record-match";
import { VisitEntry } from "./visit-entry";
import { OpponentAiAccessBanner, useOpponentAiAccess } from "./opponent-ai-access";
import { describeAiFailure, describeAiRefresh, type AiRecovery } from "./opponent-ai-recovery";
import { useAiVisit } from "./use-ai-visit";
import { useScreenWakeLock } from "./use-screen-wake-lock";

export function X01Match() {
  const params=useSearchParams();
  const productAccess=useAccess();
  const levelParam=params.get("level"),requestedStart=Number(params.get("start")),requestedLevel=levelParam===null||levelParam.trim()===""?Number.NaN:Number(levelParam),requestedBest=Number(params.get("best"));
  const start=[301,501,701,1001].includes(requestedStart)?requestedStart:501,requestedAiLevel=Number.isInteger(requestedLevel)?Math.min(20,Math.max(1,requestedLevel)):8,bestOf=[1,3,5,7].includes(requestedBest)?requestedBest:5;
  const inParam=params.get("in"),outParam=params.get("out"),inRule:InRule=inParam==="double"||inParam==="master"?inParam:"straight",outRule:OutRule=outParam==="straight"||outParam==="master"?outParam:"double",isAi=params.get("opponent")!=="local";
  const storageScope=isAi?`ai-${requestedAiLevel}`:"local";
  const aiAccess=useOpponentAiAccess(isAi,requestedAiLevel);
  const restoreLevelEight=aiAccess.continueAtEight;
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
  useScreenWakeLock(game.status==="playing");
  /**
   * The authoritative log, readable synchronously.
   *
   * `commitEvents` used to fold over the `log` captured in its closure. That is
   * correct for a click, which is handled with a fresh render's closure, but the
   * AI commits from inside a `setTimeout` whose closure was created a visit
   * earlier. It therefore appended to a stale log and — worse — decided from the
   * stale result whose turn it now was, so it re-queued itself forever, scored
   * against whichever player the stale turn order named, and made scores jump
   * back up as busts replayed. A ref is updated in the same tick as the append,
   * so the next commit always folds over what actually happened.
   */
  const logRef=useRef<X01Log>(freshLog);
  const [inputMode,setInputMode]=useState<"board"|"score"|"darts">("board"), [correction,setCorrection]=useState(false), [message,setMessage]=useState("Your throw · 3 darts");
  const [aiRecovery,setAiRecovery]=useState<AiRecovery|null>(null);
  const [aiLevelsUsed,setAiLevelsUsed]=useState<readonly number[]>([]);
  // Consent is intentionally match-local. History is never read merely because
  // the account is Pro, and a reload returns this choice to off.
  const [personalizeCheckout,setPersonalizeCheckout]=useState(false);
  const retryGeneration=useRef(0);
  const level=aiAccess.level;
  const manualInputDisabled=game.status==="complete"||(isAi&&game.currentPlayer!==0)||aiAccess.accessChecking;
  const you=game.scores[0]??start,ai=game.scores[1]??start,darts=game.currentDarts,checkoutScore=game.scores[game.currentPlayer]??start;
  // Any completed visit can be corrected now, not only the latest dart.
  const correctableVisits=game.turns.length;
  /*
   * A finished match is finished. Scoring input already stops at "complete" and so
   * does the keyboard scheme; only these two controls were left live, which meant a
   * player could finish, rewind past the winning dart, and finish again — and
   * history would still hold the first version, because the record is filed once.
   */
  const canUndo=game.status!=="complete"&&log.events.length>0;
  const canCorrect=game.status!=="complete"&&correctableVisits>0;
  const dartsInHand=Math.max(1,3-darts.length) as 1|2|3;
  // Free scoring never waits on the network: the basic route renders now and the
  // server-authorized advanced advice replaces it in place when it arrives.
  const basicCheckout=useMemo(()=>basicCheckoutAdvice(checkoutScore,dartsInHand,outRule),[checkoutScore,dartsInHand,outRule]);
  const advancedEntitled=productAccess.status==="ready"&&isProductAvailable(productAccess.snapshot,"advancedCheckout")&&hasAccessEntitlement(productAccess.snapshot,"advanced_checkout");
  // Stored history belongs to seat zero. Local opponents and the Navigator get
  // standard Pro routes even while the owner has personalization enabled.
  const personalizationAvailable=advancedEntitled&&game.currentPlayer===0;
  const advancedCheckout=useAdvancedCheckout(game.status==="playing"?{score:checkoutScore,dartsAvailable:dartsInHand,outRule}:null,advancedEntitled,personalizationAvailable&&personalizeCheckout);
  const checkout=advancedCheckout.advice??basicCheckout;
  const checkoutTier=advancedCheckout.advice?"advanced":"basic";
  const stats=useMemo(()=>game.players.map(player=>x01PlayerStats(game,player.id)),[game]);

  // Reading the storage key on mount rather than during the initial state
  // computation keeps the server and first client render identical.
  // Deferred a frame so the first client render matches the server's, and so
  // the read never counts as a synchronous setState inside an effect.
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{const stored=loadActiveMatch(storageScope);if(!stored||stored.log.events.length===0||!matchesSetup(stored.log,freshLog))return;logRef.current=stored.log;setLog(stored.log);setAiLevelsUsed(stored.aiLevelsUsed);if(stored.continuedAtEight)restoreLevelEight();setResumed(true);setMessage("Match resumed where you left off")});return()=>window.cancelAnimationFrame(frame)},[freshLog,storageScope,restoreLevelEight]);
  useEffect(()=>{if(log.events.length===0)return;saveActiveMatch(log,storageScope,aiAccess.continuedAtEight,aiLevelsUsed)},[log,storageScope,aiAccess.continuedAtEight,aiLevelsUsed]);
  useEffect(()=>{if(game.status==="complete")clearActiveMatch(storageScope)},[game.status,storageScope]);
  // A finished match goes to the player's history. Seat 1 is the AI when there is
  // one; the log records what was thrown, never who threw it, so that is added here.
  const completedRecord=useMemo(()=>game.status==="complete"?x01MatchRecord(log,[{},opponentSeatIdentity(isAi,level,aiLevelsUsed)]):null,[game.status,log,isAi,level,aiLevelsUsed]);
  useRecordMatch(completedRecord);

  const aiVisit=useAiVisit<{readonly darts:readonly Dart[];readonly level:number}>({
    ready:isAi&&game.status==="playing"&&game.currentPlayer===1&&!aiAccess.accessChecking&&aiRecovery===null&&!correction,
    revision:log.events.length,
    generate:async(signal)=>{
      const current=replay(logRef.current).state;
      const executionLevel=aiAccess.level;
      const premium=aiAccess.premiumReady;
      const random=seededRandom(current.turns.length*101+executionLevel);
      setMessage(premium?`AI level ${executionLevel} is calculating on Dartio…`:`AI level ${executionLevel} is at the oche…`);
      const values=await collectAiVisit({
        initial:current,
        signal,
        rules:{
          continues:(state)=>state.status==="playing"&&state.currentPlayer===1,
          boundary:(state)=>state.turns.length,
          target:(state)=>chooseX01Aim(state,1,executionLevel),
          apply:applyDart,
        },
        sample:premium
          ? (target,currentSignal)=>requestPremiumAiThrow({level:executionLevel,target},{signal:currentSignal})
          : async(target)=>throwAiDart(executionLevel,target,random).dart,
      });
      return {darts:values,level:executionLevel};
    },
    commit:(visit)=>{setAiRecovery(null);setAiLevelsUsed(current=>current.includes(visit.level)?current:[...current,visit.level]);if(aiAccess.premiumRequested&&visit.level===8)aiAccess.continueAtEight();commitDarts(visit.darts)},
    fail:(problem)=>{
      const recovery=describeAiFailure(problem);
      setAiRecovery(recovery);
      setMessage(recovery.announcement);
    },
  });
  useEffect(()=>()=>{retryGeneration.current+=1},[]);

  function cancelPendingAi(){retryGeneration.current+=1;aiVisit.cancel()}

  function settledMessage(result:X01State){return result.status==="complete"?`${result.players.find(player=>player.id===result.winnerId)?.name} wins the match`:"Your throw · 3 darts"}
  /**
   * Appends events, then reacts to the state they produce. Every scoring path —
   * board, keypad, voice, AI — goes through here, so correction and resume
   * behave identically no matter how the dart was recorded.
   */
  function commitEvents(events:readonly X01Event[],announce?:string){if(events.length===0)return;const base=logRef.current;const appended={...base,events:[...base.events,...events]};const next=replay(appended);if(next.rejected.length>0){setRejectedNotice("That input does not fit the rules from here.");return}setRejectedNotice(null);logRef.current=appended;setLog(appended);const result=next.state;if(announce)setMessage(announce);if(result.status==="complete"){setMessage(settledMessage(result));return}if(!announce)setMessage(`${result.players[result.currentPlayer]?.name} · ${3-result.currentDarts.length} darts`)}
  function commitDarts(values:readonly Dart[]){commitEvents(values.map(dartEvent))}
  function addDart(value:Dart){if(manualInputDisabled)return;const placed=positioned(value);commitEvents([dartEvent(placed)],`${notation(placed)} registered`)}
  function submitAggregate(score:number,dartsThrown:1|2|3){if(manualInputDisabled)return;commitEvents([visitEvent(score,dartsThrown)],`Visit total ${score} registered`)}
  function submitVoiceAggregate(score:number){try{submitAggregate(score,3);}catch(problem){if(problem instanceof AggregateVisitRequiresDartsError){setInputMode("darts");setMessage(problem.reason==="in-rule"?"Enter each dart until you are in":problem.reason==="out-rule"?"Enter each dart to verify the finish":"Finish this visit one dart at a time");}else setMessage(problem instanceof Error?problem.message:"That visit cannot be recorded");}}
  function refuseSyntheticEnd(){setInputMode("darts");setMessage("Record every dart, including misses, before ending the visit");}
  function undo(){cancelPendingAi();setAiRecovery(null);setRejectedNotice(null);if(logRef.current.events.length===0)return;const undone=undoLastEvent(logRef.current);logRef.current=undone;setLog(undone);setMessage("Latest entry removed")}
  /**
   * Rewinds to just before a completed visit so it can be thrown again. Cutting
   * a visit out of the middle instead would hand every later visit to the wrong
   * player, because the log records what was thrown and turn order decides who
   * threw it.
   */
  function correctVisit(visitIndex:number){cancelPendingAi();setAiRecovery(null);const rewound=rewindToVisit(logRef.current,visitIndex);const dropped=logRef.current.events.length-rewound.events.length;logRef.current=rewound;setLog(rewound);setCorrection(false);setRejectedNotice(null);setMessage(`Rewound ${dropped} ${dropped===1?"entry":"entries"} · throw the visit again`)}
  function openCorrection(){cancelPendingAi();setAiRecovery(null);setCorrection(true);setMessage("AI paused while you review the latest dart")}
  function closeCorrection(){setCorrection(false)}
  async function retryPremiumAi(){
    if(game.status!=="playing"||game.currentPlayer!==1||!isAi||!aiRecovery)return;
    const attempt=++retryGeneration.current;
    const result=aiRecovery.kind==="denied"||!aiAccess.premiumReady?await aiAccess.refresh():"ready";
    if(attempt!==retryGeneration.current)return;
    const recovery=describeAiRefresh(result);
    if(recovery){
      setAiRecovery(recovery);setMessage(recovery.announcement);return;
    }
    setAiRecovery(null);aiVisit.retry();
  }
  function continueWithLevelEight(){cancelPendingAi();aiAccess.continueAtEight();setAiRecovery(null);setMessage("Continuing this match with AI level 8")}
  const keyboard=useMatchKeyboard({onDart:addDart,onUndo:undo,disabled:manualInputDisabled});
  // The active input mode drives the phone layout: the board only claims the
  // screen while it is the thing being tapped. See src/app/match-layout.css.
  return <div className="match-page" data-input-mode={inputMode}>
    <header className="match-header"><div><span className={game.status==="playing"?"match-live":"match-complete"}>{game.status==="playing"&&<i />} {game.status==="playing"?`LEG ${game.legNumber} · LIVE`:"MATCH COMPLETE"}</span><b>{start} / best of {bestOf}</b></div><div className="match-tools"><span>{isAi?`AI level ${level}`:"Local match"}</span><IconButton label="Correct last dart" onClick={openCorrection} disabled={!canCorrect}>✎</IconButton><IconButton label="Undo last dart" onClick={undo} disabled={!canUndo}>↶</IconButton></div></header>
    {(resumed||rejectedNotice)&&<div className="match-notice" role="status">{rejectedNotice??"Resumed the match that was in progress on this device."}<button type="button" onClick={()=>{setResumed(false);setRejectedNotice(null)}}>Dismiss</button></div>}
    <OpponentAiAccessBanner access={aiAccess} />
    <section className="score-race" aria-label="Scoreboard"><div className={`score-player ${game.currentPlayer===0&&game.status==="playing"?"active":""}`}><span>{game.players[0]?.name??"Player 1"} <i>{game.status==="complete"?"finished":game.currentPlayer===0?"at the oche":"waiting"}</i></span><strong>{you}</strong><small>{stats[0]?.dartsThrown?`${stats[0].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div><div className="leg-score"><span>{game.options.setsToWin>1?"SETS · LEGS":"LEGS"}</span><b>{game.options.setsToWin>1?`${game.sets[0]}–${game.sets[1]} · `:""}{game.legs[0]} — {game.legs[1]}</b></div><div className={`score-player opponent ${game.currentPlayer===1&&game.status==="playing"?"active":""}`}><span>{game.players[1]?.name??"Player 2"} <i>{game.status==="complete"?"finished":isAi?`LV ${level}`:game.currentPlayer===1?"at the oche":"waiting"}</i></span><strong>{ai}</strong><small>{stats[1]?.dartsThrown?`${stats[1].threeDartAverage.toFixed(2)} 3DA`:"No darts yet"}</small></div></section>
    {game.status==="complete"&&<MatchResult players={game.players} winnerId={game.winnerId} legs={game.legs} averages={stats.map(value=>value.threeDartAverage)} />}
    <div className="match-grid">
      <section className="board-zone"><Dartboard darts={darts} disabled={manualInputDisabled} onDart={addDart} /></section>
      <aside className="match-side">
        <CheckoutCompanion advice={checkout} playerName={game.players[game.currentPlayer]?.name??`Player ${game.currentPlayer+1}`} interactive={!isAi||game.currentPlayer===0} tier={checkoutTier} upgrading={advancedCheckout.pending} personalizationAvailable={personalizationAvailable} personalizationEnabled={personalizeCheckout} personalization={advancedCheckout.personalization} onPersonalizationChange={setPersonalizeCheckout} />
        <VisitEntry darts={darts} disabled={manualInputDisabled} mode={inputMode} onModeChange={setInputMode} onDart={addDart} onAggregate={submitAggregate} />
        <VoiceControl revision={log.events.length} disabled={manualInputDisabled||correction} onDart={(segment,multiplier)=>addDart(dart(segment as Dart["segment"],multiplier))} onTurnScore={submitVoiceAggregate} onUndo={undo} onNextPlayer={refuseSyntheticEnd} />
      </aside>
      <section className="history-strip" id="visit-history" tabIndex={-1}><header><h2>Visit history</h2><button onClick={undo} disabled={!canUndo}>Undo latest</button></header>{!game.turns.length?<div className="empty-history"><span><TargetIcon /></span><p>The first visit will appear here.</p></div>:<ol>{[...game.turns].reverse().slice(0,6).map((turn,i)=>{const player=game.players.find(value=>value.id===turn.playerId),visitScore=turn.source==="aggregate"?(turn.aggregateScore??0):turn.darts.reduce((total,value)=>total+value.score,0);return <li key={`${turn.legNumber}-${turn.playerId}-${game.turns.length-i}`}><span>{(player?.name??"Player").toUpperCase()}</span><div>{turn.source==="aggregate"?<b className="aggregate-visit">TOTAL {turn.aggregateScore} · {turn.dartsThrown} DART{turn.dartsThrown===1?"":"S"}</b>:turn.darts.map((d,j)=><b key={`${notation(d)}-${j}`}>{notation(d)}</b>)}</div><strong>{visitScore}</strong><small>LEG {turn.legNumber} · {turn.bust?"BUST":`${turn.scoreAfter} left`}</small></li>})}</ol>}</section>
    </div>
    <CommandDock className="match-dock"><span aria-live="polite">{message}</span>{keyboard.pending!==""&&<span className="keyboard-buffer" aria-hidden="true">{keyboard.pending} · Enter single · D double · T treble</span>}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span><div className={aiRecovery?"ai-access-actions":undefined}>{aiRecovery&&<><span className="ai-access-recovery" role="alert">{aiRecovery.message}</span><button onClick={()=>void retryPremiumAi()} disabled={aiAccess.accessChecking}>{aiRecovery.kind==="denied"?"Check again":"Retry"}</button><button onClick={continueWithLevelEight}>Continue at level 8</button></>}<button onClick={undo} disabled={!canUndo}>Undo</button><button onClick={openCorrection} disabled={!canCorrect}>Correct latest dart</button></div></CommandDock>
    <Modal open={correction} onClose={closeCorrection} title="Correct a visit"><div className="correction-body"><p>Pick the visit that was recorded wrongly. The match rewinds to just before it, and you throw it again from there. Everything before it stands.</p>{correctableVisits===0?<p className="correction-empty">No completed visit yet. Use Undo to take back the darts in this visit.</p>:<ol className="correction-visits">{game.turns.map((turn,index)=>{const scored=turn.bust?0:turn.scoreBefore-turn.scoreAfter;return <li key={`${turn.legNumber}-${index}`}><div><span>{game.players.find(player=>player.id===turn.playerId)?.name??"Player"}</span><b>{turn.source==="aggregate"?`TOTAL ${turn.aggregateScore}`:turn.darts.map(notation).join(" ")||"—"}</b><small>LEG {turn.legNumber} · {turn.bust?"BUST":`${scored} scored`}</small></div><Button size="sm" variant="secondary" onClick={()=>correctVisit(index)}>Rewind here</Button></li>})}</ol>}<Button variant="secondary" onClick={closeCorrection}>Keep current score</Button></div></Modal>
  </div>;
}
