"use client";

import { BOARD_CLOCKWISE, BOARD_RADII, dart, notation, representativePoint, scoreBoardPoint, type Dart } from "@/domain";
import { projectDartMarker } from "@/lib/product/dart-marker";

/**
 * The regulation board, shared by every mode.
 *
 * Geometry lives here once so a new mode inherits a proven renderer rather than
 * copying it: the bed proportions, the wire positions, and the click-to-score
 * mapping are the same object Cricket and X01 both point at. Any change here
 * re-runs `tests/browser/dartboard.spec.ts` at all three viewports.
 */
const SEGMENTS = BOARD_CLOCKWISE;
const BOARD_CENTER=160,BOARD_RADIUS=136;
const R={innerBull:BOARD_RADII.innerBull*BOARD_RADIUS,outerBull:BOARD_RADII.outerBull*BOARD_RADIUS,trebleInner:BOARD_RADII.trebleInner*BOARD_RADIUS,trebleOuter:BOARD_RADII.trebleOuter*BOARD_RADIUS,doubleInner:BOARD_RADII.doubleInner*BOARD_RADIUS,outer:BOARD_RADII.outer*BOARD_RADIUS};
function polar(radius:number,degrees:number){const angle=degrees*Math.PI/180,round=(value:number)=>Math.round(value*10_000)/10_000;return{x:round(BOARD_CENTER+radius*Math.cos(angle)),y:round(BOARD_CENTER+radius*Math.sin(angle))}}
function ringPath(inner:number,outer:number,start:number,end:number){const a=polar(outer,start),b=polar(outer,end),c=polar(inner,end),d=polar(inner,start);return `M${a.x} ${a.y} A${outer} ${outer} 0 0 1 ${b.x} ${b.y} L${c.x} ${c.y} A${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;}
function positioned(value:Dart):Dart{return value.x!==undefined&&value.y!==undefined?value:dart(value.segment,value.multiplier,representativePoint(value))}

export interface DartboardProps {
  readonly darts: readonly Dart[];
  readonly disabled?: boolean;
  readonly onDart: (value: Dart) => void;
  /** Shown under the board. Modes word their own instruction. */
  readonly caption?: string;
  readonly hint?: string;
}

export function Dartboard({ darts, disabled = false, onDart, caption = "Tap the landing point", hint = "or use score entry below" }: DartboardProps) {
  function boardClick(e:React.MouseEvent<SVGSVGElement>){const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)*320/rect.width,y=(e.clientY-rect.top)*320/rect.height;if(disabled)return;onDart(scoreBoardPoint({x:(x-BOARD_CENTER)/BOARD_RADIUS,y:(y-BOARD_CENTER)/BOARD_RADIUS}))}
  return <div className="board-wrap"><svg className="dartboard" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label="Dartboard. Click a landing point to record a dart. Press Enter to record treble twenty." onClick={boardClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();if(!disabled)onDart(dart(20,3))}}}>
    <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r="151" className="board-shadow"/>
    {SEGMENTS.map((number,index)=>{const center=index*18-90,start=center-9,end=center+9;const label=polar(145,center);const bed=index%2===0?"bed-dark":"bed-light";const color=index%2===0?"ring-red":"ring-green";return <g key={number} data-segment={number}><path d={ringPath(R.outerBull,R.trebleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.trebleInner,R.trebleOuter,start,end)} className={`board-bed ${color}`}/><path d={ringPath(R.trebleOuter,R.doubleInner,start,end)} className={`board-bed ${bed}`}/><path d={ringPath(R.doubleInner,R.outer,start,end)} className={`board-bed ${color}`}/><text x={label.x} y={label.y} className="board-number">{number}</text></g>})}
    <circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.outerBull} className="outer-bull"/><circle cx={BOARD_CENTER} cy={BOARD_CENTER} r={R.innerBull} className="inner-bull"/>
    <g className="board-wires" aria-hidden="true">{[R.innerBull,R.outerBull,R.trebleInner,R.trebleOuter,R.doubleInner,R.outer].map(radius=><circle key={radius} cx={BOARD_CENTER} cy={BOARD_CENTER} r={radius}/>)}{SEGMENTS.map((number,index)=>{const point=polar(R.outer,index*18-99),inner=polar(R.outerBull,index*18-99);return <line key={number} x1={inner.x} y1={inner.y} x2={point.x} y2={point.y}/>})}</g>
    {darts.map((d,i)=>{const marker=projectDartMarker(d),x=BOARD_CENTER+marker.x*BOARD_RADIUS,y=BOARD_CENTER+marker.y*BOARD_RADIUS;return <g key={`${notation(d)}-${i}`} className={`throw-mark${marker.offBoard?" off-board":""}`} data-off-board={marker.offBoard||undefined}><title>{marker.offBoard?`Dart ${i+1}: off-board miss`:`Dart ${i+1}: ${notation(d)}`}</title><circle cx={x} cy={y} r="7"/><text x={x} y={y+3}>{marker.offBoard?"×":i+1}</text></g>})}
  </svg><div className="board-caption"><span>{caption}</span><small>{hint}</small></div></div>;
}

export { positioned };
