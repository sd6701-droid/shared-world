"use client";

import dynamic from "next/dynamic";

// The Reactor SDK loads WebAssembly and WebRTC, so the game renders in the
// browser only.
const Game = dynamic(() => import("./Game"), { ssr: false });

export default function ClientGame() {
  return <Game />;
}
