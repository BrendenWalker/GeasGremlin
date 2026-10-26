# Feature Walk

Campaign **Feature Walk**, Basic Fantasy Core. It is paused. ShopTester is the GM. PlayerOne owns Feature Bram, Feature Oda, and Feature Pip. ShopTester owns Feature Nix.

The clock starts at Day 2 08:00:00. The party is in Millbridge. The active situation is **The dry well**, which is written for Cistern Gate. That split is deliberate. The first Adventuring check is about it.

Do section 12 last. End session and Conclude campaign both leave the session and pause the campaign.

A second copy is `node scripts/seed-feature-campaign.js` from `backend/`. It stops if the name is already taken.

## 1. Campaign list

Log in as ShopTester. Open Campaigns.

1. Find **Feature Walk**, Basic Fantasy Core, with Start, a character dropdown, and Delete.
2. Core and test show `Owner: GameMaster` and no invite control. Those are someone else's campaigns. You can still open the name.
3. Leave the ruleset dropdown on the create row. It lists Basic Fantasy Core and Basic Fantasy Enhanced. Add stays disabled until both a name and a ruleset are filled. Do not add a campaign.
4. Open the Feature Walk dropdown. It lists sheets of this ruleset that are not already in the campaign, as `Name (username)`. Bram, Oda, Pip, and Nix are already in, so they are absent. Invite stays muted until a sheet is chosen. Do not invite one here.

    ```
    The row does not say whether a campaign is running, paused, or concluded.
    A running campaign says Join. A paused one says Start.
    Invite gives no success line.
    There is no rename. The API can rename; this screen cannot.
    ```

5. Open **Feature Walk**.

## 2. Characters, before the session

1. The heading is `Feature Walk — Characters`. The four rows are Feature Bram (Human Fighter), Feature Nix (Elf Magic User), Feature Oda (Human Cleric), and Feature Pip (Halfling Thief).
2. Click **GM commands**. Pick Feature Nix. Set XP to 10 and click **Give XP**. Set Gold (cp) to 100 and click **Give gold**. Click **New day**, then **New round**.
3. Hide the panel.

    ```
    Give XP, Give gold, New day, and New round each put a line in the notice stack. The page still does not keep a list of commands already sent.
    ```

    ```
    Those commands sit on the hub, and they apply only when that character's sheet is open in Play.
    Party XP on Adventuring is a second path.
    The gold field is copper, and the label says so in parentheses only.
    There is no give-item command here.
    ```

4. Click **New character (quick)**. Name it `Feature Spare`, choose Human and Fighter, level 1, XP 0, and Create.

    ```
    The row shows Human Fighter.
    Race and class can be left blank. A quasi-class asks for a base class before Create.
    ```

    Delete it and confirm.
5. Click **New character (wizard)**. Step through Class, Race, Attributes, and Name, HP & gold. Name it `Feature Spare`, create it, then delete it.

    ```
    The wizard records race and class, plus attributes, hit points, and gold. The quick form records name, race, class, level, and XP.
    Both are on the hub, so you cannot do this from inside the session nav.
    ```

## 3. Start

1. Back on Campaigns, click **Start** on Feature Walk.
2. The nav becomes Home, Adventuring, Configuration, Reference. The banner says `Campaign: Feature Walk`.
3. Home is titled Play and lists characters owned by ShopTester that are in Feature Walk. Feature Nix is listed. Shopper stays off the list because that sheet is in Shop Market.

## 4. Configuration

Open Configuration.

```
The page is one scroll: locations, then the location form, then situations, then tables, then prep.
```

### Locations

1. Eighteen places are listed. Millbridge is marked selected. Each outside place with terrain shows the pair: Road +33, Clear 0, Desert −33, Forest −33, Hills −33, Jungle −67, Swamp −67, Mountains −67. Night Market and Salt Reach have no terrain.
2. Cistern rooms share the site `Cistern`. Old Fort is site `Fort`. Town and wilderness places have no site.
3. Cistern Heart is a d8.

    ```
    Cistern Well's interval is shown as raw seconds on Adventuring (every 600 seconds) and as a number here.
    ```

    The other inside rooms are 1800 and the outside rooms are 14400.
