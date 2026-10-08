// Agent registry types (Task 3 — agent view rendering, client-side only).
//
// An "agent" is a participant that can occupy the floor. In pass 1 there are
// three: two thieves that get a generated first-person world-model view, and a
// police NPC that is a stationary dot on the map (no view yet).
//
// This file describes RENDERING concerns only (what the player screen needs to
// draw an agent's view and minimap). Authoritative position, movement and rules
// live in the server's GameState / map.json — never here.

export type AgentId = 'goggles' | 'cameras' | 'police';

export interface AgentConfig {
  /** Stable id, also the ?role= value and the map.json key. */
  id: AgentId;
  /** Human-readable name shown on the map and role picker. */
  label: string;
  /** Map-dot colour (§1: green Goggles, grey Cameras, yellow police/guard). */
  color: string;

  /**
   * Does this agent get a Lingbot-World-2 first-person view?
   * Thieves: true. Police: false in pass 1 (flip to true to promote it to a
   * full rendered agent — see lib/agents/README.md).
   */
  rendered: boolean;

  /** Does this agent move? Police is stationary in pass 1. */
  mobile: boolean;

  /**
   * World-model model slug for this agent's view. null when not rendered.
   * Do NOT guess command names elsewhere — read the Reactor schema page.
   */
  model: 'reactor/lingbot-world-2' | null;

  /**
   * Lens prompt fed to the world model to style this agent's view (§9).
   * null when not rendered.
   */
  lens: string | null;

  /** What this agent's 200px minimap reveals (§7 rule 7, §8). */
  minimap: {
    /** Show the police/guard dot and its vision cone. */
    seesGuard: boolean;
    /** Show the other thief's last corridor cell. */
    seesOtherThiefTrail: boolean;
  };
}
