# Feature Walk sitting

One session under the mill. Two seats. The room order is `docs/campaign-feature-walkthrough.md`. What each beat must show is the work in `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`, as it actually shipped in `docs/plans/TRACKER.md`.

The walkthrough wins where the plan's example matrix disagrees. Water flowing is a sentence, not a checkbox. Rising water is a GM question, not a new rules table. Bad air is 1 damage, not a roll. The chalk door starts secret and open.

## Seats

| Seat | Who | Where they look |
|---|---|---|
| GM | ShopTester | Home, Location tab. Clock and Session are on that page. |
| Player | PlayerOne, on Feature Bram, Feature Oda, and Feature Pip | Characters, then the sheet. The block is **Here**. |
| GM's elf | ShopTester, on Feature Nix | Same sheet as a player, when the beat says to look. |

The player has no Home, Configuration, or Reference link. Opening `/play/<id>` sends them to Characters.

Refresh the player sheet after each GM move. The sheet does not follow the board by itself.

## Before anyone sits

Run these from `backend/`. Each one rolls back its own campaign. None of them writes Feature Walk.

```
npm run test:lifecycle
npm run test:play-state
npm run test:path-way
npm run test:environmental-effect
npm run test:overlay
npm run test:wander
```

Pass: each command exits 0. `test:overlay` still expects the four Enhanced spells and the two abilities.

The app is `docker compose` from the repo root, at http://localhost:8150. Use two browsers, or one normal window and one private window.

## A clean morning

This script starts from an untouched Feature Walk: paused, wheel blocked, slab in place, Rising water prepared, Bad air prepared, chalk door secret and open, log empty.

If that campaign is one you are keeping, stop. Do not Conclude it, and do not reseed over it. Play only the beats that match the state you already have.

A clean morning is the setup in `docs/campaign-feature-walkthrough.md`. The seed refuses to run when the name Feature Walk is taken, or when Feature Bram, Feature Oda, Feature Nix, or Feature Pip already exist. Deleting the campaign does not delete those sheets.

```
node scripts/seed-feature-campaign.js
```

Run that from `backend/`, and only against a database whose Feature Walk you are willing to replace.

## 1. Open the table

**GM.** Start Feature Walk. Stay on Home, Location tab.

**Player.** Join. Open Feature Bram. Then Feature Oda and Feature Pip, one at a time.

**GM pass.** The session is running. Location can be selected. The Session card says End session pauses and keeps this playthrough, and Conclude wipes it.

**Player pass.** Each sheet opens. Here names the place, or says the GM has not set a location. There is no Location tab, no object facts, and no Water crisis card.

## 2. Morning in Millbridge

**GM.** Select Millbridge. Read the place summary aloud. On the Location tab, read the Water crisis card before anyone goes downstairs.

**Player.** On Bram's sheet, read Here. Open the shop only if you want the old buy-and-sell check. Buy nothing the later beats depend on.

**GM pass.** The card is titled Water crisis. The premise says water reaches the town only after the wheel is free and the slab is removed, and that neither step has to come first. The places name the wheel blocked, the slab in place, and Rising water prepared. The lines are labeled requires, causes, and relates to. Open questions include the wheel, the slab, Rising water, and the clues the party has not learned. What the party knows quotes the bone clue and the burial clue as not learned, and the tomb goal as not known. The chalk clue is not on that list. Possible outcomes are labeled as not requiring an order. The card has no save button.

**Player pass.** Here says Millbridge. Objectives include Bring water back to Millbridge and Get the mill turning. The cistern is a tomb is not listed. Exits include the stair under the mill. Cistern Gate is not named. No summary, no clue text, no Water crisis, no Rising water question.

**Nix.** Same Here block as Bram. The elf does not get the GM card.

## 3. Down the stair

**GM.** On the Millbridge path to Cistern Gate, click Go To.

**Player.** Refresh Bram.

**GM pass.** The selected place is Cistern Gate. The path back to Millbridge is listed, and it is not marked one way. The shaft to Cistern Well is listed. The log has no line for that walk. The chalk door is not on this card.

**Player pass.** Here says Cistern Gate. Exits include Millbridge, with the stair under the mill, and the shaft beside the landing. Cistern Well is not named. Cistern Gate by the chalk door is not an exit.

## 4. The landing

Play this only as far as the table needs, to see that the old room still works.

**GM.** Read the gate. If they pay or feed the goblins, write a log line and leave Gate goblins prepared. If they shove, click Open on Gate goblins. Resolve when that trouble is over. Resolve does not end a fight.

**Player.** Refresh. If a fight started, stay on the sheet. You do not run the fight.

**GM pass.** Open on a prepared encounter still works. The player never received an Open button.

**Player pass.** Here still says Cistern Gate and the same two exits. No encounter status, no goblin notes.

## 5. The well, wheel first

**GM.** Go To Cistern Well.

**Player.** Refresh.

**GM pass before the bone.** Object facts shows Waterwheel blocked, checked. Under it: Water is not flowing. Rising water is not asking anything yet.

**Player pass.** Here says Cistern Well. The exit list is the shaft back and the way below the pulley. No checkbox, and no sentence about the wheel or the water.