4. Click **Edit** on Millbridge. The summary mentions the dry well and the miller.

    ```
    Shops, creatures, and flags appear only after Edit. They are not on the location row.
    ```

5. Shops: **Iron Bin** buy +20%, sell −50%, categories Goods and Weapon. **Miller's Goods** buy +0%, sell +0%, Goods only. Change Iron Bin's buy percent to 25, Save shop, see `buy +25%`, then set it back to 20 and save.
6. Creatures and flags on Millbridge are empty. Cancel the edit.
7. Edit **Cistern Gate**. Creatures: three living gate-watch goblins (5, 4, and 2), one dead goblin at 0, one fled goblin, a skeleton, and Well hermit with the note that he is not a catalog monster. Flags: Pit sprung, Oak chest taken, Secret door found.
8. Add a creature named `Test rat`, hit points `1`, count 1. It appears. **Remove one** on that row.
9. Set a flag `Loose stone` / found. It appears. **Clear** it.
10. In the new-location form, name `Throwaway closet`, Place Inside, check die 6, interval 1800, table Dungeon Level 1, Add location. Edit that row and Remove it. Confirm the delete. A location that still has a creature, a situation, or a lead cannot be removed; Cistern Gate is one of those.

Stock tables have no edit button.

```
The custom table is further down the page, so you pick a table here before you can see the table editor.
```

### Situations

The Situations card is the authoring mode.

```
Buttons that change play (Known, Discovered, Open, Arrive, Activate) are not on this card.
```

1. The situation dropdown lists **The dry well** (active, exploration, Cistern Gate), **The miller's debt** (planned, setup, Millbridge), and **The road rumor** (resolved, resolution, South Track). New situation is the open form.
2. Select **The dry well** and click **Edit**. The line under the picker says new rows attach to it. Clear the title and click **Save situation**. The error sits above the fields. Click **Cancel**.
3. The objective dropdown lists Find who blocked the well (known) and Do not trust the hermit (hidden). Choose New objective, add `Throwaway objective`, leave Known unchecked. Select that objective, click **Remove**, and confirm.
4. NPCs while this situation is selected: Well hermit, attitude Wary, Cistern Gate, motivation, and what he knows. Click **Edit** on that row. The form fills the name, Cistern Gate, the motivation, what he knows, and Wary. **Cancel**.

    Add `Throwaway npc` with a motivation, what they know, an attitude, and a location. Those lines show on the row. **Remove** it.
5. The clue dropdown lists the scratch marks (discovered) and the bone in the wheel. Select the scratch marks and click **Edit**. The form is the text. **Cancel**. Choose New clue, add `Throwaway clue`, select it, click **Remove**, and confirm.

    ```
    Discovered cannot be set from this screen.
    ```

6. The prepared-encounter dropdown lists, all on this situation except the last: Gate goblins (combat, prepared, purpose "They hold the landing.", members Goblin and Skeleton), Hermit talk (social), Bad air (hazard), Covered pit (trap), Well wheel (puzzle), Rising water (environment), Scratch marks (discovery, opened). Select Gate goblins and click **Edit**. The form is the title, the kind, that purpose, notes, and the members Goblin (`1d6`) and Skeleton (`1`). Change the purpose, click **Save encounter**, see the new wording in the dropdown, then set the purpose back and save. **Edit** Goblin, change the quantity, **Save member**, then set it back to `1d6`. Add a member named `Test rat`, quantity `1`, then **Remove** that member. **Cancel**.

    Choose New prepared encounter, add `Throwaway scene`, kind discovery, select it, click **Remove**, and confirm.
