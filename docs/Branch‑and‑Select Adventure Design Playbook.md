# Branch‑and‑Select Adventure Design Playbook

A concise reference for planning coherent, replayable **image + audio, 2–3‑choice** stories (classic branching‑adventure format) for your game engine.

---

## 1  Design Goals

- **Coherence** – hand‑crafted narrative arcs and logical item gates.
- **Replay value** – players see only 15‑25 % of passages on a win‑run.
- **Authoring sanity** – cap writing effort to ≈ 400 passages per adventure.

---

## 2  Core Graph Terms

| Symbol | Meaning                                      |
| ------ | -------------------------------------------- |
| `d`    | Depth = number of steps/choices to an ending |
| `bᵢ`   | Branching factor at step _i_ (2 or 3)        |
| `N`    | Total passages you write                     |
| `L`    | Distinct endings (≈ 3–10, incl. _1 win_)     |
| `c`    | Chapters (foldback hubs)                     |

---

## 3  Global Targets

| Parameter               | Small Quest | Full Book  | Notes                           |
| ----------------------- | ----------- | ---------- | ------------------------------- |
| **N** passages          | 120–180     | 380–420    | 400 is the classic print size   |
| **d** steps on win path | 20–35       | **60–100** | 15–25 % of _N_                  |
| Avg. branching `\bar b` | 2.2–2.4     | 2.3–2.6    | mix of 3‑way & 2‑way picks      |
| Endings **L**           | 3–5         | 6–10       | 1 true win + variants of defeat |

> **Rule‑of‑thumb:** `N ≈ (b^{w+1} – b)/(b – 1) × c + 1`, where _w_ = free steps before each hub.

---

## 4  Foldback Chapter Pattern

```
Start → (b choices for w steps) → Hub₁ → … → Hub_c → Endings
```

- Pick **w = 2 or 3**.
- After every hub, reset player position; inventory/state keeps long‑range stakes.

**Nodes you write per chapter**\
`ΔN = (b^{w+1} – b)/(b – 1)`\
Example: `b = 3`, `w = 2` ⇒ 12 fresh passages per chapter.

---

## 5  Choice Design

| Use 3 choices for…        | Use 2 choices for…      |
| ------------------------- | ----------------------- |
| exploration, lore, humour | tension, critical forks |

Maintain `\bar b ≈ 2.3` to keep graphs tractable.

---

## 6  Endings & Victory Gate

- 1 **win** node awards score/achievement.
- `L – 1` defeat or neutral nodes share epilogues.
- Gate the win with **2–3 global flags** (e.g. `has_key ∧ befriended_sage`).\
  Encodes depth without new passages.

---

## 7  Replayability Math

Perceived unique runs: `P = ∏ bᵢ = b^{d}`\
…but you only author `N_fold ≪ P` thanks to hubs.

Aim for **10–50×** more perceived runs than passages.

---

## 8  Practical Design Checklist

1. Choose scope: _Small_ or _Full_ (table §3).
2. Set win‑path length `d` (15–25 % of _N_).
3. Decide chapter size `w` (2–3) and count `c = d/w`.
4. Draft hubs first; list required flags/keys.
5. Backfill branches, alternating 3‑ and 2‑choice pages.
6. Add flavour dead‑ends & Easter eggs last.
7. Run path‑finding script → verify win reachable in ≤ *target* steps & defeat endings cover 75 %+ of graph.
8. Play‑test for difficulty; tweak pacing, flag placement.

---

## 9  Example 400‑Passage Blueprint

| Zone                                                           | Sections        | Branch flavour               |
| -------------------------------------------------------------- | --------------- | ---------------------------- |
| Intro                                                          | 1               | no choice                    |
| **Act 1**                                                      | 2 – 81 (80)     | 3‑choice exploration         |
| **Hub A**                                                      | 82              | convergence                  |
| **Act 2**                                                      | 83 – 202 (120)  | 3 → 2 choices, rising stakes |
| **Gauntlet**                                                   | 203 – 242 (40)  | binary, high danger          |
| **Endings**                                                    | 243 – 400 (158) | 1 win (§400) + 157 lose      |
| _Optimal route = 65–80 steps (≈ 16 % of passages)._            |                 |                              |
| Graph/CSV template in `/story_graph.png` & `/story_edges.csv`. |                 |                              |

