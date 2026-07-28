export const GAME_MODES = {
  x01: { name: "X01", status: "playable", options: ["startingScore", "legsToWin", "setsToWin", "inRule", "outRule"] },
  cricket: { name: "Cricket", status: "playable", options: ["variant", "winByTwo", "roundLimit"] },
  aroundTheClock: { name: "Around the Clock", status: "playable", options: ["targetOrder", "bullFinish"] },
  shanghai: { name: "Shanghai", status: "playable", options: ["rounds", "instantShanghaiWin"] },
  countUp: { name: "Count-Up", status: "playable", options: ["rounds"] },
  bobs27: { name: "Bob's 27", status: "playable", options: ["startingScore"] },
  checkoutPractice: { name: "Checkout Practice", status: "specified", options: ["range", "attempts"] },
  doublesPractice: { name: "Doubles Practice", status: "specified", options: ["targetOrder", "attempts"] },
  scoringPractice: { name: "Scoring Practice", status: "specified", options: ["rounds", "target"] },
} as const;

export type GameModeId = keyof typeof GAME_MODES;