7. The lead dropdown lists Cistern Well, "The passage past the gate", and Millbridge, "Back to town". Select Cistern Well and click **Edit**. The form is the destination and the reason. **Cancel**. Choose New lead, destination South Track, reason `throwaway`. Select it, click **Remove**, and confirm.
8. Select **The miller's debt** and click **Edit**. Miller Bram is the NPC. The lead is Cistern Gate, "Miller points at the cistern". Cancel.
9. Choose New situation. The muted line says new rows stay on the campaign. Objectives: Bring water back to Millbridge (known), The cistern is a tomb (hidden). Road warden (South Track) and the clue about the noon bell (Old Fort) show here.

    ```
    Those two objectives have no situation. This card hides them while one is selected. Adventuring shows them with the dry-well lines.
    Road warden and the noon bell do not show while a situation is selected, and they do not show on Adventuring while The dry well is active.
    ```

```
The log is not on this card. It is only on Adventuring.
```

### Tables and prep

1. The table dropdown lists **Cistern denizens**, d6, 4 rows. Select it and click **Edit**. Faces 1 / 1 Goblin 2d4, 2–3 Rats in the water 2d6, 4 / 4 Skeleton 1d6, 5–6 Nothing moving. Clear the name and click **Save table**. The error sits above the fields. Cancel.
2. Choose New table. Name `Throwaway table`, die 6, one row `1`–`6` label `Nothing`. Add table. Select it, click **Remove**, and confirm. Do not hang a location on it first.
3. Stock tables are the sixteen wilderness, town, and dungeon tables. No edit, no remove.
4. Prep, Dungeon stocking: click **Stock a room**. A percent and a contents line appear. Reload the page.

    ```
    The line is gone.
    ```

5. Traps: pick any trap. The note fills the box. Edit a word. Reload.

    ```
    The note is gone.
    ```

```
Stocking and trap notes are not stored.
Deadlines, midnight, day and night text, and rumors are not on this page at all.
```

## 5. Adventuring, situation

Open Adventuring. On a wide window the clock is the right-hand card.

```
Below 800 pixels that card drops under the whole left column.
```

1. The situation heading is `The dry well · Explore · Cistern Gate`. The premise is the stopped mill. Under the stage prompts, the paragraph is the Millbridge summary, because Millbridge is the selected place.

    ```
    The heading and the description are two different places until you select Cistern Gate.
    ```

2. It says no fight is open. Suggested stages are Explore, Encounter, Resolve, and Travel. Other stage lists Setup, Location, Rest, and Conclude, and

    ```
    a separate Rest button does the same stage as the Rest option.
    ```

    **End session** and **Conclude campaign** are in this cluster. Do not click those until section 12.
3. Click **Travel**, then **Explore**. The stage label changes and the fight stays closed.
4. Objectives visible: the two campaign lines and the two dry-well lines. "Heard the rumor on the south track" is not here; it belongs to The road rumor. Click **Known** on "The cistern is a tomb", then **Hide** so it is hidden again. Click **Resolve** on "Find who blocked the well", see `resolved`, then **Reopen**.
5. NPCs: only Well hermit.

    ```
    Miller Bram and Road warden are absent while this situation is active.
    ```

6. Clues: scratch marks discovered, the bone not discovered. Click **Discovered** on the bone, then **Hide discovery**.
7. Gate goblins shows both member names. Scratch marks is `opened` and **Open** is disabled. **Resolve** on Scratch marks is still enabled. Leave it. Empty antechamber is the resolved discovery on The road rumor and is not in this list.
8. Leads and Been here: Cistern Gate and Old Fort have **Return**. Millbridge is current, so it is not in Been here. Do not Arrive yet.
9. The log has one decision, one consequence, and one discovery, each at Day 2 08:00:00. Add a decision `The carter is still unpaid.` It appears at the current clock.
10. Under Situations, The miller's debt can be activated and The road rumor is resolved and can be activated. Leave The dry well active.

## 6. Clock, place, wander, visit

The right-hand card says `Day 2 08:00:00` and `Millbridge · Road · City, Town, or Village (Day)`. Outside is pressed. **Next Watch** is the primary button.

