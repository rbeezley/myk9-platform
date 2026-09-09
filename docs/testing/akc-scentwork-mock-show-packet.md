# AKC Scent Work — Mock Show Test Packet

Manual-testing packet for the secretary journey: **3 mock shows, 25 mail-in
entries, and a full scoring key with expected placements.** The tester plays a
trial secretary receiving mail-in entries — create the shows, add the dogs,
enter them in the listed classes, score every run to the key, then run the
reports and compare against the key.

Because every result is pre-specified, any difference between the app's output
and this key **is the finding**. Record show / trial / class / dog, what the app
showed, and what the key expected. Also record every field you had to invent
because the form did not specify it — those blanks are UX findings too.

**Source:** authored 2026-07-09 as
[`akc-scentwork-mock-show-packet.docx`](akc-scentwork-mock-show-packet.docx)
(committed alongside this file — use it when you want the printable handout).
This Markdown is the greppable conversion; keep both in sync if the packet is
revised.

**Companion docs:** [`secretary-golden-path-checklist.md`](secretary-golden-path-checklist.md)
walks the secretary UI surface-by-surface; this packet supplies the data and the
expected results. [`secretary-walk-seed.md`](secretary-walk-seed.md) describes
the older pre-seeded Accept/Waitlist fixture.

---

# How to use this packet

You are simulating a trial secretary receiving mail-in entries. Everything a real secretary would type from a paper form is on the entry forms in this packet. Where a field is blank or a decision is left to you (a scheduling choice, an armband number, a check number), invent it on the fly — that is intentional. Note what you had to invent; those gaps are findings.

## Do these steps in order

- Create the 3 shows — Use the “Show overview” page for each show (Show A, B, C). Enter club, dates, location, event number(s), fees, and the classes offered for each trial exactly as listed.
- Create the 25 dogs + owners — Work through the 25 entry forms. Add each dog and its owner/handler. Registered name, call name, breed, sex, DOB, AKC/PAL number, and owner contact are all on the form.
- Enter each dog in its classes — Each form lists the classes that dog is entered in (marked with [X]). Enter the dog into exactly those classes, in the trial shown.
- Handle the edge cases (Show C) — Show C contains a waitlist, a day-of scratch, an absent, an excused, and a move-up. Reproduce each as the callouts describe before scoring.
- Score every run to the key — Use the Scoring Key section. Enter the exact result (Q / NQ / ABS / EX), fault count, and search time for each dog in each class.
- Let placements compute, then run reports — AKC placements only appear once the WHOLE class is scored. After a class is fully scored, compare the app’s 1st–4th to the “Placement” column in the key. Then run the reports in the final checklist.

## Why we pre-specify the results

> Because the results are fixed, you can compare exactly what the tester enters against what the app computes — especially placements, titles progress, and report totals.
> If the app’s output differs from this key, that difference is the finding. Write down which show / trial / class / dog, and what the app showed vs. what the key says.

## AKC Scent Work quick reference (for the tester)

| Field         | Value                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elements      | Container · Interior · Exterior · Buried · Handler Discrimination · Detective (Elite)                                                                 |
| Levels        | Novice (split A / B) → Advanced → Excellent → Master → Detective. Level is per element — a dog can be Master in one element and Excellent in another. |
| Novice A vs B | A = handler has never earned an AKC Scent Work title (with any dog). B = everyone else. It follows the handler, not the element.                      |
| Result codes  | Q = qualified · NQ = not qualified (with reason) · ABS = absent · EX = excused. Only Q runs place.                                                    |
| Placement     | 1st–4th among qualifiers in a class: fewest faults first, then fastest search time. Awarded at every level, Novice included.                          |

# Master roster — 25 dogs

Quick index of every dog and which show it belongs to. Full details are on each entry form.

| #   | Call name | Registered name              | Owner           | Show |
| --- | --------- | ---------------------------- | --------------- | ---- |
| 1   | Bella     | Cedar Ridge Blue Belle       | Jennifer Walsh  | A    |
| 2   | Cooper    | Willowbrook Copper Penny     | David Nguyen    | A    |
| 3   | Luna      | Nightfall Silver Moonrise    | Priya Patel     | A    |
| 4   | Max       | Prairie Wind Maximus         | Robert Kline    | A    |
| 5   | Daisy     | Sunnyside Field of Daisies   | Emily Carter    | A    |
| 6   | Rocky     | Stonewall Rocky Road         | Michael Brooks  | A    |
| 7   | Sadie     | Goldleaf Sweet Sadie Mae     | Laura Simmons   | A    |
| 8   | Charlie   | Bordertown Charlie Brown     | Thomas Reed     | A    |
| 9   | Ginger    | Copperfield Ginger Snap      | Angela Foster   | B    |
| 10  | Moose     | Timberline Gentle Moose      | Kevin Marsh     | B    |
| 11  | Nala      | Regalia Queen of Nala        | Christine Yu    | B    |
| 12  | Bruno     | Ironclad Bruno the Bold      | Daniel O'Connor | B    |
| 13  | Willow    | Winddancer Whispering Willow | Rachel Adams    | B    |
| 14  | Zeus      | Thunderpaw Zeus Almighty     | Marcus Bell     | B    |
| 15  | Penny     | Merriweather Lucky Penny     | Stephanie Grant | B    |
| 16  | Ollie     | Avant-Garde Oliver Twist     | Nathan Price    | B    |
| 17  | Ruby      | Rubicon Ruby Tuesday         | Victoria Lang   | B    |
| 18  | Finn      | Grayghost Finnegan           | Gregory Sanders | B    |
| 19  | Athena    | Olympus Athena Wisdom        | Helen Frost     | C    |
| 20  | Diesel    | Motorhead Diesel Engine      | Frank Delgado   | C    |
| 21  | Piper     | Highland Pied Piper          | Karen Whitfield | C    |
| 22  | Gus       | Sherlock Augustus Holmes     | Andrew Boyle    | C    |
| 23  | Hazel     | Pepperbox Hazelnut           | Diane Russo     | C    |
| 24  | Titan     | Colossus Titan of Old        | Paul Hendricks  | C    |
| 25  | Coco      | Cocoa Bean Delight           | Michelle Tran   | C    |

# Show A — Cedar Valley DTC Scent Work Trial

| Field                | Value                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Club                 | Cedar Valley Dog Training Club                                                                                    |
| Location             | Cedar Valley Fairgrounds, Bldg 3, Cedar Rapids, IA                                                                |
| AKC event number(s)  | 2026123401                                                                                                        |
| Entries open / close | 07/01/2026 → 08/05/2026 (entries limited to 120 runs)                                                             |
| Fees                 | $25 first class / $22 each additional class, same dog                                                             |
| Trial secretary      | Nancy Whitaker, 210 Fairground Rd, Cedar Rapids, IA 52404 · (319) 555-0300 · secretary@cedarvalleydtc.example.com |
| Trials               | Trial 1: Saturday, August 15, 2026 (Judge Margaret Holloway)                                                      |

## What Show A is testing

> Warm-up show: one trial, one day, Novice only. Good for a first pass at the whole flow.

