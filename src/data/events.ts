import type { DungeonId, Rarity } from './types';

export type EventCardId = string;

export type EventPayload =
  | { kind: 'hp_delta_party'; percent: number }
  | { kind: 'gold_delta'; amount: number }
  | { kind: 'add_item'; rarity: Rarity }
  | { kind: 'lose_hero' };

export interface EventChoice {
  label: string;
  payloads: readonly EventPayload[];
}

export interface EventCard {
  id: EventCardId;
  body: string;
  choices: readonly [EventChoice, EventChoice];
  dungeonId?: DungeonId;
}

export const EVENTS: Record<EventCardId, EventCard> = {
  // ─── Trades: HP for gold ───────────────────────────────────────────────
  hooded_stranger: {
    id: 'hooded_stranger',
    body: 'A hooded stranger blocks your path, palm extended. The price of passage is paid in blood.',
    choices: [
      {
        label: 'Bleed and pass',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.20 },
          { kind: 'gold_delta', amount: 150 },
        ],
      },
      { label: 'Walk away', payloads: [] },
    ],
  },
  shrine_of_pain: {
    id: 'shrine_of_pain',
    body: 'An iron shrine drips with old blood. A lever invites you to feed it.',
    choices: [
      {
        label: 'Pull the lever',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.15 },
          { kind: 'gold_delta', amount: 100 },
        ],
      },
      { label: 'Leave it untouched', payloads: [] },
    ],
  },
  starving_merchant: {
    id: 'starving_merchant',
    body: 'A pale merchant offers gold for fresh wounds. He will not say why.',
    choices: [
      {
        label: 'Bleed for him',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.25 },
          { kind: 'gold_delta', amount: 200 },
        ],
      },
      { label: 'Decline', payloads: [] },
    ],
  },
  wishing_well: {
    id: 'wishing_well',
    body: 'A well demands tribute. The water turns red where the coins fall.',
    choices: [
      {
        label: 'Toss a coin',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.30 },
          { kind: 'gold_delta', amount: 250 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
  },
  gamblers_dice: {
    id: 'gamblers_dice',
    body: 'A gambler at a roadside table wagers against your vigor.',
    choices: [
      {
        label: 'Roll',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.10 },
          { kind: 'gold_delta', amount: 50 },
        ],
      },
      { label: "Don't roll", payloads: [] },
    ],
  },
  dark_pact: {
    id: 'dark_pact',
    body: 'A whisper from nowhere offers riches for a fragment of soul.',
    choices: [
      {
        label: 'Accept the gold',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.35 },
          { kind: 'gold_delta', amount: 300 },
        ],
      },
      { label: 'Reject the whisper', payloads: [] },
    ],
  },

  // ─── Reverse trades: gold for HP heal ──────────────────────────────────
  silent_priest: {
    id: 'silent_priest',
    body: 'A robed priest offers healing for a coin. He does not speak.',
    choices: [
      {
        label: 'Tithe',
        payloads: [
          { kind: 'gold_delta', amount: -80 },
          { kind: 'hp_delta_party', percent: 0.25 },
        ],
      },
      { label: 'Decline', payloads: [] },
    ],
  },
  bone_dust_pedlar: {
    id: 'bone_dust_pedlar',
    body: 'A pedlar sells bone dust said to seal even mortal wounds.',
    choices: [
      {
        label: 'Buy a pinch',
        payloads: [
          { kind: 'gold_delta', amount: -100 },
          { kind: 'hp_delta_party', percent: 0.30 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
  },

  // ─── Free-reward / suspicion cards ─────────────────────────────────────
  abandoned_chest: {
    id: 'abandoned_chest',
    body: 'An unattended chest sits in an alcove. The lid lifts without resistance.',
    choices: [
      {
        label: 'Take the gold',
        payloads: [{ kind: 'gold_delta', amount: 100 }],
      },
      { label: 'Leave it, suspect a trap', payloads: [] },
    ],
  },
  forgotten_traveler: {
    id: 'forgotten_traveler',
    body: 'A skeleton clutches a fresh satchel. The bones are old; the contents are not.',
    choices: [
      {
        label: 'Loot the satchel',
        payloads: [{ kind: 'add_item', rarity: 'rare' }],
      },
      { label: 'Show respect, walk on', payloads: [] },
    ],
  },
  glimmering_pile: {
    id: 'glimmering_pile',
    body: 'A neat pile of coins rests on a stone slab. No owner in sight.',
    choices: [
      {
        label: 'Take it',
        payloads: [{ kind: 'gold_delta', amount: 75 }],
      },
      { label: 'Leave it untouched', payloads: [] },
    ],
  },

  // ─── Lost-hero gambles ─────────────────────────────────────────────────
  cursed_mirror: {
    id: 'cursed_mirror',
    body: 'A cursed mirror shows one hero their doom. The room grows colder as they stare.',
    choices: [
      {
        label: 'Gaze',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'add_item', rarity: 'rare' },
        ],
      },
      {
        label: 'Pull them away',
        payloads: [{ kind: 'hp_delta_party', percent: -0.40 }],
      },
    ],
  },
  the_pit: {
    id: 'the_pit',
    body: 'A pit yawns beneath the floor; one hero hangs by their fingers.',
    choices: [
      {
        label: 'Let them go',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'gold_delta', amount: 200 },
        ],
      },
      {
        label: 'Try to save them',
        payloads: [{ kind: 'hp_delta_party', percent: -0.30 }],
      },
    ],
  },
  siren_song: {
    id: 'siren_song',
    body: 'A song drifts from the dark. One of yours stops listening to anything else.',
    choices: [
      {
        label: 'Let them follow',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'gold_delta', amount: 250 },
          { kind: 'add_item', rarity: 'uncommon' },
        ],
      },
      {
        label: 'Drag them back',
        payloads: [{ kind: 'hp_delta_party', percent: -0.25 }],
      },
    ],
  },

  // ─── Combo / special ───────────────────────────────────────────────────
  midnight_market: {
    id: 'midnight_market',
    body: 'A market materialises in the gloom. The stalls vanish if you blink.',
    choices: [
      {
        label: 'Buy from the dealer',
        payloads: [
          { kind: 'gold_delta', amount: -150 },
          { kind: 'add_item', rarity: 'rare' },
        ],
      },
      { label: 'Browse and leave', payloads: [] },
    ],
  },

  // ─── Crypt-specific ────────────────────────────────────────────────────
  skeletal_hand: {
    id: 'skeletal_hand',
    body: 'A bone hand emerges from the rubble. It clutches something that glints.',
    choices: [
      {
        label: 'Pry it loose',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.10 },
          { kind: 'gold_delta', amount: 100 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
  broken_sarcophagus: {
    id: 'broken_sarcophagus',
    body: 'A cracked sarcophagus oozes black mist. Inside, faint glimmers.',
    choices: [
      {
        label: 'Reach inside',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.20 },
          { kind: 'add_item', rarity: 'rare' },
        ],
      },
      { label: 'Reseal it', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
  ghost_pact: {
    id: 'ghost_pact',
    body: "A pale ghost offers passage in exchange for a hero's eternal company.",
    choices: [
      {
        label: 'Accept',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'gold_delta', amount: 250 },
          { kind: 'add_item', rarity: 'uncommon' },
        ],
      },
      {
        label: 'Refuse',
        payloads: [{ kind: 'hp_delta_party', percent: -0.35 }],
      },
    ],
    dungeonId: 'crypt',
  },
  necromancers_journal: {
    id: 'necromancers_journal',
    body: 'A journal lies open on a stone table. The runes burn the eyes that read them.',
    choices: [
      {
        label: 'Read it',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.20 },
          { kind: 'add_item', rarity: 'uncommon' },
        ],
      },
      {
        label: 'Burn it',
        payloads: [{ kind: 'gold_delta', amount: 50 }],
      },
    ],
    dungeonId: 'crypt',
  },
  whispering_skull: {
    id: 'whispering_skull',
    body: 'A skull on a pedestal whispers your names, one by one.',
    choices: [
      {
        label: 'Listen',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.15 },
          { kind: 'gold_delta', amount: 75 },
        ],
      },
      { label: 'Smash it', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
};