**GM.** Clear Waterwheel blocked. That is the bone coming out.

**GM pass.** The checkbox is clear. One log line records the change. Clearing it again, or setting it back to the same value, does not add a second line. The question reads: The wheel is free. Open Rising water. Buttons: Open Rising water, and Leave it. Water is not flowing. The Water crisis card now says the wheel is free, and the open question about the wheel is gone. Rising water is still prepared.

**Player pass.** Here is unchanged aside from the place name. No question, no wheel, no water sentence.

**GM.** Click Leave it.

**GM pass.** The question hides. The encounter is still prepared. The log did not gain an open line.

**GM.** Reload Home.

**GM pass.** The question is back. Leave it is not remembered.

**GM.** Click Leave it again so the rest of the descent stays readable. The question returns on the next reload, for the beat at the deep water.

## 6. The flight

**GM.** Go To Cistern Stair. Read Bad air. It is prepared. Do not open it yet. Click Next Turn.

**Player.** Note each character's current hit points, including Nix. Refresh after the GM acts. Hirelings, if any, stay off this check.

**GM pass.** The turn advances. No damage question. Opening has not happened, so the stair does not ask.

**GM.** Click Open on Bad air. Do not click Next Turn yet.

**GM pass.** Bad air is opened. It has no members, so no fight starts. Hit points are unchanged. The log has no bad-air consequence line.

**Player pass.** Hit points are the numbers you wrote down.

**GM.** Click Next Watch, then Next Day. Then click Next Turn once.

**GM pass.** The watch and the day do not ask. The turn asks: Bad air costs 1 damage. Buttons: Apply 1 damage, and Leave it. The amount is the hazard's damage, which is 1 on this stair.

**Player pass.** Still the old hit points. The question is not on the sheet.

**GM.** Click Leave it.

**GM pass.** The question closes. Hit points stay. The log has no bad-air line. The clock has already moved. Bad air stays opened.

**GM.** Click Next Turn again. Click Apply 1 damage.

**GM pass.** Each character whose current hit points were above 0 loses 1. A character already at 0 does not. The log gains one consequence line at this clock. The question closes.

**Player pass.** Bram, Oda, Pip, and Nix each show 1 less hit point, unless that sheet was already at 0.

**GM.** Click Apply 1 damage again if the button is still there. Then click Next Turn, and Apply 1 damage once more.

**GM pass.** The same clock does not apply twice. The later turn asks again and can apply once more. Two consequence lines, two different clocks.

**Player pass.** Another 1 point down after the second turn, and not a second drop for the first turn.

## 7. The deep water

**GM.** Go To Cistern Crypt if you want the old room on the way. Leave Niche skeleton prepared unless it stands. Then Go To Cistern Deep. Reload Home so the wheel question returns.

**Player.** Refresh at the deep water.

**GM pass.** The question is back: The wheel is free. Open Rising water. Water is not flowing. The slab is still in place, and the card does not ask you to move it first.

**Player pass.** Here says Cistern Deep and the exits a known path allows. No question, no water sentence.

**GM.** Click Open Rising water. Then reload and look again.

**GM pass.** Rising water is opened. No fight starts. The question is gone. A second open does nothing. The log does not gain a second open. Re-check Waterwheel blocked: the encounter stays opened, and water stays not flowing. Clear the checkbox again before leaving, so the wheel is free for the heart.

**Player pass.** Hit points are whatever the stair left them. Here does not mention Rising water.

## 8. The heart

**GM.** Go To Cistern Heart.

**Player.** Refresh.

**GM pass.** Burial slab removed is unchecked. Water is not flowing. The chalk door to Cistern Gate is on the path list, marked secret and one way. It has Mark found and Go anyway. It has no Go To.

**Player pass.** Here says Cistern Heart. Exits name Cistern Deep, the way back. Cistern Gate is not listed. The tomb objective is not listed.

**GM.** Check Burial slab removed.

**GM pass.** Water is flowing. That sentence is not a checkbox. Rising water stays opened. The Water crisis card says the water is flowing, the slab is removed, and both of those open questions are gone. Putting the slab back, by clearing the checkbox, leaves Rising water opened. Water stops flowing while the slab is back in place. Check the box again so the slab stays removed.

**Player pass.** Here still has no water sentence and no tomb objective.

## 9. The chalk door

**GM.** On the chalk door, click Go anyway.

**Player.** Refresh.

**GM pass.** The selected place is Cistern Gate. The log has a decision that the path was taken before it was found. The door is still secret. The gate's path list still does not show the chalk door.

**Player pass.** Here says Cistern Gate. Exits are Millbridge and Cistern Well. The chalk door is not an exit.

**GM.** Go back to Cistern Heart by the ordinary rooms, or select it. Click Mark found on the chalk door. Click Mark found again.

**GM pass.** The secret mark is gone. Blocked is unchanged: the door is open. Go To is now on that path. The second Mark found writes nothing. Blocking it, then clearing the block, does not hide it again.

**Player pass, after one refresh.** Here, once the GM has selected Cistern Heart, lists Cistern Gate, the chalk reason, and it is not marked blocked.