### Trial 1 — Saturday, August 15, 2026 — Judge Margaret Holloway

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| Class              | Entered (armband auto-assigned by app)          |
| Container Novice A | Bella (#1), Cooper (#2), Daisy (#5), Sadie (#7) |
| Container Novice B | Luna (#3), Max (#4), Rocky (#6), Charlie (#8)   |
| Interior Novice A  | Bella (#1), Sadie (#7)                          |
| Interior Novice B  | Luna (#3), Charlie (#8)                         |
| Buried Novice B    | Max (#4), Rocky (#6)                            |
| Exterior Novice B  | Charlie (#8), Luna (#3)                         |

# Show B — Riverside SWA Fall Classic (2 trials)

| Field                | Value                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Club                 | Riverside Scent Work Association                                                                                        |
| Location             | Riverside Event Center, 1200 River Rd, Des Moines, IA                                                                   |
| AKC event number(s)  | 2026123402 / 2026123403                                                                                                 |
| Entries open / close | 07/15/2026 → 08/28/2026 (limited to 180 runs per trial)                                                                 |
| Fees                 | $25 first class / $20 each additional class, same dog, per trial                                                        |
| Trial secretary      | Ellen Marsh, 1200 River Rd, Des Moines, IA 50309 · (515) 555-0400 · trials@riverside-swa.example.com                    |
| Trials               | Trial 1: Saturday, September 12, 2026 (Judge Alan Whitmore) \| Trial 2: Sunday, September 13, 2026 (Judge Susan Petrov) |

## What Show B is testing

> Two trials over a weekend across Novice/Advanced/Excellent and three elements. Exercises move-through-levels and per-trial fees.

### Trial 1 — Saturday, September 12, 2026 — Judge Alan Whitmore

| Field               | Value                                              |
| ------------------- | -------------------------------------------------- |
| Class               | Entered (armband auto-assigned by app)             |
| Container Novice B  | Moose (#10), Willow (#13), Ollie (#16), Finn (#18) |
| Container Advanced  | Ginger (#9), Bruno (#12), Zeus (#14), Ruby (#17)   |
| Container Excellent | Nala (#11), Penny (#15)                            |
| Interior Novice B   | Moose (#10), Willow (#13), Finn (#18)              |
| Interior Advanced   | Ginger (#9), Zeus (#14), Ruby (#17)                |
| Interior Excellent  | Nala (#11), Penny (#15)                            |

### Trial 2 — Sunday, September 13, 2026 — Judge Susan Petrov

| Field              | Value                                  |
| ------------------ | -------------------------------------- |
| Class              | Entered (armband auto-assigned by app) |
| Exterior Novice B  | Willow (#13), Ollie (#16), Finn (#18)  |
| Exterior Advanced  | Ginger (#9), Bruno (#12), Ruby (#17)   |
| Exterior Excellent | Nala (#11), Penny (#15)                |
| Container Advanced | Bruno (#12), Zeus (#14)                |

# Show C — Summit K9 Masters Weekend (3 trials)

| Field                | Value                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club                 | Summit K9 Sports Club                                                                                                                                                  |
| Location             | Summit Indoor Sports Arena, 55 Ridgeline Blvd, Minneapolis, MN                                                                                                         |
| AKC event number(s)  | 2026123404 / 05 / 06                                                                                                                                                   |
| Entries open / close | 08/01/2026 → 09/18/2026 (limited to 90 runs per trial; waitlist enabled)                                                                                               |
| Fees                 | $28 first class / $23 each additional class, same dog, per trial                                                                                                       |
| Trial secretary      | Gordon Price, 55 Ridgeline Blvd, Minneapolis, MN 55418 · (612) 555-0500 · secretary@summitk9.example.com                                                               |
| Trials               | Trial 1: Friday, October 3, 2026 (Judge Elaine Ford) \| Trial 2: Saturday, October 4, 2026 (Judge Victor Nash) \| Trial 3: Sunday, October 5, 2026 (Judge Elaine Ford) |

## What Show C is testing

> Advanced test: three trials, Master + Detective + Handler Discrimination, and five deliberate EDGE CASES (waitlist, day-of scratch, absent, excused, move-up). See the edge-case callouts before entering.

## ⚑ Edge cases in Show C — reproduce each of these

> WAITLIST — Coco (#25) entered Detective (Trial 3) after the class hit its cap. Enter her onto the waitlist, then move her off the waitlist into the class when a spot “opens.” She is then scored normally.
> MOVE-UP — Diesel (#20) mailed in Exterior Excellent. He finished that title, so before Trial 2 his entry is moved UP to Exterior Master. Score him in Master.
> DAY-OF SCRATCH — Hazel (#23) is entered in Container Advanced (Trial 2) but scratches at check-in. Mark her scratched; she should not receive a score or placement.
> ABSENT — Titan (#24) is entered in Exterior Excellent (Trial 3) but never reports to the ring. Mark ABS.
> EXCUSED — Piper (#21) is excused from Interior Excellent (Trial 2) — dog fouled the search area. Mark EX.

### Trial 1 — Friday, October 3, 2026 — Judge Elaine Ford

| Field                           | Value                                             |
| ------------------------------- | ------------------------------------------------- |
| Class                           | Entered (armband auto-assigned by app)            |
| Container Master                | Athena (#19), Diesel (#20), Gus (#22), Coco (#25) |
| Interior Master                 | Athena (#19), Gus (#22), Coco (#25)               |
| Container Excellent             | Piper (#21), Titan (#24), Diesel (#20)            |
| Handler Discrimination Advanced | Hazel (#23)                                       |

### Trial 2 — Saturday, October 4, 2026 — Judge Victor Nash

| Field              | Value                                  |
| ------------------ | -------------------------------------- |
| Class              | Entered (armband auto-assigned by app) |
| Buried Master      | Athena (#19), Gus (#22), Coco (#25)    |
| Exterior Master    | Athena (#19), Coco (#25), Diesel (#20) |
| Interior Excellent | Piper (#21), Titan (#24)               |
| Container Advanced | Hazel (#23)                            |

### Trial 3 — Sunday, October 5, 2026 — Judge Elaine Ford

| Field                         | Value                                  |
| ----------------------------- | -------------------------------------- |
| Class                         | Entered (armband auto-assigned by app) |
| Detective (Elite)             | Gus (#22), Athena (#19), Coco (#25)    |
| Exterior Excellent            | Piper (#21), Titan (#24)               |
| Handler Discrimination Master | Athena (#19), Gus (#22)                |

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 1 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Interior               | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice A
- Trial 1: Interior Novice A

### DOG

| Field            | Value                  |
| ---------------- | ---------------------- |
| Registered name  | Cedar Ridge Blue Belle |
| Call name        | Bella                  |
| AKC / PAL number | PAL 4123456            |
| Breed            | All-American Dog       |
| Sex              | Female                 |
| Date of birth    | 03/14/2021             |
| Jump height      | N/A (Scent Work)       |
| Breeder          | Unknown (rescue)       |
| Sire             | Unknown                |
| Dam              | Unknown                |

### OWNER / HANDLER

| Field                  | Value                                |
| ---------------------- | ------------------------------------ |
| Owner name             | Jennifer Walsh                       |
| Address                | 148 Maple St, Cedar Rapids, IA 52402 |
| Phone                  | 319-555-0142                         |
| Email                  | jwalsh@example.com                   |
| Handler (if different) | Same as owner                        |
| Junior handler #       | —                                    |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Jennifer Walsh Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 2 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice A

### DOG

| Field            | Value                     |
| ---------------- | ------------------------- |
| Registered name  | Willowbrook Copper Penny  |
| Call name        | Cooper                    |
| AKC / PAL number | SR91234501                |
| Breed            | Labrador Retriever        |
| Sex              | Male                      |
| Date of birth    | 06/02/2020                |
| Jump height      | N/A (Scent Work)          |
| Breeder          | Willowbrook Labradors     |
| Sire             | Willowbrook Gold Standard |
| Dam              | Willowbrook Autumn Rain   |

### OWNER / HANDLER

| Field                  | Value                         |
| ---------------------- | ----------------------------- |
| Owner name             | David Nguyen                  |
| Address                | 22 Birch Ln, Marion, IA 52302 |
| Phone                  | 319-555-0188                  |
| Email                  | dnguyen@example.com           |
| Handler (if different) | Same as owner                 |
| Junior handler #       | —                             |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: David Nguyen Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 3 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Interior Novice B
- Trial 1: Exterior Novice B

### DOG

| Field            | Value                     |
| ---------------- | ------------------------- |
| Registered name  | Nightfall Silver Moonrise |
| Call name        | Luna                      |
| AKC / PAL number | SS01234502                |
| Breed            | Belgian Malinois          |
| Sex              | Female                    |
| Date of birth    | 09/20/2019                |
| Jump height      | N/A (Scent Work)          |
| Breeder          | Nightfall Working Dogs    |
| Sire             | Nightfall Iron Will       |
| Dam              | Nightfall Evening Star    |

### OWNER / HANDLER

| Field                  | Value                                 |
| ---------------------- | ------------------------------------- |
| Owner name             | Priya Patel                           |
| Address                | 3390 Oakcrest Rd, Iowa City, IA 52246 |
| Phone                  | 319-555-0111                          |
| Email                  | ppatel@example.com                    |
| Handler (if different) | Same as owner                         |
| Junior handler #       | —                                     |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Priya Patel Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 4 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Buried Novice B

### DOG

| Field            | Value                      |
| ---------------- | -------------------------- |
| Registered name  | Prairie Wind Maximus       |
| Call name        | Max                        |
| AKC / PAL number | SR88123403                 |
| Breed            | German Shorthaired Pointer |
| Sex              | Male                       |
| Date of birth    | 11/11/2018                 |
| Jump height      | N/A (Scent Work)           |
| Breeder          | Prairie Wind GSPs          |
| Sire             | Prairie Wind Thunder       |
| Dam              | Prairie Wind Field Song    |

### OWNER / HANDLER

| Field                  | Value                              |
| ---------------------- | ---------------------------------- |
| Owner name             | Robert Kline                       |
| Address                | 76 Willow Dr, Coralville, IA 52241 |
| Phone                  | 319-555-0175                       |
| Email                  | rkline@example.com                 |
| Handler (if different) | Same as owner                      |
| Junior handler #       | —                                  |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Robert Kline Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 5 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice A

### DOG

| Field            | Value                      |
| ---------------- | -------------------------- |
| Registered name  | Sunnyside Field of Daisies |
| Call name        | Daisy                      |
| AKC / PAL number | SS12345604                 |
| Breed            | Beagle                     |
| Sex              | Female                     |
| Date of birth    | 01/25/2022                 |
| Jump height      | N/A (Scent Work)           |
| Breeder          | Sunnyside Beagles          |
| Sire             | Sunnyside Trailblazer      |
| Dam              | Sunnyside Meadowlark       |

### OWNER / HANDLER

| Field                  | Value                          |
| ---------------------- | ------------------------------ |
| Owner name             | Emily Carter                   |
| Address                | 512 Elm St, Hiawatha, IA 52233 |
| Phone                  | 319-555-0163                   |
| Email                  | ecarter@example.com            |
| Handler (if different) | Same as owner                  |
| Junior handler #       | —                              |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Emily Carter Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 6 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Buried Novice B

### DOG

| Field            | Value                 |
| ---------------- | --------------------- |
| Registered name  | Stonewall Rocky Road  |
| Call name        | Rocky                 |
| AKC / PAL number | SR99234505            |
| Breed            | Australian Shepherd   |
| Sex              | Male                  |
| Date of birth    | 04/08/2019            |
| Jump height      | N/A (Scent Work)      |
| Breeder          | Stonewall Aussies     |
| Sire             | Stonewall Blue Steel  |
| Dam              | Stonewall Merle Magic |

### OWNER / HANDLER

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| Owner name             | Michael Brooks                      |
| Address                | 88 Cedar Ct, Cedar Rapids, IA 52403 |
| Phone                  | 319-555-0129                        |
| Email                  | mbrooks@example.com                 |
| Handler (if different) | Same as owner                       |
| Junior handler #       | —                                   |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Michael Brooks Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 7 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Interior               | [ X ]    | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice A
- Trial 1: Interior Novice A

### DOG

| Field            | Value                    |
| ---------------- | ------------------------ |
| Registered name  | Goldleaf Sweet Sadie Mae |
| Call name        | Sadie                    |
| AKC / PAL number | SS23456706               |
| Breed            | Golden Retriever         |
| Sex              | Female                   |
| Date of birth    | 07/30/2021               |
| Jump height      | N/A (Scent Work)         |
| Breeder          | Goldleaf Retrievers      |
| Sire             | Goldleaf Sunlit Path     |
| Dam              | Goldleaf Honey Harvest   |

### OWNER / HANDLER

| Field                  | Value                                       |
| ---------------------- | ------------------------------------------- |
| Owner name             | Laura Simmons                               |
| Address                | 1901 Pinehurst Ave, North Liberty, IA 52317 |
| Phone                  | 319-555-0154                                |
| Email                  | lsimmons@example.com                        |
| Handler (if different) | Same as owner                               |
| Junior handler #       | —                                           |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Laura Simmons Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 8 of 25

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Entering show       | Show A — Cedar Valley DTC Scent Work Trial |
| AKC event number(s) | 2026123401                                 |
| Trial(s) entered    | Trial 1 (Saturday, August 15, 2026)        |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Interior Novice B
- Trial 1: Exterior Novice B

### DOG

| Field            | Value                    |
| ---------------- | ------------------------ |
| Registered name  | Bordertown Charlie Brown |
| Call name        | Charlie                  |
| AKC / PAL number | SR77345607               |
| Breed            | Border Collie            |
| Sex              | Male                     |
| Date of birth    | 10/16/2017               |
| Jump height      | N/A (Scent Work)         |
| Breeder          | Bordertown Collies       |
| Sire             | Bordertown Eclipse       |
| Dam              | Bordertown Quicksilver   |

### OWNER / HANDLER

| Field                  | Value                           |
| ---------------------- | ------------------------------- |
| Owner name             | Thomas Reed                     |
| Address                | 44 Hickory Rd, Marion, IA 52302 |
| Phone                  | 319-555-0198                    |
| Email                  | treed@example.com               |
| Handler (if different) | Same as owner                   |
| Junior handler #       | —                               |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Thomas Reed Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 9 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Advanced
- Trial 1: Interior Advanced
- Trial 2: Exterior Advanced

### DOG

| Field            | Value                   |
| ---------------- | ----------------------- |
| Registered name  | Copperfield Ginger Snap |
| Call name        | Ginger                  |
| AKC / PAL number | SS34567808              |
| Breed            | Vizsla                  |
| Sex              | Female                  |
| Date of birth    | 02/19/2020              |
| Jump height      | N/A (Scent Work)        |
| Breeder          | Copperfield Vizslas     |
| Sire             | Copperfield Rust Baron  |
| Dam              | Copperfield Amber Glow  |

### OWNER / HANDLER

| Field                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Owner name             | Angela Foster                          |
| Address                | 720 Riverside Dr, Des Moines, IA 50309 |
| Phone                  | 515-555-0143                           |
| Email                  | afoster@example.com                    |
| Handler (if different) | Same as owner                          |
| Junior handler #       | —                                      |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Angela Foster Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 10 of 25

| Field               | Value                                          |
| ------------------- | ---------------------------------------------- |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials) |
| AKC event number(s) | 2026123402 / 2026123403                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026)         |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Interior Novice B

### DOG

| Field            | Value                   |
| ---------------- | ----------------------- |
| Registered name  | Timberline Gentle Moose |
| Call name        | Moose                   |
| AKC / PAL number | SR85456709              |
| Breed            | Bernese Mountain Dog    |
| Sex              | Male                    |
| Date of birth    | 12/05/2019              |
| Jump height      | N/A (Scent Work)        |
| Breeder          | Timberline Berners      |
| Sire             | Timberline Summit King  |
| Dam              | Timberline Alpine Rose  |

### OWNER / HANDLER

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| Owner name             | Kevin Marsh                             |
| Address                | 34 Grand Ave, West Des Moines, IA 50265 |
| Phone                  | 515-555-0177                            |
| Email                  | kmarsh@example.com                      |
| Handler (if different) | Same as owner                           |
| Junior handler #       | —                                       |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Kevin Marsh Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 11 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Excellent
- Trial 1: Interior Excellent
- Trial 2: Exterior Excellent

### DOG

| Field            | Value                 |
| ---------------- | --------------------- |
| Registered name  | Regalia Queen of Nala |
| Call name        | Nala                  |
| AKC / PAL number | SS45678910            |
| Breed            | Doberman Pinscher     |
| Sex              | Female                |
| Date of birth    | 05/22/2021            |
| Jump height      | N/A (Scent Work)      |
| Breeder          | Regalia Dobermans     |
| Sire             | Regalia Black Tie     |
| Dam              | Regalia Velvet Crown  |

### OWNER / HANDLER

| Field                  | Value                           |
| ---------------------- | ------------------------------- |
| Owner name             | Christine Yu                    |
| Address                | 210 Locust St, Ankeny, IA 50023 |
| Phone                  | 515-555-0166                    |
| Email                  | cyu@example.com                 |
| Handler (if different) | Same as owner                   |
| Junior handler #       | —                               |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Christine Yu Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 12 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Advanced
- Trial 2: Exterior Advanced
- Trial 2: Container Advanced

### DOG

| Field            | Value                   |
| ---------------- | ----------------------- |
| Registered name  | Ironclad Bruno the Bold |
| Call name        | Bruno                   |
| AKC / PAL number | SR83567811              |
| Breed            | Boxer                   |
| Sex              | Male                    |
| Date of birth    | 08/14/2018              |
| Jump height      | N/A (Scent Work)        |
| Breeder          | Ironclad Boxers         |
| Sire             | Ironclad Heavyweight    |
| Dam              | Ironclad Fawn Fury      |

### OWNER / HANDLER

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| Owner name             | Daniel O'Connor                     |
| Address                | 55 Ashworth Rd, Urbandale, IA 50322 |
| Phone                  | 515-555-0122                        |
| Email                  | doconnor@example.com                |
| Handler (if different) | Same as owner                       |
| Junior handler #       | —                                   |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Daniel O'Connor Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 13 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Interior Novice B
- Trial 2: Exterior Novice B

### DOG

| Field            | Value                        |
| ---------------- | ---------------------------- |
| Registered name  | Winddancer Whispering Willow |
| Call name        | Willow                       |
| AKC / PAL number | SS56789012                   |
| Breed            | Shetland Sheepdog            |
| Sex              | Female                       |
| Date of birth    | 03/03/2022                   |
| Jump height      | N/A (Scent Work)             |
| Breeder          | Winddancer Shelties          |
| Sire             | Winddancer Sable Storm       |
| Dam              | Winddancer Moonbeam          |

### OWNER / HANDLER

| Field                  | Value                                |
| ---------------------- | ------------------------------------ |
| Owner name             | Rachel Adams                         |
| Address                | 908 Beaver Ave, Des Moines, IA 50310 |
| Phone                  | 515-555-0138                         |
| Email                  | radams@example.com                   |
| Handler (if different) | Same as owner                        |
| Junior handler #       | —                                    |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Rachel Adams Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 14 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Advanced
- Trial 1: Interior Advanced
- Trial 2: Container Advanced

### DOG

| Field            | Value                       |
| ---------------- | --------------------------- |
| Registered name  | Thunderpaw Zeus Almighty    |
| Call name        | Zeus                        |
| AKC / PAL number | SR86678913                  |
| Breed            | Rottweiler                  |
| Sex              | Male                        |
| Date of birth    | 01/27/2019                  |
| Jump height      | N/A (Scent Work)            |
| Breeder          | Thunderpaw Rottweilers      |
| Sire             | Thunderpaw Colossus         |
| Dam              | Thunderpaw Midnight Duchess |

### OWNER / HANDLER

| Field                  | Value                          |
| ---------------------- | ------------------------------ |
| Owner name             | Marcus Bell                    |
| Address                | 17 Hickman Rd, Clive, IA 50325 |
| Phone                  | 515-555-0191                   |
| Email                  | mbell@example.com              |
| Handler (if different) | Same as owner                  |
| Junior handler #       | —                              |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Marcus Bell Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 15 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Excellent
- Trial 1: Interior Excellent
- Trial 2: Exterior Excellent

### DOG

| Field            | Value                      |
| ---------------- | -------------------------- |
| Registered name  | Merriweather Lucky Penny   |
| Call name        | Penny                      |
| AKC / PAL number | SS67890114                 |
| Breed            | Cocker Spaniel             |
| Sex              | Female                     |
| Date of birth    | 10/09/2020                 |
| Jump height      | N/A (Scent Work)           |
| Breeder          | Merriweather Cockers       |
| Sire             | Merriweather Golden Ticket |
| Dam              | Merriweather Buttercup     |

### OWNER / HANDLER

| Field                  | Value                                    |
| ---------------------- | ---------------------------------------- |
| Owner name             | Stephanie Grant                          |
| Address                | 640 University Ave, Des Moines, IA 50314 |
| Phone                  | 515-555-0107                             |
| Email                  | sgrant@example.com                       |
| Handler (if different) | Same as owner                            |
| Junior handler #       | —                                        |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Stephanie Grant Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 16 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 2: Exterior Novice B

### DOG

| Field            | Value                    |
| ---------------- | ------------------------ |
| Registered name  | Avant-Garde Oliver Twist |
| Call name        | Ollie                    |
| AKC / PAL number | SS78901215               |
| Breed            | Standard Poodle          |
| Sex              | Male                     |
| Date of birth    | 06/18/2021               |
| Jump height      | N/A (Scent Work)         |
| Breeder          | Avant-Garde Poodles      |
| Sire             | Avant-Garde Beau Monde   |
| Dam              | Avant-Garde Ooh La La    |

### OWNER / HANDLER

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| Owner name             | Nathan Price                        |
| Address                | 25 Merle Hay Rd, Johnston, IA 50131 |
| Phone                  | 515-555-0159                        |
| Email                  | nprice@example.com                  |
| Handler (if different) | Same as owner                       |
| Junior handler #       | —                                   |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Nathan Price Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 17 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Advanced
- Trial 1: Interior Advanced
- Trial 2: Exterior Advanced

### DOG

| Field            | Value                |
| ---------------- | -------------------- |
| Registered name  | Rubicon Ruby Tuesday |
| Call name        | Ruby                 |
| AKC / PAL number | PAL 4765432          |
| Breed            | All-American Dog     |
| Sex              | Female               |
| Date of birth    | 04/12/2018           |
| Jump height      | N/A (Scent Work)     |
| Breeder          | Unknown (rescue)     |
| Sire             | Unknown              |
| Dam              | Unknown              |

### OWNER / HANDLER

| Field                  | Value                                |
| ---------------------- | ------------------------------------ |
| Owner name             | Victoria Lang                        |
| Address                | 812 Euclid Ave, Des Moines, IA 50313 |
| Phone                  | 515-555-0184                         |
| Email                  | vlang@example.com                    |
| Handler (if different) | Same as owner                        |
| Junior handler #       | —                                    |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Victoria Lang Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 18 of 25

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Entering show       | Show B — Riverside SWA Fall Classic (2 trials)                                 |
| AKC event number(s) | 2026123402 / 2026123403                                                        |
| Trial(s) entered    | Trial 1 (Saturday, September 12, 2026) \| Trial 2 (Sunday, September 13, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Interior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ X ]    | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Novice B
- Trial 1: Interior Novice B
- Trial 2: Exterior Novice B

### DOG

| Field            | Value                   |
| ---------------- | ----------------------- |
| Registered name  | Grayghost Finnegan      |
| Call name        | Finn                    |
| AKC / PAL number | SR84789016              |
| Breed            | Weimaraner              |
| Sex              | Male                    |
| Date of birth    | 09/01/2020              |
| Jump height      | N/A (Scent Work)        |
| Breeder          | Grayghost Weimaraners   |
| Sire             | Grayghost Silver Bullet |
| Dam              | Grayghost Misty Morning |

### OWNER / HANDLER

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| Owner name             | Gregory Sanders                     |
| Address                | 39 Douglas Ave, Urbandale, IA 50322 |
| Phone                  | 515-555-0113                        |
| Email                  | gsanders@example.com                |
| Handler (if different) | Same as owner                       |
| Junior handler #       | —                                   |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Gregory Sanders Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 19 of 25

| Field               | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                                                                 |
| AKC event number(s) | 2026123404 / 05 / 06                                                                                          |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) \| Trial 3 (Sunday, October 5, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |

[ X ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Master
- Trial 1: Interior Master
- Trial 2: Buried Master
- Trial 2: Exterior Master
- Trial 3: Detective (Elite)
- Trial 3: Handler Discrimination Master

### DOG

| Field            | Value                 |
| ---------------- | --------------------- |
| Registered name  | Olympus Athena Wisdom |
| Call name        | Athena                |
| AKC / PAL number | SR82890117            |
| Breed            | Belgian Tervuren      |
| Sex              | Female                |
| Date of birth    | 03/30/2018            |
| Jump height      | N/A (Scent Work)      |
| Breeder          | Olympus Tervurens     |
| Sire             | Olympus Warrior Poet  |
| Dam              | Olympus Golden Fleece |

### OWNER / HANDLER

| Field                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Owner name             | Helen Frost                            |
| Address                | 145 Prospect St, Minneapolis, MN 55418 |
| Phone                  | 612-555-0148                           |
| Email                  | hfrost@example.com                     |
| Handler (if different) | Same as owner                          |
| Junior handler #       | —                                      |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Helen Frost Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 20 of 25

| Field               | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                            |
| AKC event number(s) | 2026123404 / 05 / 06                                                     |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ X ]     | [ X ]  |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Master
- Trial 1: Container Excellent
- Trial 2: Exterior Excellent — MOVE-UP: entered Exterior Excellent by mail; handler moved this entry up to Master before Trial 2 (title finished). Score is recorded in Master.

### DOG

| Field            | Value                       |
| ---------------- | --------------------------- |
| Registered name  | Motorhead Diesel Engine     |
| Call name        | Diesel                      |
| AKC / PAL number | SS89012318                  |
| Breed            | Dutch Shepherd              |
| Sex              | Male                        |
| Date of birth    | 07/07/2017                  |
| Jump height      | N/A (Scent Work)            |
| Breeder          | Motorhead Working Dogs      |
| Sire             | Motorhead Turbo             |
| Dam              | Motorhead Brindle Bombshell |

### OWNER / HANDLER

| Field                  | Value                                 |
| ---------------------- | ------------------------------------- |
| Owner name             | Frank Delgado                         |
| Address                | 67 Lyndale Ave, Minneapolis, MN 55405 |
| Phone                  | 612-555-0172                          |
| Email                  | fdelgado@example.com                  |
| Handler (if different) | Same as owner                         |
| Junior handler #       | —                                     |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Frank Delgado Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 21 of 25

| Field               | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                                                                 |
| AKC event number(s) | 2026123404 / 05 / 06                                                                                          |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) \| Trial 3 (Sunday, October 5, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Excellent
- Trial 2: Interior Excellent
- Trial 3: Exterior Excellent

### DOG

| Field            | Value                       |
| ---------------- | --------------------------- |
| Registered name  | Highland Pied Piper         |
| Call name        | Piper                       |
| AKC / PAL number | SR81901219                  |
| Breed            | Brittany                    |
| Sex              | Female                      |
| Date of birth    | 11/23/2019                  |
| Jump height      | N/A (Scent Work)            |
| Breeder          | Highland Brittanys          |
| Sire             | Highland Piper at the Gates |
| Dam              | Highland Orange Blossom     |

### OWNER / HANDLER

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| Owner name             | Karen Whitfield                         |
| Address                | 300 Hennepin Ave, Minneapolis, MN 55401 |
| Phone                  | 612-555-0136                            |
| Email                  | kwhitfield@example.com                  |
| Handler (if different) | Same as owner                           |
| Junior handler #       | —                                       |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Karen Whitfield Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 22 of 25

| Field               | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                                                                 |
| AKC event number(s) | 2026123404 / 05 / 06                                                                                          |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) \| Trial 3 (Sunday, October 5, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |

[ X ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Master
- Trial 1: Interior Master
- Trial 2: Buried Master
- Trial 3: Detective (Elite)
- Trial 3: Handler Discrimination Master

### DOG

| Field            | Value                    |
| ---------------- | ------------------------ |
| Registered name  | Sherlock Augustus Holmes |
| Call name        | Gus                      |
| AKC / PAL number | SR80012320               |
| Breed            | Bloodhound               |
| Sex              | Male                     |
| Date of birth    | 05/15/2016               |
| Jump height      | N/A (Scent Work)         |
| Breeder          | Sherlock Bloodhounds     |
| Sire             | Sherlock Deduction       |
| Dam              | Sherlock Crimson Trail   |

### OWNER / HANDLER

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| Owner name             | Andrew Boyle                            |
| Address                | 512 Nicollet Ave, Minneapolis, MN 55403 |
| Phone                  | 612-555-0169                            |
| Email                  | aboyle@example.com                      |
| Handler (if different) | Same as owner                           |
| Junior handler #       | —                                       |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Andrew Boyle Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 23 of 25

| Field               | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                            |
| AKC event number(s) | 2026123404 / 05 / 06                                                     |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ X ]    | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Handler Discrimination Advanced
- Trial 2: Container Advanced

### DOG

| Field            | Value                     |
| ---------------- | ------------------------- |
| Registered name  | Pepperbox Hazelnut        |
| Call name        | Hazel                     |
| AKC / PAL number | SS90123421                |
| Breed            | Miniature Schnauzer       |
| Sex              | Female                    |
| Date of birth    | 08/08/2020                |
| Jump height      | N/A (Scent Work)          |
| Breeder          | Pepperbox Minis           |
| Sire             | Pepperbox Salt and Pepper |
| Dam              | Pepperbox Silver Spice    |

### OWNER / HANDLER

| Field                  | Value                                 |
| ---------------------- | ------------------------------------- |
| Owner name             | Diane Russo                           |
| Address                | 78 Washington Ave, St. Paul, MN 55102 |
| Phone                  | 651-555-0155                          |
| Email                  | drusso@example.com                    |
| Handler (if different) | Same as owner                         |
| Junior handler #       | —                                     |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Diane Russo Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 24 of 25

| Field               | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                                                                 |
| AKC event number(s) | 2026123404 / 05 / 06                                                                                          |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) \| Trial 3 (Sunday, October 5, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Interior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Exterior               | [ ]      | [ ]      | [ ]      | [ X ]     | [ ]    |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Excellent
- Trial 2: Interior Excellent
- Trial 3: Exterior Excellent

### DOG

| Field            | Value                 |
| ---------------- | --------------------- |
| Registered name  | Colossus Titan of Old |
| Call name        | Titan                 |
| AKC / PAL number | SR79123422            |
| Breed            | Giant Schnauzer       |
| Sex              | Male                  |
| Date of birth    | 02/11/2017            |
| Jump height      | N/A (Scent Work)      |
| Breeder          | Colossus Giants       |
| Sire             | Colossus Ironhide     |
| Dam              | Colossus Black Pearl  |

### OWNER / HANDLER

| Field                  | Value                              |
| ---------------------- | ---------------------------------- |
| Owner name             | Paul Hendricks                     |
| Address                | 233 Summit Ave, St. Paul, MN 55105 |
| Phone                  | 651-555-0102                       |
| Email                  | phendricks@example.com             |
| Handler (if different) | Same as owner                      |
| Junior handler #       | —                                  |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Paul Hendricks Date: ****/****/2026

## OFFICIAL AKC SCENT WORK ENTRY FORM

> Mail-in entry 25 of 25

| Field               | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entering show       | Show C — Summit K9 Masters Weekend (3 trials)                                                                 |
| AKC event number(s) | 2026123404 / 05 / 06                                                                                          |
| Trial(s) entered    | Trial 1 (Friday, October 3, 2026) \| Trial 2 (Saturday, October 4, 2026) \| Trial 3 (Sunday, October 5, 2026) |

### CLASSES ENTERED

| Element                | Novice A | Novice B | Advanced | Excellent | Master |
| ---------------------- | -------- | -------- | -------- | --------- | ------ |
| Container              | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Interior               | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Exterior               | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Buried                 | [ ]      | [ ]      | [ ]      | [ ]       | [ X ]  |
| Handler Discrimination | [ ]      | [ ]      | [ ]      | [ ]       | [ ]    |

[ X ] Detective (Elite) — all elements combined, single class

Class-by-class (as mailed in):

- Trial 1: Container Master
- Trial 1: Interior Master
- Trial 2: Buried Master
- Trial 2: Exterior Master
- Trial 3: Detective (Elite) — WAITLIST: entered after cap reached; secretary moved off waitlist when a scratch opened a spot.

### DOG

| Field            | Value              |
| ---------------- | ------------------ |
| Registered name  | Cocoa Bean Delight |
| Call name        | Coco               |
| AKC / PAL number | PAL 4321654        |
| Breed            | All-American Dog   |
| Sex              | Female             |
| Date of birth    | 06/27/2019         |
| Jump height      | N/A (Scent Work)   |
| Breeder          | Unknown (rescue)   |
| Sire             | Unknown            |
| Dam              | Unknown            |

### OWNER / HANDLER

| Field                  | Value                             |
| ---------------------- | --------------------------------- |
| Owner name             | Michelle Tran                     |
| Address                | 401 Grand Ave, St. Paul, MN 55102 |
| Phone                  | 651-555-0193                      |
| Email                  | mtran@example.com                 |
| Handler (if different) | Same as owner                     |
| Junior handler #       | —                                 |

I certify that I am the actual owner of this dog, or that I am the duly authorized agent of the actual owner. I agree to abide by the AKC rules and regulations for Scent Work.

Signature: Michelle Tran Date: ****/****/2026

# Scoring key

Enter these exact results. Placement is what the app should compute once the entire class is scored — a blank placement means the run qualified but did not finish in the top 4 (or did not qualify). Compare the app’s placements to this column.

Time is search time in seconds. NQ/ABS/EX have no time and no placement.

## Show A — Cedar Valley DTC Scent Work Trial

### Trial 1 — Saturday, August 15, 2026

### Container Novice A

| #   | Dog                                | Result | Faults | Time (s) | Placement / notes                     |
| --- | ---------------------------------- | ------ | ------ | -------- | ------------------------------------- |
| 1   | Bella — Cedar Ridge Blue Belle     | Q      | 0      | 38.4     | 1st                                   |
| 2   | Cooper — Willowbrook Copper Penny  | Q      | 0      | 52.1     | 2nd                                   |
| 5   | Daisy — Sunnyside Field of Daisies | Q      | 1      | 44.8     | 3rd                                   |
| 7   | Sadie — Goldleaf Sweet Sadie Mae   | NQ     | —      | —        | Fault limit exceeded (2 false alerts) |

### Container Novice B

| #   | Dog                                | Result | Faults | Time (s) | Placement / notes |
| --- | ---------------------------------- | ------ | ------ | -------- | ----------------- |
| 3   | Luna — Nightfall Silver Moonrise   | Q      | 0      | 29.6     | 1st               |
| 4   | Max — Prairie Wind Maximus         | Q      | 0      | 41.0     | 4th               |
| 6   | Rocky — Stonewall Rocky Road       | Q      | 0      | 35.2     | 3rd               |
| 8   | Charlie — Bordertown Charlie Brown | Q      | 0      | 33.9     | 2nd               |

### Interior Novice A

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 1   | Bella — Cedar Ridge Blue Belle   | Q      | 0      | 61.2     | 1st               |
| 7   | Sadie — Goldleaf Sweet Sadie Mae | Q      | 0      | 74.5     | 2nd               |

### Interior Novice B

| #   | Dog                                | Result | Faults | Time (s) | Placement / notes       |
| --- | ---------------------------------- | ------ | ------ | -------- | ----------------------- |
| 3   | Luna — Nightfall Silver Moonrise   | Q      | 0      | 48.0     | 1st                     |
| 8   | Charlie — Bordertown Charlie Brown | NQ     | —      | —        | Timeout (missed 1 hide) |

### Buried Novice B

| #   | Dog                          | Result | Faults | Time (s) | Placement / notes |
| --- | ---------------------------- | ------ | ------ | -------- | ----------------- |
| 4   | Max — Prairie Wind Maximus   | Q      | 0      | 88.3     | 2nd               |
| 6   | Rocky — Stonewall Rocky Road | Q      | 0      | 79.1     | 1st               |

### Exterior Novice B

| #   | Dog                                | Result | Faults | Time (s) | Placement / notes |
| --- | ---------------------------------- | ------ | ------ | -------- | ----------------- |
| 8   | Charlie — Bordertown Charlie Brown | Q      | 0      | 57.7     | 1st               |
| 3   | Luna — Nightfall Silver Moonrise   | Q      | 1      | 63.4     | 2nd               |

## Show B — Riverside SWA Fall Classic (2 trials)

### Trial 1 — Saturday, September 12, 2026

### Container Novice B

| #   | Dog                                   | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------------- | ------ | ------ | -------- | ----------------- |
| 10  | Moose — Timberline Gentle Moose       | Q      | 0      | 47.2     | 3rd               |
| 13  | Willow — Winddancer Whispering Willow | Q      | 0      | 39.9     | 1st               |
| 16  | Ollie — Avant-Garde Oliver Twist      | Q      | 0      | 44.1     | 2nd               |
| 18  | Finn — Grayghost Finnegan             | Q      | 1      | 51.6     | 4th               |

### Container Advanced

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes    |
| --- | -------------------------------- | ------ | ------ | -------- | -------------------- |
| 9   | Ginger — Copperfield Ginger Snap | Q      | 0      | 62.5     | 2nd                  |
| 12  | Bruno — Ironclad Bruno the Bold  | NQ     | —      | —        | Fault limit exceeded |
| 14  | Zeus — Thunderpaw Zeus Almighty  | Q      | 0      | 70.3     | 3rd                  |
| 17  | Ruby — Rubicon Ruby Tuesday      | Q      | 0      | 58.8     | 1st                  |

### Container Excellent

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 11  | Nala — Regalia Queen of Nala     | Q      | 0      | 96.4     | 1st               |
| 15  | Penny — Merriweather Lucky Penny | Q      | 1      | 88.0     | 2nd               |

### Interior Novice B

| #   | Dog                                   | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------------- | ------ | ------ | -------- | ----------------- |
| 10  | Moose — Timberline Gentle Moose       | Q      | 0      | 66.0     | 2nd               |
| 13  | Willow — Winddancer Whispering Willow | Q      | 0      | 59.4     | 1st               |
| 18  | Finn — Grayghost Finnegan             | NQ     | —      | —        | Timeout           |

### Interior Advanced

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 9   | Ginger — Copperfield Ginger Snap | Q      | 0      | 83.7     | 2nd               |
| 14  | Zeus — Thunderpaw Zeus Almighty  | Q      | 0      | 91.2     | 3rd               |
| 17  | Ruby — Rubicon Ruby Tuesday      | Q      | 0      | 78.5     | 1st               |

### Interior Excellent

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes                  |
| --- | -------------------------------- | ------ | ------ | -------- | ---------------------------------- |
| 11  | Nala — Regalia Queen of Nala     | Q      | 0      | 120.9    | 1st                                |
| 15  | Penny — Merriweather Lucky Penny | NQ     | —      | —        | Handler called alert on wrong area |

### Trial 2 — Sunday, September 13, 2026

### Exterior Novice B

| #   | Dog                                   | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------------- | ------ | ------ | -------- | ----------------- |
| 13  | Willow — Winddancer Whispering Willow | Q      | 0      | 41.3     | 2nd               |
| 16  | Ollie — Avant-Garde Oliver Twist      | Q      | 0      | 38.0     | 1st               |
| 18  | Finn — Grayghost Finnegan             | Q      | 0      | 49.9     | 3rd               |

### Exterior Advanced

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 9   | Ginger — Copperfield Ginger Snap | Q      | 0      | 64.8     | 1st               |
| 12  | Bruno — Ironclad Bruno the Bold  | Q      | 0      | 71.5     | 2nd               |
| 17  | Ruby — Rubicon Ruby Tuesday      | Q      | 1      | 69.2     | 3rd               |

### Exterior Excellent

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 11  | Nala — Regalia Queen of Nala     | Q      | 0      | 101.7    | 1st               |
| 15  | Penny — Merriweather Lucky Penny | Q      | 0      | 110.4    | 2nd               |

### Container Advanced

| #   | Dog                             | Result | Faults | Time (s) | Placement / notes    |
| --- | ------------------------------- | ------ | ------ | -------- | -------------------- |
| 12  | Bruno — Ironclad Bruno the Bold | Q      | 0      | 66.9     | 1st                  |
| 14  | Zeus — Thunderpaw Zeus Almighty | NQ     | —      | —        | Fault limit exceeded |

## Show C — Summit K9 Masters Weekend (3 trials)

### Trial 1 — Friday, October 3, 2026

### Container Master

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes              |
| --- | -------------------------------- | ------ | ------ | -------- | ------------------------------ |
| 19  | Athena — Olympus Athena Wisdom   | Q      | 0      | 142.6    | 1st                            |
| 20  | Diesel — Motorhead Diesel Engine | Q      | 1      | 151.0    | 3rd                            |
| 22  | Gus — Sherlock Augustus Holmes   | Q      | 0      | 168.9    | 2nd                            |
| 25  | Coco — Cocoa Bean Delight        | NQ     | —      | —        | Missed 1 of 4 hides at timeout |

### Interior Master

| #   | Dog                            | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------ | ------ | ------ | -------- | ----------------- |
| 19  | Athena — Olympus Athena Wisdom | Q      | 0      | 205.4    | 1st               |
| 22  | Gus — Sherlock Augustus Holmes | Q      | 0      | 221.7    | 2nd               |
| 25  | Coco — Cocoa Bean Delight      | Q      | 1      | 230.2    | 3rd               |

### Container Excellent

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------------- | ------ | ------ | -------- | ----------------- |
| 21  | Piper — Highland Pied Piper      | Q      | 0      | 79.5     | 2nd               |
| 24  | Titan — Colossus Titan of Old    | Q      | 0      | 85.1     | 3rd               |
| 20  | Diesel — Motorhead Diesel Engine | Q      | 0      | 72.8     | 1st               |

### Handler Discrimination Advanced

| #   | Dog                        | Result | Faults | Time (s) | Placement / notes |
| --- | -------------------------- | ------ | ------ | -------- | ----------------- |
| 23  | Hazel — Pepperbox Hazelnut | Q      | 0      | 54.3     | 1st               |

### Trial 2 — Saturday, October 4, 2026

### Buried Master

| #   | Dog                            | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------ | ------ | ------ | -------- | ----------------- |
| 19  | Athena — Olympus Athena Wisdom | Q      | 0      | 188.2    | 1st               |
| 22  | Gus — Sherlock Augustus Holmes | Q      | 0      | 199.9    | 2nd               |
| 25  | Coco — Cocoa Bean Delight      | Q      | 0      | 210.5    | 3rd               |

### Exterior Master

| #   | Dog                              | Result | Faults | Time (s) | Placement / notes            |
| --- | -------------------------------- | ------ | ------ | -------- | ---------------------------- |
| 19  | Athena — Olympus Athena Wisdom   | Q      | 0      | 176.0    | 2nd                          |
| 25  | Coco — Cocoa Bean Delight        | Q      | 1      | 181.3    | 3rd                          |
| 20  | Diesel — Motorhead Diesel Engine | Q      | 0      | 169.4    | 1st · move-up from Excellent |

### Interior Excellent

| #   | Dog                           | Result | Faults | Time (s) | Placement / notes                                         |
| --- | ----------------------------- | ------ | ------ | -------- | --------------------------------------------------------- |
| 21  | Piper — Highland Pied Piper   | EX     | —      | —        | EXCUSED — dog eliminated in ring (fouled the search area) |
| 24  | Titan — Colossus Titan of Old | Q      | 0      | 132.7    | 1st                                                       |

### Container Advanced

| #   | Dog                        | Result | Faults | Time (s) | Placement / notes                                               |
| --- | -------------------------- | ------ | ------ | -------- | --------------------------------------------------------------- |
| 23  | Hazel — Pepperbox Hazelnut | ABS    | —      | —        | DAY-OF SCRATCH — handler scratched at check-in · day-of scratch |

### Trial 3 — Sunday, October 5, 2026

### Detective (Elite)

| #   | Dog                            | Result | Faults | Time (s) | Placement / notes  |
| --- | ------------------------------ | ------ | ------ | -------- | ------------------ |
| 22  | Gus — Sherlock Augustus Holmes | Q      | 0      | 298.1    | 1st                |
| 19  | Athena — Olympus Athena Wisdom | Q      | 2      | 315.6    | 3rd                |
| 25  | Coco — Cocoa Bean Delight      | Q      | 1      | 322.9    | 2nd · off waitlist |

### Exterior Excellent

| #   | Dog                           | Result | Faults | Time (s) | Placement / notes                               |
| --- | ----------------------------- | ------ | ------ | -------- | ----------------------------------------------- |
| 21  | Piper — Highland Pied Piper   | Q      | 0      | 118.4    | 1st                                             |
| 24  | Titan — Colossus Titan of Old | ABS    | —      | —        | ABSENT — entered but did not report to the ring |

### Handler Discrimination Master

| #   | Dog                            | Result | Faults | Time (s) | Placement / notes |
| --- | ------------------------------ | ------ | ------ | -------- | ----------------- |
| 19  | Athena — Olympus Athena Wisdom | Q      | 0      | 141.0    | 1st               |
| 22  | Gus — Sherlock Augustus Holmes | Q      | 0      | 155.8    | 2nd               |

# Filled score sheets — AKC official half-page

This reproduces the official AKC Scent Work score sheet that myK9Show stamps and prints (two dogs per page). Here each sheet is shown already completed by the judge — the result, finds, faults, time, and placement are filled from the scoring key. Armband is left blank because myK9Show auto-assigns it; the tester should confirm the app’s sheet shows the same identity + class header.

### Show A · Trial 1 · Container Novice A (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice A · Time limit: 2:00 · Hides: 1
> Armband: ________ · Bella (Cedar Ridge Blue Belle) · All-American Dog · F · packet dog #1
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:38.40 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice A · Time limit: 2:00 · Hides: 1
> Armband: ________ · Cooper (Willowbrook Copper Penny) · Labrador Retriever · M · packet dog #2
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:52.10 Placement: 2nd

### Show A · Trial 1 · Container Novice A (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice A · Time limit: 2:00 · Hides: 1
> Armband: ________ · Daisy (Sunnyside Field of Daisies) · Beagle · F · packet dog #5
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 1 Time: 0:44.80 Placement: 3rd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice A · Time limit: 2:00 · Hides: 1
> Armband: ________ · Sadie (Goldleaf Sweet Sadie Mae) · Golden Retriever · F · packet dog #7
> RESULT: Q (NQ) EX ABS Finds: 1/1 Faults: — Time: — Placement: —
> NQ reason: Incorrect Call (Fault limit exceeded (2 false alerts))

### Show A · Trial 1 · Container Novice B (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Luna (Nightfall Silver Moonrise) · Belgian Malinois · F · packet dog #3
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:29.60 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Max (Prairie Wind Maximus) · German Shorthaired Pointer · M · packet dog #4
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:41.00 Placement: 4th

### Show A · Trial 1 · Container Novice B (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Rocky (Stonewall Rocky Road) · Australian Shepherd · M · packet dog #6
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:35.20 Placement: 3rd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Charlie (Bordertown Charlie Brown) · Border Collie · M · packet dog #8
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:33.90 Placement: 2nd

### Show A · Trial 1 · Interior Novice A

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Interior Novice A · Time limit: 3:00 · Hides: 1
> Armband: ________ · Bella (Cedar Ridge Blue Belle) · All-American Dog · F · packet dog #1
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 1:01.20 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Interior Novice A · Time limit: 3:00 · Hides: 1
> Armband: ________ · Sadie (Goldleaf Sweet Sadie Mae) · Golden Retriever · F · packet dog #7
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 1:14.50 Placement: 2nd

### Show A · Trial 1 · Interior Novice B

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Interior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Luna (Nightfall Silver Moonrise) · Belgian Malinois · F · packet dog #3
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:48.00 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Interior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Charlie (Bordertown Charlie Brown) · Border Collie · M · packet dog #8
> RESULT: Q (NQ) EX ABS Finds: 0/1 Faults: — Time: — Placement: —
> NQ reason: Max Time (Timeout (missed 1 hide))

### Show A · Trial 1 · Buried Novice B

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Buried Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Max (Prairie Wind Maximus) · German Shorthaired Pointer · M · packet dog #4
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 1:28.30 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Buried Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Rocky (Stonewall Rocky Road) · Australian Shepherd · M · packet dog #6
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 1:19.10 Placement: 1st

### Show A · Trial 1 · Exterior Novice B

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Exterior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Charlie (Bordertown Charlie Brown) · Border Collie · M · packet dog #8
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:57.70 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123401 · Saturday, August 15, 2026 · Judge: Margaret Holloway
> Class: Exterior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Luna (Nightfall Silver Moonrise) · Belgian Malinois · F · packet dog #3
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 1 Time: 1:03.40 Placement: 2nd

### Show B · Trial 1 · Container Novice B (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Moose (Timberline Gentle Moose) · Bernese Mountain Dog · M · packet dog #10
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:47.20 Placement: 3rd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Willow (Winddancer Whispering Willow) · Shetland Sheepdog · F · packet dog #13
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:39.90 Placement: 1st

### Show B · Trial 1 · Container Novice B (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Ollie (Avant-Garde Oliver Twist) · Standard Poodle · M · packet dog #16
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:44.10 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Novice B · Time limit: 2:00 · Hides: 1
> Armband: ________ · Finn (Grayghost Finnegan) · Weimaraner · M · packet dog #18
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 1 Time: 0:51.60 Placement: 4th

### Show B · Trial 1 · Container Advanced (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Ginger (Copperfield Ginger Snap) · Vizsla · F · packet dog #9
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:02.50 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Bruno (Ironclad Bruno the Bold) · Boxer · M · packet dog #12
> RESULT: Q (NQ) EX ABS Finds: 2/2 Faults: — Time: — Placement: —
> NQ reason: Incorrect Call (Fault limit exceeded)

### Show B · Trial 1 · Container Advanced (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Zeus (Thunderpaw Zeus Almighty) · Rottweiler · M · packet dog #14
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:10.30 Placement: 3rd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Ruby (Rubicon Ruby Tuesday) · All-American Dog · F · packet dog #17
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 0:58.80 Placement: 1st

### Show B · Trial 1 · Container Excellent

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Excellent · Time limit: 3:00 · Hides: 3
> Armband: ________ · Nala (Regalia Queen of Nala) · Doberman Pinscher · F · packet dog #11
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:36.40 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Container Excellent · Time limit: 3:00 · Hides: 3
> Armband: ________ · Penny (Merriweather Lucky Penny) · Cocker Spaniel · F · packet dog #15
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 1 Time: 1:28.00 Placement: 2nd

### Show B · Trial 1 · Interior Novice B (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Moose (Timberline Gentle Moose) · Bernese Mountain Dog · M · packet dog #10
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 1:06.00 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Willow (Winddancer Whispering Willow) · Shetland Sheepdog · F · packet dog #13
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:59.40 Placement: 1st

### Show B · Trial 1 · Interior Novice B (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Finn (Grayghost Finnegan) · Weimaraner · M · packet dog #18
> RESULT: Q (NQ) EX ABS Finds: 0/1 Faults: — Time: — Placement: —
> NQ reason: Max Time (Timeout)

### Show B · Trial 1 · Interior Advanced (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Ginger (Copperfield Ginger Snap) · Vizsla · F · packet dog #9
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:23.70 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Zeus (Thunderpaw Zeus Almighty) · Rottweiler · M · packet dog #14
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:31.20 Placement: 3rd

### Show B · Trial 1 · Interior Advanced (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Ruby (Rubicon Ruby Tuesday) · All-American Dog · F · packet dog #17
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:18.50 Placement: 1st

### Show B · Trial 1 · Interior Excellent

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Excellent · Time limit: 2:00 / 2:00 · Hides: 3
> Armband: ________ · Nala (Regalia Queen of Nala) · Doberman Pinscher · F · packet dog #11
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 2:00.90 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Saturday, September 12, 2026 · Judge: Alan Whitmore
> Class: Interior Excellent · Time limit: 2:00 / 2:00 · Hides: 3
> Armband: ________ · Penny (Merriweather Lucky Penny) · Cocker Spaniel · F · packet dog #15
> RESULT: Q (NQ) EX ABS Finds: 3/3 Faults: — Time: — Placement: —
> NQ reason: Incorrect Call (Handler called alert on wrong area)

### Show B · Trial 2 · Exterior Novice B (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Willow (Winddancer Whispering Willow) · Shetland Sheepdog · F · packet dog #13
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:41.30 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Ollie (Avant-Garde Oliver Twist) · Standard Poodle · M · packet dog #16
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:38.00 Placement: 1st

### Show B · Trial 2 · Exterior Novice B (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Novice B · Time limit: 3:00 · Hides: 1
> Armband: ________ · Finn (Grayghost Finnegan) · Weimaraner · M · packet dog #18
> RESULT: (Q) NQ EX ABS Finds: 1/1 Faults: 0 Time: 0:49.90 Placement: 3rd

### Show B · Trial 2 · Exterior Advanced (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Ginger (Copperfield Ginger Snap) · Vizsla · F · packet dog #9
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:04.80 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Bruno (Ironclad Bruno the Bold) · Boxer · M · packet dog #12
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:11.50 Placement: 2nd

### Show B · Trial 2 · Exterior Advanced (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Advanced · Time limit: 3:30 · Hides: 2
> Armband: ________ · Ruby (Rubicon Ruby Tuesday) · All-American Dog · F · packet dog #17
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 1 Time: 1:09.20 Placement: 3rd

### Show B · Trial 2 · Exterior Excellent

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Excellent · Time limit: 4:00 · Hides: 3
> Armband: ________ · Nala (Regalia Queen of Nala) · Doberman Pinscher · F · packet dog #11
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:41.70 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Exterior Excellent · Time limit: 4:00 · Hides: 3
> Armband: ________ · Penny (Merriweather Lucky Penny) · Cocker Spaniel · F · packet dog #15
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:50.40 Placement: 2nd

### Show B · Trial 2 · Container Advanced

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Bruno (Ironclad Bruno the Bold) · Boxer · M · packet dog #12
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 1:06.90 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123402 · Sunday, September 13, 2026 · Judge: Susan Petrov
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Zeus (Thunderpaw Zeus Almighty) · Rottweiler · M · packet dog #14
> RESULT: Q (NQ) EX ABS Finds: 2/2 Faults: — Time: — Placement: —
> NQ reason: Incorrect Call (Fault limit exceeded)

### Show C · Trial 1 · Container Master (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Master · Time limit: 3:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:22.60 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Master · Time limit: 3:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Diesel (Motorhead Diesel Engine) · Dutch Shepherd · M · packet dog #20
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 1 Time: 2:31.00 Placement: 3rd

### Show C · Trial 1 · Container Master (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Master · Time limit: 3:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Gus (Sherlock Augustus Holmes) · Bloodhound · M · packet dog #22
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:48.90 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Master · Time limit: 3:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Coco (Cocoa Bean Delight) · All-American Dog · F · packet dog #25
> RESULT: Q (NQ) EX ABS Finds: 3/4 Faults: — Time: — Placement: —
> NQ reason: Max Time (Missed 1 of 4 hides at timeout)

### Show C · Trial 1 · Interior Master (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Interior Master · Time limit: 2:00 / 2:00 / 2:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 3:25.40 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Interior Master · Time limit: 2:00 / 2:00 / 2:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Gus (Sherlock Augustus Holmes) · Bloodhound · M · packet dog #22
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 3:41.70 Placement: 2nd

### Show C · Trial 1 · Interior Master (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Interior Master · Time limit: 2:00 / 2:00 / 2:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Coco (Cocoa Bean Delight) · All-American Dog · F · packet dog #25
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 1 Time: 3:50.20 Placement: 3rd

### Show C · Trial 1 · Container Excellent (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Excellent · Time limit: 3:00 · Hides: 3
> Armband: ________ · Piper (Highland Pied Piper) · Brittany · F · packet dog #21
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:19.50 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Excellent · Time limit: 3:00 · Hides: 3
> Armband: ________ · Titan (Colossus Titan of Old) · Giant Schnauzer · M · packet dog #24
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:25.10 Placement: 3rd

### Show C · Trial 1 · Container Excellent (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Container Excellent · Time limit: 3:00 · Hides: 3
> Armband: ________ · Diesel (Motorhead Diesel Engine) · Dutch Shepherd · M · packet dog #20
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:12.80 Placement: 1st

### Show C · Trial 1 · Handler Discrimination Advanced

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Friday, October 3, 2026 · Judge: Elaine Ford
> Class: Handler Discrimination Advanced · Time limit: 3:00 · Hides: 2
> Armband: ________ · Hazel (Pepperbox Hazelnut) · Miniature Schnauzer · F · packet dog #23
> RESULT: (Q) NQ EX ABS Finds: 2/2 Faults: 0 Time: 0:54.30 Placement: 1st

### Show C · Trial 2 · Buried Master (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Buried Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 3:08.20 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Buried Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Gus (Sherlock Augustus Holmes) · Bloodhound · M · packet dog #22
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 3:19.90 Placement: 2nd

### Show C · Trial 2 · Buried Master (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Buried Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Coco (Cocoa Bean Delight) · All-American Dog · F · packet dog #25
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 3:30.50 Placement: 3rd

### Show C · Trial 2 · Exterior Master (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Exterior Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:56.00 Placement: 2nd

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Exterior Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Coco (Cocoa Bean Delight) · All-American Dog · F · packet dog #25
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 1 Time: 3:01.30 Placement: 3rd

### Show C · Trial 2 · Exterior Master (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Exterior Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Diesel (Motorhead Diesel Engine) · Dutch Shepherd · M · packet dog #20
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:49.40 Placement: 1st
> MOVE-UP: entered Exterior Excellent by mail; handler moved this entry up to Master before Trial 2 (title finished). Score is recorded in Master.

### Show C · Trial 2 · Interior Excellent

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Interior Excellent · Time limit: 2:00 / 2:00 · Hides: 3
> Armband: ________ · Piper (Highland Pied Piper) · Brittany · F · packet dog #21
> RESULT: Q NQ (EX) ABS Finds: — Faults: — Time: — Placement: —
> EX reason: Eliminated in Area (EXCUSED — dog eliminated in ring (fouled the search area))

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Interior Excellent · Time limit: 2:00 / 2:00 · Hides: 3
> Armband: ________ · Titan (Colossus Titan of Old) · Giant Schnauzer · M · packet dog #24
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 2:12.70 Placement: 1st

### Show C · Trial 2 · Container Advanced

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Saturday, October 4, 2026 · Judge: Victor Nash
> Class: Container Advanced · Time limit: 2:30 · Hides: 2
> Armband: ________ · Hazel (Pepperbox Hazelnut) · Miniature Schnauzer · F · packet dog #23
> RESULT: Q NQ EX (ABS) Finds: — Faults: — Time: — Placement: —
> Absent — DAY-OF SCRATCH — handler scratched at check-in

### Show C · Trial 3 · Detective (Elite) (sheet 1 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Detective (Elite) · Time limit: 5:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Gus (Sherlock Augustus Holmes) · Bloodhound · M · packet dog #22
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 4:58.10 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Detective (Elite) · Time limit: 5:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 2 Time: 5:15.60 Placement: 3rd

### Show C · Trial 3 · Detective (Elite) (sheet 2 of 2)

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Detective (Elite) · Time limit: 5:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Coco (Cocoa Bean Delight) · All-American Dog · F · packet dog #25
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 1 Time: 5:22.90 Placement: 2nd
> WAITLIST: entered after cap reached; secretary moved off waitlist when a scratch opened a spot.

### Show C · Trial 3 · Exterior Excellent

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Exterior Excellent · Time limit: 4:00 · Hides: 3
> Armband: ________ · Piper (Highland Pied Piper) · Brittany · F · packet dog #21
> RESULT: (Q) NQ EX ABS Finds: 3/3 Faults: 0 Time: 1:58.40 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Exterior Excellent · Time limit: 4:00 · Hides: 3
> Armband: ________ · Titan (Colossus Titan of Old) · Giant Schnauzer · M · packet dog #24
> RESULT: Q NQ EX (ABS) Finds: — Faults: — Time: — Placement: —
> Absent — ABSENT — entered but did not report to the ring

### Show C · Trial 3 · Handler Discrimination Master

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Handler Discrimination Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Athena (Olympus Athena Wisdom) · Belgian Tervuren · F · packet dog #19
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:21.00 Placement: 1st

## AKC SCENT WORK — OFFICIAL SCORE SHEET (half-page)

> Event 2026123404 · Sunday, October 5, 2026 · Judge: Elaine Ford
> Class: Handler Discrimination Master · Time limit: 4:00 · Hides: 4 (unknown to handler)
> Armband: ________ · Gus (Sherlock Augustus Holmes) · Bloodhound · M · packet dog #22
> RESULT: (Q) NQ EX ABS Finds: 4/4 Faults: 0 Time: 2:35.80 Placement: 2nd

# Filled score sheets — myK9Show Score Sheet (per class)

This reproduces myK9Show’s own Score Sheet report (Reports → Score Sheet), one sheet per class, filled from the key. It uses the app’s exact fields: Q / Absent, the Handler Error / Safety Concern / Mild Disruption fault fields, the app’s NQ and EX reason lists, and MM/SS/TT time boxes. Compare cell-for-cell against what the app prints once the class is scored.

### myK9Show Scoresheet — Container Novice A

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Container · Novice · A                                                  |
| Hides · Distractions · Time Limit | 1 · 0 · 2:00                                                            |
| Entries                           | 4                                                                       |

| Arm  | Dog / handler                                                                               | Q / Abs | Faults HE/SC/MD | NQ / EX reason      | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------------- | ------- | --------------- | ------------------- | ------------- |
| ____ | Bella (#1) · 1st<br>Cedar Ridge Blue Belle · All-American Dog<br>Handler: Jennifer Walsh    | Q ☑     | 0 / 0 / 0       | —                   | 00 : 38 . 40  |
| ____ | Cooper (#2) · 2nd<br>Willowbrook Copper Penny · Labrador Retriever<br>Handler: David Nguyen | Q ☑     | 0 / 0 / 0       | —                   | 00 : 52 . 10  |
| ____ | Daisy (#5) · 3rd<br>Sunnyside Field of Daisies · Beagle<br>Handler: Emily Carter            | Q ☑     | 0 / 0 / 1       | —                   | 00 : 44 . 80  |
| ____ | Sadie (#7)<br>Goldleaf Sweet Sadie Mae · Golden Retriever<br>Handler: Laura Simmons         | NQ      | — / — / —       | NQ ☑ Incorrect Call | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Novice B

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Container · Novice · B                                                  |
| Hides · Distractions · Time Limit | 1 · 0 · 2:00                                                            |
| Entries                           | 4                                                                       |

| Arm  | Dog / handler                                                                                | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Luna (#3) · 1st<br>Nightfall Silver Moonrise · Belgian Malinois<br>Handler: Priya Patel      | Q ☑     | 0 / 0 / 0       | —              | 00 : 29 . 60  |
| ____ | Max (#4) · 4th<br>Prairie Wind Maximus · German Shorthaired Pointer<br>Handler: Robert Kline | Q ☑     | 0 / 0 / 0       | —              | 00 : 41 . 00  |
| ____ | Rocky (#6) · 3rd<br>Stonewall Rocky Road · Australian Shepherd<br>Handler: Michael Brooks    | Q ☑     | 0 / 0 / 0       | —              | 00 : 35 . 20  |
| ____ | Charlie (#8) · 2nd<br>Bordertown Charlie Brown · Border Collie<br>Handler: Thomas Reed       | Q ☑     | 0 / 0 / 0       | —              | 00 : 33 . 90  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Novice A

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Interior · Novice · A                                                   |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                            |
| Entries                           | 2                                                                       |

| Arm  | Dog / handler                                                                             | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ----------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Bella (#1) · 1st<br>Cedar Ridge Blue Belle · All-American Dog<br>Handler: Jennifer Walsh  | Q ☑     | 0 / 0 / 0       | —              | 01 : 01 . 20  |
| ____ | Sadie (#7) · 2nd<br>Goldleaf Sweet Sadie Mae · Golden Retriever<br>Handler: Laura Simmons | Q ☑     | 0 / 0 / 0       | —              | 01 : 14 . 50  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Novice B

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Interior · Novice · B                                                   |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                            |
| Entries                           | 2                                                                       |

| Arm  | Dog / handler                                                                           | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | --------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Luna (#3) · 1st<br>Nightfall Silver Moonrise · Belgian Malinois<br>Handler: Priya Patel | Q ☑     | 0 / 0 / 0       | —              | 00 : 48 . 00  |
| ____ | Charlie (#8)<br>Bordertown Charlie Brown · Border Collie<br>Handler: Thomas Reed        | NQ      | — / — / —       | NQ ☑ Max Time  | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Buried Novice B

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Buried · Novice · B                                                     |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                            |
| Entries                           | 2                                                                       |

| Arm  | Dog / handler                                                                                | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Max (#4) · 2nd<br>Prairie Wind Maximus · German Shorthaired Pointer<br>Handler: Robert Kline | Q ☑     | 0 / 0 / 0       | —              | 01 : 28 . 30  |
| ____ | Rocky (#6) · 1st<br>Stonewall Rocky Road · Australian Shepherd<br>Handler: Michael Brooks    | Q ☑     | 0 / 0 / 0       | —              | 01 : 19 . 10  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Novice B

| Field                             | Value                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| Show / Trial                      | Cedar Valley DTC Scent Work Trial — Trial 1 (Saturday, August 15, 2026) |
| Date · Trial # · Judge            | Saturday, August 15, 2026 · Trial 1 · Margaret Holloway                 |
| Element · Level · Section         | Exterior · Novice · B                                                   |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                            |
| Entries                           | 2                                                                       |

| Arm  | Dog / handler                                                                           | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | --------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Charlie (#8) · 1st<br>Bordertown Charlie Brown · Border Collie<br>Handler: Thomas Reed  | Q ☑     | 0 / 0 / 0       | —              | 00 : 57 . 70  |
| ____ | Luna (#3) · 2nd<br>Nightfall Silver Moonrise · Belgian Malinois<br>Handler: Priya Patel | Q ☑     | 0 / 0 / 1       | —              | 01 : 03 . 40  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Novice B

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Container · Novice · B                                                         |
| Hides · Distractions · Time Limit | 1 · 0 · 2:00                                                                   |
| Entries                           | 4                                                                              |

| Arm  | Dog / handler                                                                                   | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ----------------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Moose (#10) · 3rd<br>Timberline Gentle Moose · Bernese Mountain Dog<br>Handler: Kevin Marsh     | Q ☑     | 0 / 0 / 0       | —              | 00 : 47 . 20  |
| ____ | Willow (#13) · 1st<br>Winddancer Whispering Willow · Shetland Sheepdog<br>Handler: Rachel Adams | Q ☑     | 0 / 0 / 0       | —              | 00 : 39 . 90  |
| ____ | Ollie (#16) · 2nd<br>Avant-Garde Oliver Twist · Standard Poodle<br>Handler: Nathan Price        | Q ☑     | 0 / 0 / 0       | —              | 00 : 44 . 10  |
| ____ | Finn (#18) · 4th<br>Grayghost Finnegan · Weimaraner<br>Handler: Gregory Sanders                 | Q ☑     | 0 / 0 / 1       | —              | 00 : 51 . 60  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Advanced

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Container · Advanced · —                                                       |
| Hides · Distractions · Time Limit | 2 · 1 · 2:30                                                                   |
| Entries                           | 4                                                                              |

| Arm  | Dog / handler                                                                         | Q / Abs | Faults HE/SC/MD | NQ / EX reason      | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------- | ------- | --------------- | ------------------- | ------------- |
| ____ | Ginger (#9) · 2nd<br>Copperfield Ginger Snap · Vizsla<br>Handler: Angela Foster       | Q ☑     | 0 / 0 / 0       | —                   | 01 : 02 . 50  |
| ____ | Bruno (#12)<br>Ironclad Bruno the Bold · Boxer<br>Handler: Daniel O'Connor            | NQ      | — / — / —       | NQ ☑ Incorrect Call | —             |
| ____ | Zeus (#14) · 3rd<br>Thunderpaw Zeus Almighty · Rottweiler<br>Handler: Marcus Bell     | Q ☑     | 0 / 0 / 0       | —                   | 01 : 10 . 30  |
| ____ | Ruby (#17) · 1st<br>Rubicon Ruby Tuesday · All-American Dog<br>Handler: Victoria Lang | Q ☑     | 0 / 0 / 0       | —                   | 00 : 58 . 80  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Excellent

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Container · Excellent · —                                                      |
| Hides · Distractions · Time Limit | 3 · 1 · 3:00                                                                   |
| Entries                           | 2                                                                              |

| Arm  | Dog / handler                                                                              | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------------ | ------- | --------------- | -------------- | ------------- |
| ____ | Nala (#11) · 1st<br>Regalia Queen of Nala · Doberman Pinscher<br>Handler: Christine Yu     | Q ☑     | 0 / 0 / 0       | —              | 01 : 36 . 40  |
| ____ | Penny (#15) · 2nd<br>Merriweather Lucky Penny · Cocker Spaniel<br>Handler: Stephanie Grant | Q ☑     | 0 / 0 / 1       | —              | 01 : 28 . 00  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Novice B

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Interior · Novice · B                                                          |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                                   |
| Entries                           | 3                                                                              |

| Arm  | Dog / handler                                                                                   | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ----------------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Moose (#10) · 2nd<br>Timberline Gentle Moose · Bernese Mountain Dog<br>Handler: Kevin Marsh     | Q ☑     | 0 / 0 / 0       | —              | 01 : 06 . 00  |
| ____ | Willow (#13) · 1st<br>Winddancer Whispering Willow · Shetland Sheepdog<br>Handler: Rachel Adams | Q ☑     | 0 / 0 / 0       | —              | 00 : 59 . 40  |
| ____ | Finn (#18)<br>Grayghost Finnegan · Weimaraner<br>Handler: Gregory Sanders                       | NQ      | — / — / —       | NQ ☑ Max Time  | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Advanced

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Interior · Advanced · —                                                        |
| Hides · Distractions · Time Limit | 2 · 1 · 3:30                                                                   |
| Entries                           | 3                                                                              |

| Arm  | Dog / handler                                                                         | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Ginger (#9) · 2nd<br>Copperfield Ginger Snap · Vizsla<br>Handler: Angela Foster       | Q ☑     | 0 / 0 / 0       | —              | 01 : 23 . 70  |
| ____ | Zeus (#14) · 3rd<br>Thunderpaw Zeus Almighty · Rottweiler<br>Handler: Marcus Bell     | Q ☑     | 0 / 0 / 0       | —              | 01 : 31 . 20  |
| ____ | Ruby (#17) · 1st<br>Rubicon Ruby Tuesday · All-American Dog<br>Handler: Victoria Lang | Q ☑     | 0 / 0 / 0       | —              | 01 : 18 . 50  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Excellent

| Field                             | Value                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 1 (Saturday, September 12, 2026) |
| Date · Trial # · Judge            | Saturday, September 12, 2026 · Trial 1 · Alan Whitmore                         |
| Element · Level · Section         | Interior · Excellent · —                                                       |
| Hides · Distractions · Time Limit | 3 · 1 · 2:00 / 2:00                                                            |
| Entries                           | 2                                                                              |

| Arm  | Dog / handler                                                                          | Q / Abs | Faults HE/SC/MD | NQ / EX reason      | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------- | ------- | --------------- | ------------------- | ------------- |
| ____ | Nala (#11) · 1st<br>Regalia Queen of Nala · Doberman Pinscher<br>Handler: Christine Yu | Q ☑     | 0 / 0 / 0       | —                   | 02 : 00 . 90  |
| ____ | Penny (#15)<br>Merriweather Lucky Penny · Cocker Spaniel<br>Handler: Stephanie Grant   | NQ      | — / — / —       | NQ ☑ Incorrect Call | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Novice B

| Field                             | Value                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 2 (Sunday, September 13, 2026) |
| Date · Trial # · Judge            | Sunday, September 13, 2026 · Trial 2 · Susan Petrov                          |
| Element · Level · Section         | Exterior · Novice · B                                                        |
| Hides · Distractions · Time Limit | 1 · 0 · 3:00                                                                 |
| Entries                           | 3                                                                            |

| Arm  | Dog / handler                                                                                   | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ----------------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Willow (#13) · 2nd<br>Winddancer Whispering Willow · Shetland Sheepdog<br>Handler: Rachel Adams | Q ☑     | 0 / 0 / 0       | —              | 00 : 41 . 30  |
| ____ | Ollie (#16) · 1st<br>Avant-Garde Oliver Twist · Standard Poodle<br>Handler: Nathan Price        | Q ☑     | 0 / 0 / 0       | —              | 00 : 38 . 00  |
| ____ | Finn (#18) · 3rd<br>Grayghost Finnegan · Weimaraner<br>Handler: Gregory Sanders                 | Q ☑     | 0 / 0 / 0       | —              | 00 : 49 . 90  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Advanced

| Field                             | Value                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 2 (Sunday, September 13, 2026) |
| Date · Trial # · Judge            | Sunday, September 13, 2026 · Trial 2 · Susan Petrov                          |
| Element · Level · Section         | Exterior · Advanced · —                                                      |
| Hides · Distractions · Time Limit | 2 · 1 · 3:30                                                                 |
| Entries                           | 3                                                                            |

| Arm  | Dog / handler                                                                         | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Ginger (#9) · 1st<br>Copperfield Ginger Snap · Vizsla<br>Handler: Angela Foster       | Q ☑     | 0 / 0 / 0       | —              | 01 : 04 . 80  |
| ____ | Bruno (#12) · 2nd<br>Ironclad Bruno the Bold · Boxer<br>Handler: Daniel O'Connor      | Q ☑     | 0 / 0 / 0       | —              | 01 : 11 . 50  |
| ____ | Ruby (#17) · 3rd<br>Rubicon Ruby Tuesday · All-American Dog<br>Handler: Victoria Lang | Q ☑     | 0 / 0 / 1       | —              | 01 : 09 . 20  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Excellent

| Field                             | Value                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 2 (Sunday, September 13, 2026) |
| Date · Trial # · Judge            | Sunday, September 13, 2026 · Trial 2 · Susan Petrov                          |
| Element · Level · Section         | Exterior · Excellent · —                                                     |
| Hides · Distractions · Time Limit | 3 · 1 · 4:00                                                                 |
| Entries                           | 2                                                                            |

| Arm  | Dog / handler                                                                              | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------------ | ------- | --------------- | -------------- | ------------- |
| ____ | Nala (#11) · 1st<br>Regalia Queen of Nala · Doberman Pinscher<br>Handler: Christine Yu     | Q ☑     | 0 / 0 / 0       | —              | 01 : 41 . 70  |
| ____ | Penny (#15) · 2nd<br>Merriweather Lucky Penny · Cocker Spaniel<br>Handler: Stephanie Grant | Q ☑     | 0 / 0 / 0       | —              | 01 : 50 . 40  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Advanced

| Field                             | Value                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Show / Trial                      | Riverside SWA Fall Classic (2 trials) — Trial 2 (Sunday, September 13, 2026) |
| Date · Trial # · Judge            | Sunday, September 13, 2026 · Trial 2 · Susan Petrov                          |
| Element · Level · Section         | Container · Advanced · —                                                     |
| Hides · Distractions · Time Limit | 2 · 1 · 2:30                                                                 |
| Entries                           | 2                                                                            |

| Arm  | Dog / handler                                                                    | Q / Abs | Faults HE/SC/MD | NQ / EX reason      | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------- | ------- | --------------- | ------------------- | ------------- |
| ____ | Bruno (#12) · 1st<br>Ironclad Bruno the Bold · Boxer<br>Handler: Daniel O'Connor | Q ☑     | 0 / 0 / 0       | —                   | 01 : 06 . 90  |
| ____ | Zeus (#14)<br>Thunderpaw Zeus Almighty · Rottweiler<br>Handler: Marcus Bell      | NQ      | — / — / —       | NQ ☑ Incorrect Call | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Master

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 1 (Friday, October 3, 2026) |
| Date · Trial # · Judge            | Friday, October 3, 2026 · Trial 1 · Elaine Ford                          |
| Element · Level · Section         | Container · Master · —                                                   |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 3:00                                        |
| Entries                           | 4                                                                        |

| Arm  | Dog / handler                                                                            | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ---------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Athena (#19) · 1st<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost   | Q ☑     | 0 / 0 / 0       | —              | 02 : 22 . 60  |
| ____ | Diesel (#20) · 3rd<br>Motorhead Diesel Engine · Dutch Shepherd<br>Handler: Frank Delgado | Q ☑     | 0 / 0 / 1       | —              | 02 : 31 . 00  |
| ____ | Gus (#22) · 2nd<br>Sherlock Augustus Holmes · Bloodhound<br>Handler: Andrew Boyle        | Q ☑     | 0 / 0 / 0       | —              | 02 : 48 . 90  |
| ____ | Coco (#25)<br>Cocoa Bean Delight · All-American Dog<br>Handler: Michelle Tran            | NQ      | — / — / —       | NQ ☑ Max Time  | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Master

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 1 (Friday, October 3, 2026) |
| Date · Trial # · Judge            | Friday, October 3, 2026 · Trial 1 · Elaine Ford                          |
| Element · Level · Section         | Interior · Master · —                                                    |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 2:00 / 2:00 / 2:00                          |
| Entries                           | 3                                                                        |

| Arm  | Dog / handler                                                                          | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Athena (#19) · 1st<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost | Q ☑     | 0 / 0 / 0       | —              | 03 : 25 . 40  |
| ____ | Gus (#22) · 2nd<br>Sherlock Augustus Holmes · Bloodhound<br>Handler: Andrew Boyle      | Q ☑     | 0 / 0 / 0       | —              | 03 : 41 . 70  |
| ____ | Coco (#25) · 3rd<br>Cocoa Bean Delight · All-American Dog<br>Handler: Michelle Tran    | Q ☑     | 0 / 0 / 1       | —              | 03 : 50 . 20  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Excellent

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 1 (Friday, October 3, 2026) |
| Date · Trial # · Judge            | Friday, October 3, 2026 · Trial 1 · Elaine Ford                          |
| Element · Level · Section         | Container · Excellent · —                                                |
| Hides · Distractions · Time Limit | 3 · 1 · 3:00                                                             |
| Entries                           | 3                                                                        |

| Arm  | Dog / handler                                                                            | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ---------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Piper (#21) · 2nd<br>Highland Pied Piper · Brittany<br>Handler: Karen Whitfield          | Q ☑     | 0 / 0 / 0       | —              | 01 : 19 . 50  |
| ____ | Titan (#24) · 3rd<br>Colossus Titan of Old · Giant Schnauzer<br>Handler: Paul Hendricks  | Q ☑     | 0 / 0 / 0       | —              | 01 : 25 . 10  |
| ____ | Diesel (#20) · 1st<br>Motorhead Diesel Engine · Dutch Shepherd<br>Handler: Frank Delgado | Q ☑     | 0 / 0 / 0       | —              | 01 : 12 . 80  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Handler Discrimination Advanced

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 1 (Friday, October 3, 2026) |
| Date · Trial # · Judge            | Friday, October 3, 2026 · Trial 1 · Elaine Ford                          |
| Element · Level · Section         | Handler Discrimination · Advanced · —                                    |
| Hides · Distractions · Time Limit | 2 · 1 · 3:00                                                             |
| Entries                           | 1                                                                        |

| Arm  | Dog / handler                                                                         | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Hazel (#23) · 1st<br>Pepperbox Hazelnut · Miniature Schnauzer<br>Handler: Diane Russo | Q ☑     | 0 / 0 / 0       | —              | 00 : 54 . 30  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Buried Master

| Field                             | Value                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 2 (Saturday, October 4, 2026) |
| Date · Trial # · Judge            | Saturday, October 4, 2026 · Trial 2 · Victor Nash                          |
| Element · Level · Section         | Buried · Master · —                                                        |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 4:00                                          |
| Entries                           | 3                                                                          |

| Arm  | Dog / handler                                                                          | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Athena (#19) · 1st<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost | Q ☑     | 0 / 0 / 0       | —              | 03 : 08 . 20  |
| ____ | Gus (#22) · 2nd<br>Sherlock Augustus Holmes · Bloodhound<br>Handler: Andrew Boyle      | Q ☑     | 0 / 0 / 0       | —              | 03 : 19 . 90  |
| ____ | Coco (#25) · 3rd<br>Cocoa Bean Delight · All-American Dog<br>Handler: Michelle Tran    | Q ☑     | 0 / 0 / 0       | —              | 03 : 30 . 50  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Master

| Field                             | Value                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 2 (Saturday, October 4, 2026) |
| Date · Trial # · Judge            | Saturday, October 4, 2026 · Trial 2 · Victor Nash                          |
| Element · Level · Section         | Exterior · Master · —                                                      |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 4:00                                          |
| Entries                           | 3                                                                          |

| Arm  | Dog / handler                                                                            | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ---------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Athena (#19) · 2nd<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost   | Q ☑     | 0 / 0 / 0       | —              | 02 : 56 . 00  |
| ____ | Coco (#25) · 3rd<br>Cocoa Bean Delight · All-American Dog<br>Handler: Michelle Tran      | Q ☑     | 0 / 0 / 1       | —              | 03 : 01 . 30  |
| ____ | Diesel (#20) · 1st<br>Motorhead Diesel Engine · Dutch Shepherd<br>Handler: Frank Delgado | Q ☑     | 0 / 0 / 0       | —              | 02 : 49 . 40  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Interior Excellent

| Field                             | Value                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 2 (Saturday, October 4, 2026) |
| Date · Trial # · Judge            | Saturday, October 4, 2026 · Trial 2 · Victor Nash                          |
| Element · Level · Section         | Interior · Excellent · —                                                   |
| Hides · Distractions · Time Limit | 3 · 1 · 2:00 / 2:00                                                        |
| Entries                           | 2                                                                          |

| Arm  | Dog / handler                                                                           | Q / Abs | Faults HE/SC/MD | NQ / EX reason          | Time MM:SS.TT |
| ---- | --------------------------------------------------------------------------------------- | ------- | --------------- | ----------------------- | ------------- |
| ____ | Piper (#21)<br>Highland Pied Piper · Brittany<br>Handler: Karen Whitfield               | EX      | — / — / —       | EX ☑ Eliminated in Area | —             |
| ____ | Titan (#24) · 1st<br>Colossus Titan of Old · Giant Schnauzer<br>Handler: Paul Hendricks | Q ☑     | 0 / 0 / 0       | —                       | 02 : 12 . 70  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Container Advanced

| Field                             | Value                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 2 (Saturday, October 4, 2026) |
| Date · Trial # · Judge            | Saturday, October 4, 2026 · Trial 2 · Victor Nash                          |
| Element · Level · Section         | Container · Advanced · —                                                   |
| Hides · Distractions · Time Limit | 2 · 1 · 2:30                                                               |
| Entries                           | 1                                                                          |

| Arm  | Dog / handler                                                                   | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | ------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Hazel (#23)<br>Pepperbox Hazelnut · Miniature Schnauzer<br>Handler: Diane Russo | Abs ☑   | — / — / —       | Absent         | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Detective (Elite)

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 3 (Sunday, October 5, 2026) |
| Date · Trial # · Judge            | Sunday, October 5, 2026 · Trial 3 · Elaine Ford                          |
| Element · Level · Section         | Detective · Detective · —                                                |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 5:00                                        |
| Entries                           | 3                                                                        |

| Arm  | Dog / handler                                                                          | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Gus (#22) · 1st<br>Sherlock Augustus Holmes · Bloodhound<br>Handler: Andrew Boyle      | Q ☑     | 0 / 0 / 0       | —              | 04 : 58 . 10  |
| ____ | Athena (#19) · 3rd<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost | Q ☑     | 0 / 0 / 2       | —              | 05 : 15 . 60  |
| ____ | Coco (#25) · 2nd<br>Cocoa Bean Delight · All-American Dog<br>Handler: Michelle Tran    | Q ☑     | 0 / 0 / 1       | —              | 05 : 22 . 90  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Exterior Excellent

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 3 (Sunday, October 5, 2026) |
| Date · Trial # · Judge            | Sunday, October 5, 2026 · Trial 3 · Elaine Ford                          |
| Element · Level · Section         | Exterior · Excellent · —                                                 |
| Hides · Distractions · Time Limit | 3 · 1 · 4:00                                                             |
| Entries                           | 2                                                                        |

| Arm  | Dog / handler                                                                     | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | --------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Piper (#21) · 1st<br>Highland Pied Piper · Brittany<br>Handler: Karen Whitfield   | Q ☑     | 0 / 0 / 0       | —              | 01 : 58 . 40  |
| ____ | Titan (#24)<br>Colossus Titan of Old · Giant Schnauzer<br>Handler: Paul Hendricks | Abs ☑   | — / — / —       | Absent         | —             |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

### myK9Show Scoresheet — Handler Discrimination Master

| Field                             | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Show / Trial                      | Summit K9 Masters Weekend (3 trials) — Trial 3 (Sunday, October 5, 2026) |
| Date · Trial # · Judge            | Sunday, October 5, 2026 · Trial 3 · Elaine Ford                          |
| Element · Level · Section         | Handler Discrimination · Master · —                                      |
| Hides · Distractions · Time Limit | 4 (unknown to handler) · 1 · 4:00                                        |
| Entries                           | 2                                                                        |

| Arm  | Dog / handler                                                                          | Q / Abs | Faults HE/SC/MD | NQ / EX reason | Time MM:SS.TT |
| ---- | -------------------------------------------------------------------------------------- | ------- | --------------- | -------------- | ------------- |
| ____ | Athena (#19) · 1st<br>Olympus Athena Wisdom · Belgian Tervuren<br>Handler: Helen Frost | Q ☑     | 0 / 0 / 0       | —              | 02 : 21 . 00  |
| ____ | Gus (#22) · 2nd<br>Sherlock Augustus Holmes · Bloodhound<br>Handler: Andrew Boyle      | Q ☑     | 0 / 0 / 0       | —              | 02 : 35 . 80  |

Faults key: HE = Handler Error · SC = Safety Concern · MD = Mild Disruption. This packet records total minor faults under MD.

# Reports to run (and what to compare)

After every class in a show is fully scored, run these and check them against the key and the entry forms.

- Class results / placement report — For each class, the 1st–4th match the Placement column in the scoring key. Ties are broken by faults, then time.
- Catalog / running order — All entered dogs appear under the correct class and trial; armband numbers are unique within the show.
- Qualifying / “Q” report per dog — Each dog’s Q count matches the key. Confirm NQ/ABS/EX runs are excluded from Q totals.
- Title progress — Dogs earning their 3rd qualifying leg in an element/level show as titled. (Most dogs here have 1–2 legs in this packet — verify the app tracks partial progress correctly.)
- Secretary financial / entry count — Total runs and fees reconcile: count entries per dog per trial, apply the show’s first-class / additional-class fee. Scratched/absent handling matches your club’s refund policy.
- Edge-case audit (Show C) — Waitlist move (Coco #25), move-up (Diesel #20 in Master), scratch (Hazel #23 — no score), absent (Titan #24 — ABS), excused (Piper #21 — EX) all render correctly on results and catalog.

## Record what breaks

> For anything that doesn’t match: note Show / Trial / Class / Dog #, what the app showed, and what the key expected.
> Also note every field you had to invent because the form or this packet didn’t specify it — those blanks are UX findings too.
