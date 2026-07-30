"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Surface, TextField } from "navi-ui";
import { hasAccessEntitlement } from "@/lib/product/access-contract";
import { createRoom, joinRoom, readRoom, type RoomFailure, type RoomStateView } from "@/lib/product/rooms-client";
import { useAccess } from "./access-provider";

/**
 * Rooms: open one, or take a seat in one.
 *
 * This page used to accept a six-character code, wait 700 ms on a `setTimeout`, and
 * always answer "that room isn't live" — there was nothing behind it. There is now:
 * a room is a real row, a seat is a real row, and the code is what connects them.
 *
 * The lobby is where a table fills up. Once two people are seated it hands off to
 * the match itself, which rebuilds the game from the room's own record — so the
 * lobby holds no game state of its own and nothing is lost by leaving it.
 */

/** Poll only while somebody is looking at the lobby, and give up rather than hammer a dead endpoint. */
const POLL_MS = 4000;
const MAX_CONSECUTIVE_FAILURES = 3;

const FAILURE_COPY: Record<RoomFailure, string> = {
  upgrade_required: "Online rooms are part of Pro.",
  authentication_required: "Sign in to open or join a room.",
  room_not_found: "That room isn’t live. Check the code — it expires after 12 hours.",
  room_full: "That room is full.",
  room_closed: "That room’s match has already finished.",
  invalid_room_request: "That code doesn’t look right.",
  version_conflict: "Somebody threw first. Catching up.",
  wrong_seat: "That seat isn’t yours.",
  rooms_unavailable: "Rooms are unreachable right now. Nothing was lost.",
};

export function FriendsRoom() {
  const access = useAccess();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"idle" | "hosting" | "joining">("idle");
  const [failure, setFailure] = useState<RoomFailure | null>(null);
  const [room, setRoom] = useState<RoomStateView | null>(null);
  const [lost, setLost] = useState(false);
  const failures = useRef(0);

  /*
   * Gated on the entitlement alone, not on PRODUCT_AVAILABILITY. That map still
   * reads `onlineMultiplayer: "coming_soon"` and stays that way until a room can be
   * played in — opening and joining one works today, and the map has no word for
   * half a feature. The copy below carries that distinction instead.
   */
  const entitled = access.status === "ready" && hasAccessEntitlement(access.snapshot, "online_multiplayer");
  const joined = room?.code ?? null;

  const refresh = useCallback(async (target: string, signal: AbortSignal) => {
    // Always read from 0: the lobby shows the whole table, not a delta.
    const result = await readRoom(target, 0, { signal });
    if (signal.aborted) return;
    if (result.ok) {
      failures.current = 0;
      setRoom(result.value);
      return;
    }
    failures.current += 1;
    if (failures.current >= MAX_CONSECUTIVE_FAILURES) setLost(true);
  }, []);

  useEffect(() => {
    if (!joined || lost) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => void refresh(joined, controller.signal), POLL_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [joined, lost, refresh]);

  async function host() {
    setBusy("hosting"); setFailure(null);
    const result = await createRoom({ mode: "x01", options: { startingScore: 501, legsToWin: 3, setsToWin: 1, inRule: "straight", outRule: "double" } });
    setBusy("idle");
    if (!result.ok) { setFailure(result.failure); return; }
    const controller = new AbortController();
    await refresh(result.value.code, controller.signal);
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy("joining"); setFailure(null);
    const result = await joinRoom(code);
    setBusy("idle");
    if (!result.ok) { setFailure(result.failure); return; }
    const controller = new AbortController();
    await refresh(result.value.code, controller.signal);
  }

  return <div className="page-frame friends-page">
    <header className="page-heading">
      <p className="eyebrow">Play together</p>
      <h1>The pub table,<br /><em>without the travel.</em></h1>
      <p>Open a room, send one short code, and everybody sits at the same table. The room keeps one shared record of the match, in one order, so two phones can never disagree about what was thrown.</p>
    </header>

    {room ? <RoomLobby room={room} lost={lost} onLeave={() => { setRoom(null); setLost(false); failures.current = 0; }} />
      : <div className="friends-actions">
        <Surface className="create-room">
          <span className="giant-number">01</span>
          <h2>Host a room</h2>
          <p>Opens a 501 room and gives you a six-character code to send. It stays live for 12 hours.</p>
          {entitled
            ? <Button size="lg" onClick={() => void host()} disabled={busy !== "idle"}>{busy === "hosting" ? "Opening…" : "Open a room"}</Button>
            : <Link className="button-link button-link-lg" href="/pricing">Online rooms are Pro</Link>}
          <small>{access.status === "loading" ? "Checking your membership…" : "Local friend play needs no account and works now from X01 setup."}</small>
        </Surface>

        <Surface className="join-room">
          <span className="giant-number">02</span>
          <h2>Join a friend</h2>
          <form onSubmit={(event) => void join(event)}>
            <TextField label="Room code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="OCHE42" maxLength={6} />
            <Button type="submit" variant="secondary" disabled={code.length !== 6 || busy !== "idle" || !entitled}>{busy === "joining" ? "Finding room…" : "Join room"}</Button>
          </form>
          {failure && <p className="form-error" role="alert">{FAILURE_COPY[failure]}{failure === "upgrade_required" && <> <Link href="/pricing">See Pro</Link>.</>}</p>}
        </Surface>
      </div>}

    <div className="room-foundation">
      <span>Live · one shared record, in one order</span>
      <span>Live · a seat is yours and nobody can throw from it</span>
      <span>Live · rejoin from any screen and the match rebuilds itself</span>
      <span>Planned · spectators and host handover</span>
    </div>
  </div>;
}

function RoomLobby({ room, lost, onLeave }: { room: RoomStateView; lost: boolean; onLeave: () => void }) {
  return <Surface className="room-lobby">
    <div className="room-lobby-head">
      <div>
        <span className="account-state-code">ROOM CODE</span>
        <strong className="room-code">{room.code}</strong>
      </div>
      <Button variant="secondary" onClick={onLeave}>Leave lobby</Button>
    </div>
    <p>Send that code to whoever is playing. Everyone who joins appears here.</p>
    <ol className="room-seats">
      {room.seats.map((seat) => <li key={seat.seat}>
        <span className="room-seat-index">{String(seat.seat + 1).padStart(2, "0")}</span>
        <b>{seat.displayName}{seat.isYou && <em> · you</em>}</b>
        <small>{seat.role}</small>
      </li>)}
    </ol>
    {room.seats.length > 1
      ? <Link className="button-link button-link-lg" href={`/play/match?room=${room.code}`}>Go to the oche</Link>
      : <p className="room-lobby-note">Waiting for somebody to join. Send them the code — the match starts as soon as a second player sits down.</p>}
    {lost
      ? <p className="form-error" role="alert">Lost contact with the room. Your seat is still held — reopen this page to pick it back up.</p>
      : <p className="room-lobby-note">The room is at version {room.version}. A visit filed against an older version is refused rather than silently overwriting somebody.</p>}
  </Surface>;
}