---

## 10  Balancing & Testing Tips

- **Fail‑fast beats grind:** early instant deaths are kinder than late unwinnable states.
- - Keep a **spreadsheet** of paragraphs → flags/items needed → next hops.

---

### Ready‑to‑use formulas

```
Nodes for pure tree:       N = (b^{d+1} - 1)/(b - 1)
Nodes with foldbacks:      N_fold = 1 + c*(b^{w+1} - b)/(b - 1)
Target win‑path length:    d_target ≈ 0.2 × N
```

Use these to sanity‑check every outline before writing prose.

---

## 12  Narrative & Passage‑Writing Guidelines

> How to draft each numbered section so that a different writer—or a future you—can plug it straight into the engine.

### Voice & POV

- **Second‑person present‑tense** ("You step through the archway… You weigh your options…").
- Keep the reader/player as **the protagonist**—avoid naming them, but give them senses and thoughts.

### Length & Rhythm

| Passage type      | Words | Image cue                   | Choices                    |
| ----------------- | ----- | --------------------------- | -------------------------- |
| Standard node     | 25–40 | Yes                         | 3 options (occasionally 2) |
| Hub / choke‑point | 40–70 | Yes (panoramic / set‑piece) | 2–3 options                |
| Ending            | 40–70 | Yes (resolution)            | none – restart prompt      |

_Stick to 1–2 short paragraphs to fit comfortably under the illustration on mobile._

### Choice Copy

- Begin with a **verb** (“Open the iron door”, “Climb the rope ladder”).
- Avoid spoilers—choices describe **actions, not outcomes**.
- Render in **second‑person imperative** (classic branching style).

### Linking Style

- Use inline markup `[Go left → §23]` during drafting; the engine will convert.
- After final sign‑off, run an **automated dead‑link check**.

---

## 13  Story Planning Workflow (No‑Combat Variant)

1. **Premise & theme** – one‑sentence hook (“Lost explorer escaping a haunted dig‑site”).
2. **Define win condition** – what constitutes success? (e.g., “Reach the surface with the crystal in hand”).
3. **Lay out hubs** (see §4) – set‑piece scenes that all or most routes converge on.
4. **Item / knowledge gates** – pick 2–3 prerequisites for the win; distribute clues early, physical keys mid‑game.
5. **Draft skeletal flowchart** – nodes = circles, flags = diamonds.
6. **Write passages following §12 rules** – image brief + second‑person prose + options.
7. **Integrate images/audio** – commission or generate assets; label filenames with section numbers.
8. **Playtest for narrative flow** – ensure flags always discoverable before required; tweak pacing.

---

## 14  Asset Integration Guidelines

| Asset           | Specs                          | Naming                         | Notes                                                         |
| --------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------- |
| Still image     | 1600×900 px, JPG/PNG, ≤ 300 kB | `IMG_###.jpg` matching section | Dark vignette for suspense, bright highlight on focal element |
| Narration audio | ≤ 25 s, 48 kHz WAV             | `AUD_###.wav`                  | Neutral voice, subtle ambience bed                            |

_Ensure every ending gets its own bespoke illustration & sting for emotional punch._

---

## 15  Example Passage Skeleton

```
§148  (Gauntlet chamber)
IMAGE: IMG_148.jpg  (Collapsed stone bridge over abyss, torchlight)
A cold wind bites your cheeks as you inch onto the cracked bridge. Gravel trickles into the abyss; one wrong step will finish your tale.

> Cross cautiously to the far arch  → §226
> Return to the safety of the ledge → §82
> Inspect the bridge supports       → §205
```

---

