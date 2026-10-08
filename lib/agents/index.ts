// Agent registry — the single source of truth for who is on the floor and how
// each one is rendered. Add an agent = add a file + one line here.
//
// Pass 1: two rendered thieves (goggles, cameras) + a stationary police NPC.

import type { AgentConfig, AgentId } from './types';
import { goggles } from './goggles';
import { cameras } from './cameras';
import { police } from './police';

export type { AgentConfig, AgentId } from './types';

export const AGENTS: Record<AgentId, AgentConfig> = {
  goggles,
  cameras,
  police,
};

/** Every agent, in display order. */
export const ALL_AGENTS: AgentConfig[] = [goggles, cameras, police];

/** Agents a human can pick and play as (mobile). Police is excluded for now. */
export const PLAYABLE_AGENTS: AgentConfig[] = ALL_AGENTS.filter((a) => a.mobile);

/** Agents that get a Lingbot-World-2 view (the thieves in pass 1). */
export const RENDERED_AGENTS: AgentConfig[] = ALL_AGENTS.filter((a) => a.rendered);

export function getAgent(id: AgentId): AgentConfig {
  return AGENTS[id];
}

/** Safely resolve a ?role= query value to an agent, or null if unknown. */
export function resolveAgent(role: string | null | undefined): AgentConfig | null {
  if (role && role in AGENTS) return AGENTS[role as AgentId];
  return null;
}
