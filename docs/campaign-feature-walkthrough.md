# Feature Walk

One session under the mill at Millbridge. The room text is on Home. This page is only how to start, and the order to play it.

## Setup

ShopTester is the GM. PlayerOne plays Feature Bram, Feature Oda, and Feature Pip. Feature Nix belongs to ShopTester, for when the GM is also playing the elf.

If **Feature Walk** or any of those four sheets already exist, delete them. Deleting the campaign does not delete the sheets. Then, from `backend/`:

```
node scripts/seed-feature-campaign.js
```

The script stops if that campaign name is taken, or if any of those four names already exist. It leaves the campaign paused.

Start the campaign. Each player opens their own sheet.

## Premise

Morning in Millbridge. The mill is stopped, the well in the square is dry, and Miller Bram is arguing with a carter he cannot pay until the wheel turns. He will show the stair under the mill house. He will not go down.

- Feature Bram. He speaks for the group.
- Feature Oda. She can turn the dead.
- Feature Nix. She wants a look at the stone under the mill.
- Feature Pip. He checks the floor, and he fits the low places.

## At the table

Stay on Home, on the Location tab. Read the summary of the place you have selected. Players see the place name and the known objectives. They do not see summaries, clues, or what an NPC knows.

Buy and sell from a character sheet while Millbridge is selected.

When the table decides something, write a log line. When they earn a flag or a clue, set the flag or mark the clue discovered. Open a prepared encounter when that room's trouble starts. Resolve it when that trouble is over. Resolve does not end a fight.

## Order

Town is Millbridge. The miller is there, and the path down the stair is on that card.

When they take the stair, Arrive at the cistern gate. That stair is not one way, so the gate lists the path back up to Millbridge. The shaft on that landing goes to the well, and each room lists the next one: well, stair, crypt, deep, heart. None of those are one way. The chalk door at the heart comes back to the gate, and it only shortens the way back. It starts secret. Mark found when they see the chalk. That does not block or open the door. The gate does not list it. The card lists the people, clues, and encounters of the place you have selected.

- **Gate.** Food or a few silver, or they shove past. The cover spans the landing between the last step and the goblins. Open Gate goblins if it comes to a fight, Covered pit if someone drops in, Scratch marks if they study the shaft.
- **Well.** Open Hermit talk, then Well pulley if they pull at the bone. The waterwheel fact on this place starts blocked. Clear it when the bone comes out.
- **Stair.** Open Bad air if they search the flight.
- **Crypt.** Open Niche skeleton if it stands.
- **Deep.** Open Rising water once the wheel is free. The card says whether water is flowing. That follows the wheel and the slab. It is not its own checkbox.
- **Heart.** Open Burial slab for the turn of work. The burial slab fact starts in place. Mark it removed when the turn of work is done.

Back in town, select Millbridge for the closing talk. The burial clue at the heart names the hidden goal. Marking it discovered makes that goal known.

## Stop

End session pauses the campaign and keeps the dungeon. Conclude asks for confirmation on the page, then wipes the playthrough: creatures, encounters, clues, objectives, object facts, and path discovery and access return to their base lines, and the log, hirelings, wander checks, room flags, clock marks, and pending commands are deleted. Character sheets stay. Use Conclude only to start over. Starting the session clears that concluded flag and does not bring the deleted rows back.

When a control is missing, in the wrong place, or fights the table, write that down. That note is the point of the session.