```
Next Round is not in this card.
```

1. Effects: Spent lantern is expired (Day 1 00:00:00 to 00:01:00). Lit torch has 6 turns left, ending Day 2 09:00:00. Miller expects the party is an upcoming event at Day 3 18:00:00. Remove nothing.
2. Add an effect `Test light`, duration 10. It shows a turn count. Remove it.
3. The event form is already Day 2 08:00:00. Set it to Day 2 09:00:00, note `Test bell`, Add event. It is upcoming. Remove it.
4. Click **Light a torch**. A second torch effect appears. Remove that one and leave the original Lit torch.
5. Click **Next Watch**. The clock advances 4 hours. Wander shows a miss or a table row. **Accept** stays disabled on a miss. On a hit, leave it unaccepted for now.
6. Click **Inside**. The location stays Millbridge, and the primary button becomes **Next Turn**.

    ```
    The place toggle does not follow the selected location, and selecting a location is what sets place.
    ```

    Click **Outside** so the town and the button agree again.
7. Locations shows Millbridge as the selected place, and the other places are in the dropdown. Choose **Cistern Well** and click **Select**. The clock card names that room. The visit line appears at 0 turns on Cistern. **Next Turn** is primary. Click it once. The visit check rolls, because this room's interval is one turn. A hit with nobody living here says there is nothing to meet. It does not add a creature and it does not open a fight. The wander check can also roll.
8. Choose **Cistern Gate** and click **Select**. Creatures here: the living goblins, the dead goblin, the fled goblin, the skeleton, and the hermit. Flags: Pit sprung, Oak chest taken, Secret door found. The visit count keeps going, because the site is still Cistern.
9. Click **Next Turn** until three turns have passed on this visit, if the empty-room line has not yet named a creature. A hit names one living creature already here (present before fled). Still no new creature and no fight.
10. Choose **Old Fort** and click **Select**. The visit line clears, because Fort is a different site. Been here now includes the cistern rooms you entered.
11. Choose **Millbridge** and click **Select**. The visit line stays clear. Outside and **Next Watch** return. The miles line is 32 today, 48 on a forced march, 48 by air. The group moves at Feature Bram's 40' (120' a turn, 24 miles before terrain).

## 7. Encounter

1. Click **Start** on the Encounter card.

    ```
    Next Round appears there, not in the clock card.
    ```

    The clock does not move.
2. The enemy form is a monster from this campaign's catalog, and a count. Choose Goblin, count 2, and add it. Two rows appear, with armor class 14, the book's treasure line, and notes. **Roll hit points** is on each until a total is set. The treasure line is not a box you type.

    **Someone else** asks for a name and stores no monster and no treasure.

3. On the situation card, **Open** Gate goblins. The fight gains Goblin (1d6, treasure A) and Skeleton. Scratch-style opened rows cannot be opened again. The stage becomes Encounter.

    ```
    Resolve on that prepared row does not end the fight.
    ```

    Click **Resolve** on Hermit talk and leave the fight open. Hermit talk had no members, so opening it would not have started a fight; you already have one.
4. With the fight open, under Creatures here (select Cistern Gate first if you are still in Millbridge), choose Goblin, count 1, **Add to fight**. That row has hit points, and **Flee** is on it.

    ```
    Flee is only on a creature drawn from the place.
    ```

5. Set that goblin's HP to 1 and click **Set**. The creature list at the gate shows the same hit points. Set it back to its max if you want the later visit check to still see it living.
6. The two catalog Goblins have **Roll hit points**, because they have hit dice and no total yet. The gate goblin and the skeleton opened with Gate goblins already have totals, so they do not. The goblin taken from the gate shows those same hit points on the location list.

    ```
    Roll hit points needs catalog hit dice and an empty total.
    ```

7. Dice, in order. None of these move the clock.
   - Surprise: leave both ambush boxes off, Roll surprise. Then check Party ambushed and roll again.
   - Reaction: lead Feature Bram, adjustment 0, Roll reaction. The line includes his Charisma.
   - Initiative: Roll initiative. Both sides are listed.
   - Morale: the catalog Goblins and the drawn goblin can Check. Someone else has no morale, so Check stays disabled. Adjustment accepts −2 to 2.
   - Turning: cleric Feature Oda, Turn undead. The skeleton needs a count. Someone else has no hit dice and also asks for HD. A failure names the clock when Oda may try again.
   - Blows: attacker Feature Bram, defender the drawn goblin, mode as offered. Apply once. If a damage box is empty, type `3` and apply damage.
   - Awards: set a count on the goblin, Tally, then Apply so the shares go out through the party commands.
8. On the gate goblin that shows treasure A, **Roll treasure**. The catalog Goblin's line is the book's note, not a single treasure code, so leave that row alone. Edit one amount. **Apply**. That writes XP and items through the same party commands. End the fight before trusting the character sheets to have caught up.

    ```
    The player sheet applies commands when it is open.
    ```

9. **End** the encounter. The creature list remains. The flags remain. Gate goblins stays opened.

## 8. Travel, vehicles, body, hirelings

Choose Millbridge in the location dropdown and click **Select** so the party is outside.

1. **Forced march**. Bram may have to save. Nix already shows `forced march day 2, save failed`, so a later forced day skips his save. **Rest** clears the march count. Pip shows two days without food and no healing until he eats. Oda shows no healing until she drinks. Bram shows fed and sleep 5h.
2. Uncheck Ate on Pip and click **Settle day**. Hunger damage or the healing flag should show in the yellow line. Check Ate and settle again.
3. Lost: leader Feature Nix, leave the road box unchecked, click **Lost**. Check the road box and roll again.
4. Weather: leave the navigator box unchecked and roll. Check it and roll again.
5. Vehicles: choose Wagon. Note hardness, HP, and cost. Type damage `10`, **Apply damage**. The taken number changes. Set the crew and **Field repair**. It stops at 90% of the listed HP. Reload Adventuring.

    ```
    The taken damage is 0. Vehicle damage is not stored.
    ```

6. Hirelings already present, employed by Feature Bram: Ned (retainer, loyalty 8), an Alchemist at 1000 gp/month with no loyalty button, and four Light Foot at morale 8. The specialist and the mercenaries say they do not enter a dungeon. Cost is not deducted from anyone.
7. Employer Feature Bram. The line shows his retainer cap and `Further hire rolls in this region are −1.` **Different town** clears it. Click that only when you are finished watching the penalty.
8. Type a retainer name `Test squire`, level 1, offer 0, **Roll hire**. Hire appears only on Acceptance. A refusal makes the penalty −1 if you cleared it.
9. Specialist Animal Trainer. The cost box is required because the price is a range. Type `400`, **Add specialist**, then **Dismiss** that row. Leave Ned, the Alchemist, and the light foot.
10. Mercenary Archer, Human, level 1, qty 2, **Add mercenaries**. Click **Morale** on that row. Then Dismiss them.
11. Set loyalty adjustment to 0 and click **End of adventure**. Each retainer and mercenary rolls. A result of Leaves dismisses that row. If Ned leaves, the loyalty check is done; hire another only if you still want a retainer on the list.

## 9. Player sheet

Stay logged in as ShopTester for Nix. Use a second browser as PlayerOne for Bram and Oda. PlayerOne's password is not in the repo.

1. Home, open **Feature Nix**.

    ```
    The sheet is one page: identity, description, attributes, saves, weapons, spells, Here, shops, inventory, notes, and the party.
    ```

2. Description already has sex, age, hair, eyes, height, weight, and languages. Change one field and Save.
3. Attributes show the rolled scores. HP is 8. Click −, type `1`, apply damage, then + and heal it back.
4. Saving throws are filled from the class. Weapons: no melee is selected. Equip nothing if the pack is empty of weapons.
5. Spells: Sleep is memorized. Click **Cast**. The memorized count drops or the cast is recorded, and Cast disables when none remain. **Learn spell** lists Magic User spells for this level. Learn one, then leave it.
6. Here: the location is whatever Adventuring has selected. Objectives are only the known ones. Hidden clues, flags, creatures, the visit count, the log, and the location summary are absent. If "The cistern is a tomb" is still hidden, it must not appear. Mark it Known on Adventuring and reload this sheet; it appears, including after you Resolve it.
7. Shops, while Millbridge is selected: Iron Bin and Miller's Goods. Iron Bin buy +20% and sell −50%. A dagger's buy price is the list price plus 20%. Miller's Goods is list price and sells Goods only, so weapons are not on that counter.
8. Nix has a backpack and little money. Buy fails when the copper on hand is short. That is the expected refusal.
9. Inventory: money is copper. **Add item** opens the catalog. Add one Torch (the Goods row, not the fire-damage weapon). **Drop 1** removes one. Notes already mention why this character exists. Editing notes saves on blur.
10. Party lists the other three characters and **Send stuff**. Send 10 cp to Feature Bram. Bram does not see it until PlayerOne opens that sheet.

As PlayerOne, start Feature Walk (it is already running if ShopTester has not returned to the hub) and open Feature Bram.

11. Incoming shows the 10 cp. Accept it. Bram's copper increases. Reject a second send of 1 cp from Nix so both buttons are exercised.
12. Shops at Millbridge, Iron Bin, Sell. A spare dagger and the rations are listed. The equipped dagger is missing. The dagger with a bonus is missing. Leather armor is missing because Iron Bin does not buy Armor.

    ```
    The screen does not say why a held item is absent.
    ```

    Sell one ration. The quantity drops and the copper rises at half the list price.
13. Buy one dagger from Iron Bin. Quantity 1. The price is 240 cp if buy is still +20% (list 200).
14. Weapons: the equipped melee is a dagger. Set the shield slot empty and back. Oda's sheet has Shield, Medium equipped.

    ```
    On Adventuring her carry line still says no armor.
    ```

15. Spells on Oda: Cure Light Wounds is memorized. Cast it once.
16. The hub commands from section 2 apply when the matching sheet opens. Nix should have gained the 10 XP and 100 cp, and a new day / new round should have been marked read. If the sheet was already open, reload it.

## 10. Reference

In the session, open Reference.

1. The address is forced to this campaign's ruleset. Races, classes, spells, and items open. Classes includes Magic User.

    ```
    Goblin is not on these pages. Monsters are not in Reference.
    ```

2. Switch to the hub Ruleset Reference. Both rulesets are available there. The session Reference will not follow you to Enhanced.

## 11. Invite from the other side

This needs a sheet in this ruleset whose owner is not already in Feature Walk.

1. As ShopTester, on Campaigns, choose that sheet on Feature Walk and click Invite. The sheet is now on the campaign, and that account has an invite.
2. Log in as that account. Campaigns shows an Invites block with Accept and Decline. Decline it. The invite disappears and the sheet is off the campaign. The sheet itself still exists.

    ```
    There is still no notice on the GM's row that an invite was sent or refused.
    ```

## 12. Close

Do this last.

1. As ShopTester, Adventuring, click **Rest**. The stage becomes Rest. You stay on the page.
2. Click **End session**. You land on the hub and the campaign pauses. Campaigns still has Start.

    ```
    There is no Paused mark.
    ```

    Start again.
3. Click **Conclude campaign**. The run resets: creatures return to their base hit points, hirelings are gone, and no situation stays active. The campaign is concluded, and you are on the hub again. Start again. Adventuring says the campaign is concluded and that activating a situation starts another scenario.
4. Activate **The miller's debt**. The concluded mark clears, Millbridge becomes the selected place, and the stage is the location intro. The dry well is no longer the active situation. Miller Bram and his lead are now the ones on the card.

Leave the campaign on The miller's debt unless you want The dry well active again. Activate does that, and it also selects Cistern Gate.