## 16  Deliverables Checklist for Writers

- [ ] **Premise + logline** (1‑sentence hook, tone clarified via §20 answers)
- [ ] **Flowchart** – node numbers, choices, flag set/required, asset stub columns.
- [ ] **400 passage draft** – each 25‑40 words (hubs 40‑70), second‑person, with inline markup.
- [ ] **Image & audio briefs** – per §14 template.
- [ ] **Alt‑text & subtitle** lines – per accessibility rules.
- [ ] **Dead‑link report** – automated script log.
- [ ] **Flag-state test results** – confirm win reachable, no soft‑locks.
- [ ] **CSV / JSON metadata** – final import files.
- [ ] **One‑paragraph marketing blurb** summarising win ending.

## 0 Project Overview Project Overview

> **Working title:** _[TBD]_ – 400‑passage, second‑person, branching adventure for mobile & web. **Core fantasy:** Exploratory mystery with light peril, no combat mechanics; emotional tone: _tense but hopeful_.

### Experience goals

1. **Immersion** – vivid sensory prose + bespoke illustration & VO on every node.
2. **Agency** – meaningful 2–3‑way decisions that alter the route.
3. **Accomplishment** – clear narrative payoff on the single win ending.

---

## 17 Production Timeline & Review Cadence

| Phase       | Deliverable                                 | Reviewer       | Due      |
| ----------- | ------------------------------------------- | -------------- | -------- |
| Outline     | Flowchart PDF + one‑line premise            | Creative lead  | +1 week  |
| Milestone 1 | First 80 passages + image briefs            | Narrative lead | +3 weeks |
| Milestone 2 | Full 400‑passage draft                      | Creative + QA  | +6 weeks |
| Polish      | Proof‑read, dead‑link check, flag test pass | QA             | +7 weeks |
| Final Gold  | CSV + assets folder zipped                  | Producer       | +8 weeks |

---

## 18 Flag & Metadata Convention