**GM.** Click Go To on the chalk door.

**GM pass.** You arrive at Cistern Gate. That walk writes no log line. The gate still has no path back through the chalk door. The ordinary stair back to Millbridge still has Go To.

**Player pass.** Here says Cistern Gate. The chalk door is still not an exit from the gate.

## 10. What the party knows

**GM.** Select Cistern Heart. On the burial clue, The slab is a burial, click Discovered. Leave the chalk clue for a moment, then mark that one discovered too.

**Player.** Refresh Bram, Oda, and Pip.

**GM pass.** The burial clue shows as discovered. The Water crisis card says the party has learned that clue, and that the party knows the tomb goal. The bone clue at the well is still not learned, unless you marked it too. The chalk clue can be discovered and still stays off the Water crisis card. The card still does not save, and it still does not demand an order.

**Player pass.** Here includes The cistern is a tomb. It does not include the clue sentence, the chalk text, or the bone text.

## 11. Reload

**GM.** Reload Home. Select Cistern Heart again.

**Player.** Close the sheet and open Bram again.

**GM pass.** The wheel is free, the slab is removed, water is flowing, Rising water is opened, Bad air is opened, and the chalk door is found and open. The log still has the fact line, the bad-air lines, and the decision from Go anyway. The clock is where the stair left it.

**Player pass.** Here matches that place. Hit points are the damaged numbers. The tomb objective is still listed. The chalk door shows only while the selected place is the heart.

## 12. End the evening

**GM.** Click End session.

**Player.** Try to stay on the sheet.

**GM pass.** The campaign is paused. Home is no longer the live table. Creatures, clues, facts, paths, the log, and hit points are still there when you look again.

**Player pass.** The sheet sends you out. You cannot keep playing a paused campaign.

**GM.** Start the campaign again.

**Both pass.** The same place, clock, facts, opened encounters, found door, log, and damaged hit points are back. Nothing was reseeded.

## 13. Wipe, then the other order

Do this only on a Feature Walk you are willing to lose. This is the destructive beat.

**GM.** On Home, click Conclude campaign. Read the warning on the page. Click Cancel first.

**GM pass.** Cancel leaves the playthrough. The warning is the page text, not a browser dialog.

**GM.** Click Conclude campaign again. Click Wipe this playthrough.

**GM pass.** The campaign is concluded. The warning named the wipe: object facts back to their authored values, path discovery and blocked back to base, encounters back to base, the log deleted. Character sheets stay. Starting the session clears the concluded flag and does not bring the deleted rows back. There is no screen that reads the archived log. An empty log, if you conclude twice, does not need a second archive.

**Player pass.** You are out. You cannot wipe, and you cannot read the archive.

**GM.** Start the campaign. Select Cistern Heart before touching the wheel.

**GM pass, slab first.** The wheel is blocked again. The slab is in place. Rising water is prepared. Bad air is prepared. The chalk door is secret again. The log is empty. Hit points are still the damaged numbers from the stair. Check Burial slab removed. Water is not flowing. There is no Rising water question. Then select Cistern Well and clear Waterwheel blocked. The question appears now. Water is flowing, because the slab is already removed. Open Rising water. It opens, and it does not start a fight.

**Player pass.** Here follows the place. After the burial clue is discovered again, the tomb objective returns. Until then it is gone. Hit points are still short. No question appears on the sheet at either step.

## Pass sheet

Mark each row when both seats have been looked at.

| Beat | GM saw | Player saw |
|---|---|---|
| 1 Open | Running, Session card | Sheets only |
| 2 Millbridge | Water crisis card, both facts, clues not learned | Place, two known goals, stair exit |
| 3 Stair down | Arrived, no log line | Gate, two exits, no chalk door |
| 4 Landing | Old encounter Open still works | Place and exits only |
| 5 Wheel | Question after the bone; Leave it forgotten on reload; water still | No question, no facts |
| 6 Stair | Open does not damage; turn asks; Leave it writes nothing; Apply once per turn | Hit points drop only after Apply |
| 7 Deep | Open Rising water, no fight, no second open | No question |
| 8 Heart | Slab makes water flow; Rising water stays open | No water sentence, no tomb goal yet |
| 9 Chalk | Go anyway logs; Mark found does not block; gate has no way back | Door appears only after Mark found, and only from the heart |
| 10 Knowledge | Party knowledge updates; chalk clue stays off the card | Tomb goal appears |
| 11 Reload | Facts, clock, log, door | Same place, same hit points, same goal |
| 12 End session | Pause keeps the dungeon | Kicked out; start brings the same dungeon back |
| 13 Wipe | Authored morning restored; sheets and hit points stay | No wipe, no archive |
| 13 Other order | Slab first does not ask; freeing the wheel asks and flows | Still no question |

## What this sitting does not cover

A second campaign with no fact rows shows no Water crisis card. The automated play-state check already locks that. Sitting it means opening that other campaign as the GM and confirming the Location tab has no card.

There is no player control for facts, paths, encounters, the clock, or Conclude. The pass is the missing Home link and the unchanged Here block.

Enhanced spells and abilities are the overlay command, not a room in this dungeon.
