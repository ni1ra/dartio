# Dartio Functionality Recon — 2026-07-17

This inventory describes user-visible function only. It does not score layout, navigation, branding, or visual taste. It was derived from the fresh greenfield Dartio repository; no legacy Dartio code was inspected or reused.

## What is real today

- Configure X01 with 301, 501, 701, or 1001; best-of 1/3/5/7; straight/double/master in; straight/double/master out; local pass-and-play or AI level 1–20.
- Play an immutable in-memory X01 match with bust rollback, three-dart turns, legs, sets in the domain model, rotating leg starters, completion, and per-dart undo.
- Record darts through the regulation visual board, aggregate turn score, seven quick-dart presets, or authenticated voice transcription.
- See current-visit dart markers, scores, visit history, average display, correction/undo actions, and checkout guidance update with match state.
- Play a local friend on the same device. This is real pass-and-play, not an online room.
- Play AI levels 1–20 whose physical Gaussian miss spread strictly decreases by level and is scored by the same board geometry as human throws.
- Use a dynamic checkout planner that exhaustively validates legal 1–3-dart routes for straight/double/master out; ranks conventional professional paths; returns unique alternatives; detects all seven three-dart double-out bogeys; plans full setup visits; returns target leave and explanations; supports preferred doubles/trebles and bull avoidance; and replans after each dart.
- Use push-to-talk OpenAI transcription with visible recording, processing, confirmation, ambiguity, permission, privacy, and error states. Parsed dart/score/undo/next-player commands feed the X01 path after explicit confirmation.
- Create a Neon Auth account, sign in, persist the verified identity/profile, inspect the account session, sign out, and recover from session errors.
- Select Pro or Club monthly/annual billing, complete Stripe Checkout in sandbox, open Customer Portal, and project signed/idempotent subscription events into Neon with cancellation, reactivation, grace, and exact `cancel_at` semantics.
- Switch among Navi UI black, silver, and blood themes. Dartio `1.0.0` resolves the tagged Navi UI `1.0.0` GitHub release artifact.

## Reachable X01 options and their function

- Starting score controls the initial remainder for every player.
- Best-of controls `legsToWin = ceil(bestOf / 2)` for the reachable single-set match.
- Straight in scores immediately; double in requires the first qualifying double; master in accepts a double or treble.
- Straight out permits any scoring bed to finish; double out requires a double; master out accepts a double or treble.
- A bust restores the player’s score to the beginning of the visit and advances the turn.
- Local opponent disables AI automation and alternates the same device between two players.
- AI level changes physical spread from 1 through 20, but currently does not provide 20 separately calibrated tactical strategies.

## Honest gaps and misleading surfaces

- Cricket, Around the Clock, Shanghai, Count-Up, Bob’s 27, Checkout Lab, Doubles Matrix, and Scoring Sprint are catalog rows, not playable games.
- Online friend hosting, joining, reconnect, spectators, and server-authoritative play are absent; the current friends form deliberately ends in an unavailable state.
- Local player two is still labeled as “The Navigator”/AI in parts of the match UI.
- The match header is fixed to `LEG 1`; the final completed-leg scoreboard can reset before display; the shown average is not yet a regulation darts-per-visit calculation.
- Aggregate turn entry reconstructs fictional darts. Under double/master-in or other sequence-sensitive rules, that reconstruction can change the result from what was physically thrown.
- “Each dart” exposes only T20, T19, T18, D20, D16, double bull, and miss; it is not a complete companion input.
- Correction only undoes the latest dart; arbitrary earlier visit/dart repair and deterministic replay are absent.
- Match state is ephemeral. Reload loses the match; account history, cross-device continuity, stats, and historical board replay are absent despite schema/marketing foundations.
- AI levels alter accuracy but share a shallow aim policy: bull at 50, direct low doubles, T20 otherwise. Professional setup strategy, bogey avoidance, route planning, level-specific decision quality, and league-band calibration remain open.
- Voice `confirm`/`cancel` words are parsed but not fully applied as control dialogue. “Always-on” currently means one 4.5-second clip, review, pause, and manual resume—not continuous hands-free listening with silence segmentation and automatic re-arming.
- Stripe entitlements are projected but not consumed by product features. AI 9–20, advanced checkout, and authenticated voice do not yet enforce the advertised plan boundaries; several paid benefits do not exist yet.
- Account does not yet show current plan, trial/grace/cancellation state, entitlement list, match history, stats, rooms, or practice progress.

## Ranked next functional slices

1. Entitled X01 continuity: fail-closed plan consumption, honest locked states, correct local identity/leg/average semantics, canonical input events, deterministic correction, and active-match resume.
2. Persistent X01 history and small honest statistics, with signed-in Neon sync and anonymous on-device resume.
3. AI credibility calibration: use checkout/setup strategy, preferences and bogey avoidance, then benchmark monotonic average, checkout rate, and win strength across levels 1–20.
4. Complete per-dart companion input and rule-safe aggregate visit semantics shared by board, keyboard, voice, and AI.
5. Cricket as the second full mode, proving a reusable mode/session/event architecture with standard/cut-throat, points, rounds, and companion input.
6. Remaining core and practice modes with mode-specific perfect inputs and voice commands.
7. True always-listening voice with voice-activity/silence segmentation, automatic re-arming, queued confirmation/correction, and mode-wide commands.
8. Server-authoritative friend rooms with create/join codes, versioned events, reconnect, ownership, spectators, and conflict recovery.
9. Club member seats, invites, administration, shared boards, and league/session continuity.
10. Production release closure: entitlement proof, live pricing activation, production webhook/Portal proof, observability, rollback, and post-deploy stories.

## Recommended next acceptance slice

“Entitled X01 Continuity” should prove: free anonymous AI through level 8; active Pro AI 9–20/advanced checkout/paid voice; fail-closed expired or canceled access with defined grace; correct local player labels; no fictional double/master-in aggregate visits; regulation three-dart average; deterministic visit correction; exact reload resume; signed-in completed-match history; and one canonical event path for every input surface.