| Element          | Syntax                | Example                         |                         |
| ---------------- | --------------------- | ------------------------------- | ----------------------- |
| Boolean flag     | `flag:KEY_FOUND`      | set when §145 picked up crystal |                         |
| Conditional link | \`[Use crystal → §321 | needs FLAG\:KEY_FOUND]\`        | only shows if flag true |
| Restart          | \`[Start again → §1   | RESET]\`                        | clears all flags        |

Store flags in a flat JSON per save‑slot. Names are UPPER_SNAKE_CASE, max 20 chars.

---

## 19 Accessibility Requirements

- **Alt‑text** – 1 sentence (≤ 140 chars) for every image.
- **Subtitles** – auto‑generated from VO script; designer supplies text.
- **High‑contrast mode** – avoid critical info conveyed solely by colour.

Include alt‑text and subtitle lines in the Excel cross‑ref.

---

## 20 Designer Kick‑off Questionnaire

Provide answers (or mark “TBD”) before outlining:

1. **Genre / setting nuance** (e.g., gas‑lamp horror, bright steampunk, prehistoric myth?).
2. **Target age rating** (ESRB 10+, 12+, 16+?).
3. **Narrative tone scale** (light‑hearted 1 ▢▢▢▢▢ 5 grim‑dark).
4. **Win condition specifics** (object to retrieve, place to escape, revelation to uncover?).
5. **Mandatory items / passwords count** (default 2–3) and thematic nature.
6. **Visual style keywords** for artists (e.g., painterly, cel‑shaded, photo‑real).
7. **Audio mood palette** (orchestral, ambient drones, 8‑bit synth?).
8. **Localization scope** (languages other than English?).
9. **Accessibility extras** (sign‑language video, dyslexia‑friendly font?).
10. **Monetisation hooks** (achievements, analytics events?).

---

## 21  Science‑Fantasy (Sword‑and‑Planet) Style Guide

> Applies to **Crypt of the Ember King** and any other adventures marked “science fantasy”. Skim before writing or briefing art.

### Narrative Voice & Lexicon

- **Fusion vocabulary:** blend archaic fantasy nouns (_bastion, rune, glaive_) with pulpy sci‑fi tech verbs (_oscillates, stabilises, cauterises_).
- **Sense hierarchy:** sound & heat first (lava pops, rune hums), colour second (azure plasma), smell least (sooty pheromones).
- Avoid genre‑breaking slang; if in doubt, ask: “Would this word fit both _A Princess of Mars_ and _Dark Souls_?”

#### Allowed tech terms

| Category  | Examples                                    |
| --------- | ------------------------------------------- |
| Energy    | aether‑coil, plasma conduit, arc beacon     |
| Materials | obsidian steel, crystal graphite, star‑iron |
| Weapons   | phase‑lance, inferno glaive, grav pistol    |
| Transport | magma skiff, hover disc, chain‑elevator     |

### Imagery Tone

- **Colour palette:** volcanic reds & oranges contrasted with astral teals and violets.
- **Lighting:** focused rim‑light on hero silhouettes; back‑glow from molten or high‑tech sources.
- **Architecture:** gothic arches retro‑fitted with bronze conduits and crystalline control panels.
- **Creatures:** mythic silhouettes with subtle cybernetic grafts (e.g., a basalt dragon sporting qubit swirl eyes).

### Image Brief Template

```
IMG_###.jpg – [Wide / Medium / Close] shot
Primary subject   : [e.g., Rune‑etched basalt door bleeding blue light]
Secondary element : [e.g., Distant plasmic geyser columns]
Mood keywords     : smouldering • majestic • alien relic
Colour anchors    : #FF4E0E (lava orange) / #1F99D9 (aether blue)
```

### Audio Guide

- **Instrumentation:** low brass drones + bowed‑metal scrapes; accent with synth arpeggios for tech moments.
- **Diegetic cues:** crackling magma, rune resonance, hollow wind in megavaults.

---

## 22  Item & Flag‑Driven Choice Design

### 22.1  Item Types

| Type                 | Purpose in flow                                                      | Max recommended | Example in _Ember King_           |
| -------------------- | -------------------------------------------------------------------- | --------------- | --------------------------------- |
| **Mandatory Key**    | Gate the win path; must be obtained                                  | 2–3             | `FIRE_RUNE`, `CHAIN_KEY`          |
| **Optional Aid**     | Eases later passage or unlocks short‑cut; win still possible without | 1–2             | `BLAZING_SWORD` halves peril text |
| **Lore Collectible** | Pure flavour or bonus endings                                        | 3–5             | Charred Tablets giving back‑story |

### 22.2  How Flags Affect Choices

1. **Conditional visibility** – Hide or show choices based on a flag.
   ```
   [Fit both keys and speak the vow → §226 | needs FLAG:FIRE_RUNE & FLAG:CHAIN_KEY]
   ```
2. **Conditional redirection** – Same choice text, different target.
   ```
   [Examine the sarcophagus → §120 | if FLAG:BLAZING_SWORD else §95]
   ```
3. **Narrative variation** – Modify passage text with inline if/else tags (engine‑specific), keeping node number constant to avoid graph bloat.

### 22.3  Design Rules

- **Keep global flag count ≤ 8** to prevent testing combinatorial explosion.
- **Signal requirements early** – environmental hints, NPC foreshadowing.
- **Avoid choke‑point dead‑ends** – always give a discoverable way to obtain mandatory keys before lock occurs.
- **Track flags per save‑slot** (see JSON spec §18) so players cannot lose vital items mid‑run.

### 22.4  Advanced Uses

- **Personality echoes** – Suppose flag `SHOWED_MERCY` alters final epilogue text.
- **Dynamic map** – Flag `LAVA_FLOODED` closes certain choices globally after a quake.
- **Adaptive difficulty** – If player lacks optional aid, later choices inject extra peril prose, keeping tension without unwinnable paths.

---

_Last updated: 27 Apr 2025_
