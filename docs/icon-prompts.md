# Finly custom icon set — image generation prompts

Finly currently uses generic line icons (lucide). This document is the brief for replacing the
*illustrative* icons with a custom, consistent set generated with an image model. It contains:

1. The rules every image must follow (so the set looks like one family).
2. A master style paragraph to paste at the start of every prompt.
3. One prompt per icon, with the file name the app will expect.

Small *functional* glyphs (chevrons, plus, trash, pencil, kebab menu, bell, close, arrows, check
marks in the stepper) are **not** in this list. They are UI chrome, not illustration, and stay as
thin line icons so the interface reads as an interface.

---

## 1. Rules for every image

- **Format**: PNG, square, **1024 × 1024**, **transparent background**. If the model refuses
  transparency, generate on a pure white `#FFFFFF` background and strip it afterwards
  (`rembg`, Photoshop, or remove.bg). Never generate on a tinted background: the app supplies
  the pastel tile behind the icon.
- **One object per image**, centred, filling roughly **70 %** of the canvas with even padding.
- **No text, no letters, no numbers, no currency symbols, no watermark, no border, no card,
  no drop shadow on the background.** (Shadows *on the object itself* are fine.)
- **Readable at 24 px.** Icons appear in 32–48 px tiles. Keep shapes big and simple: one main
  object plus at most one small secondary detail. No thin lines, no tiny details.
- **Same camera for all icons**: slight three-quarter view from the front and a little above,
  light from the top-left.
- **Palette**: the icon must use *its accent colour* (given per prompt) as the dominant colour,
  with a darker shade of the same hue for depth, off-white `#F7F8FA` for highlights, and
  Finly ink navy `#1B2A4A` only as a small accent. No other hues.

Accent colours used by the app:

| Accent   | Hex       | Used for                                             |
| -------- | --------- | ---------------------------------------------------- |
| brand    | `#158F6B` | Finly green: logo, savings, positive, plan           |
| green    | `#34B27B` | income, investments, essential, success              |
| blue     | `#3B7DF5` | everyday money, transport, holidays, information     |
| orange   | `#F2994A` | costs, cash, warnings that are soft                  |
| yellow   | `#F5B400` | emergency fund, targets, finance & insurance         |
| purple   | `#8B5CF6` | leisure, savings accounts, sample data, ideas        |
| lavender | `#B9A6F5` | planned / irregular spending                         |
| red      | `#EF4444` | home & bills, joint account, hearts, negative        |
| indigo   | `#4F46E5` | other accounts, education                            |
| ink      | `#1B2A4A` | small dark accents only                              |

### Workflow tip

Generate **one** icon first (the piggy bank is a good anchor because it has volume and a clear
silhouette). When you are happy with it, attach that image to every following request and add
"match the style of the attached icon exactly" to the prompt. This is the single biggest lever
for a consistent set.

---

## 2. Master style paragraph

Paste this at the start of every prompt, then add the subject lines from section 3.

> Soft matte 3D icon in a premium fintech style. Smooth rounded clay-like forms, no outlines,
> gentle top-left lighting with soft self-shadows, subtle surface grain, slight three-quarter
> view from a little above. Limited palette: dominant ACCENT colour with one darker shade of
> the same hue for depth, off-white highlights, and a tiny navy `#1B2A4A` detail at most.
> Single centred object filling about 70 % of a square 1024 × 1024 canvas, generous even
> padding, fully transparent background. No text, no letters, no numbers, no currency
> symbols, no background shapes, no card, no border, no shadow on the ground. Must stay
> legible when scaled down to 24 pixels: bold simple silhouette, one main object and at most
> one small secondary detail.

Replace `ACCENT` with the hex from each subject line.

If you prefer a flatter look, use this alternative paragraph instead (pick one for the whole
set, do not mix):

> Flat illustrated icon with cut-paper depth. Two or three layered flat shapes in one hue,
> tiny offset shadows between layers, no outlines, rounded corners, slightly playful
> proportions. Limited palette: dominant ACCENT colour with one lighter and one darker shade,
> off-white highlights, tiny navy `#1B2A4A` accents only. Single centred object filling about
> 70 % of a square 1024 × 1024 canvas, transparent background. No text, numbers, currency
> symbols, background shapes or borders. Legible at 24 pixels.

---

## 3. Prompts

Each entry gives the target **file name** (drop the PNG into `public/icons/`), the **accent**,
and the **subject** text to append to the master paragraph.

### 3.1 Brand

**`logo-mark.png`** · brand `#099373` on transparent
> The Finly "F": two stacked leaf-shaped strokes and a dot, taken from the supplied app icon.
> Not generated with the master prompt. `logo-mark-white.png` is the same shape in white for
> green surfaces; `app-icon.png`, `pwa-*.png` and `apple-touch-icon.png` are the white F on
> the green rounded square.

### 3.2 Welcome page

**`welcome-plan.png`** · accent brand `#158F6B`
> Subject: a chunky round compass seen from above at a slight angle, the needle shaped like a
> small green leaf pointing up-right. Friendly, inviting, "start a journey".

**`welcome-explore.png`** · accent purple `#8B5CF6`
> Subject: a rounded magnifying glass hovering over three small bars of a bar chart, the glass
> lens slightly enlarging the tallest bar. One tiny four-point sparkle near the lens.

### 3.3 Navigation and section headers

These appear in the sidebar, bottom navigation, onboarding stepper and page headers, so they
must be the simplest of the set.

**`nav-home.png`** · accent brand `#158F6B`
> Subject: a small friendly house with a rounded roof, a single round window glowing off-white,
> and a short chimney. Seen from the front, three-quarter view.

**`nav-income.png`** · accent green `#34B27B`
> Subject: a rounded briefcase with a coin half-inserted into a slot on its top, as if income is
> being deposited. No clasps or details other than the handle and the coin.

**`nav-home-bills.png`** · accent red `#EF4444`
> Subject: a small house with a folded paper bill or envelope leaning against its front wall.
> The house is the main shape, the envelope is the secondary detail.

**`nav-living.png`** · accent green `#34B27B`
> Subject: a rounded shopping basket with two simple items peeking out: a bottle of milk and a
> loaf of bread, both simplified to basic rounded shapes.

**`nav-transport.png`** · accent blue `#3B7DF5`
> Subject: a compact, cute hatchback car seen from the front three-quarter, big round wheels,
> soft windows in off-white. No headlights detail beyond two small rounded shapes.

**`nav-finance.png`** · accent yellow `#F5B400`
> Subject: a rounded shield with a single plain coin set into its centre like a badge.
> Chunky, protective, no other marks.

**`nav-leisure.png`** · accent purple `#8B5CF6`
> Subject: a rounded cinema ticket stub with a scalloped tear edge, and a tiny round popcorn
> bucket in front of it. Fun and light.

**`nav-planned.png`** · accent lavender `#B9A6F5`
> Subject: a chunky wall calendar with a blank page and a small round push-pin marking one
> day. No numbers or grid lines, just the pin and one soft highlighted square.

**`nav-savings.png`** · accent brand `#158F6B`
> Subject: a classic rounded piggy bank with a coin dropping into the slot on its back and a
> tiny triangular flag on a short pole planted beside it (a goal marker).

**`nav-accounts.png`** · accent blue `#3B7DF5`
> Subject: a rounded bifold wallet, slightly open, with two plain card edges peeking out of the
> top. No logos, no stripes.

**`nav-planning.png`** · accent orange `#F2994A`
> Subject: a small pocket calculator with rounded keys (no numbers on the keys) and a short
> pencil resting diagonally across it.

**`nav-insights.png`** · accent indigo `#4F46E5`
> Subject: three rounded vertical bars of increasing height with a small round lens sitting on
> top of the tallest one, like a magnifier inspecting the chart.

**`nav-settings.png`** · accent ink `#1B2A4A` (use a soft mid-grey `#8A94A6` as the "accent" and navy for the dark shade)
> Subject: a single chunky gear with eight rounded teeth and a round hole in the middle.

### 3.4 Dashboard stat cards

**`stat-safe-to-spend.png`** · accent brand `#158F6B`
> Subject: a rounded wallet with a small round green badge containing an off-white check mark
> attached to its top-right corner.

**`stat-income.png`** · accent blue `#3B7DF5`
> Subject: a short stack of three plain coins with a chunky rounded arrow rising from behind
> the stack pointing up-right.

**`stat-cost.png`** · accent red `#EF4444`
> Subject: a receipt with a zig-zag bottom edge, slightly curled, with three soft horizontal
> bars suggesting lines of text (bars, not writing).

**`stat-saving.png`** · accent green `#34B27B`
> Subject: a rounded piggy bank with a small two-leaf sprout growing out of the coin slot,
> money growing.

**`stat-bank.png`** · accent purple `#8B5CF6`
> Subject: a small classical bank building with a rounded triangular roof and three chunky
> columns, seen from the front three-quarter. No steps, no doors.

### 3.5 Account kinds

**`account-everyday.png`** · accent blue `#3B7DF5`
> Subject: a rounded bifold wallet, closed, with a small button clasp. Plain and clean.

**`account-salary.png`** · accent green `#34B27B`
> Subject: a rounded briefcase with a single plain coin resting on its top.

**`account-savings.png`** · accent purple `#8B5CF6`
> Subject: a classic rounded piggy bank facing left, with a coin half-way into the slot.

**`account-emergency.png`** · accent yellow `#F5B400`
> Subject: a chunky open umbrella seen from the front three-quarter with a plain coin sheltered
> underneath it. Protection from rainy days.

**`account-joint.png`** · accent red `#EF4444`
> Subject: two rounded interlocking rings lying at a slight angle, one slightly in front of the
> other, both in the same hue with one a darker shade.

**`account-cash.png`** · accent orange `#F2994A`
> Subject: a small loose pile of four plain round coins, two lying flat and two standing at an
> angle against them.

**`account-investment.png`** · accent green `#34B27B`
> Subject: a small round plant pot with a single plant whose stem is a rising zig-zag line
> ending in a rounded leaf, the "growth chart" plant.

**`account-other.png`** · accent indigo `#4F46E5`
> Subject: a small classical bank building with three columns and a rounded roof, plain.

### 3.6 Goal icons

Users pick one of these for each savings goal. Keep them charming and clearly different from
each other in silhouette.

**`goal-shield.png`** · accent green `#34B27B`
> Subject: a rounded shield with an off-white check mark set into its centre. Safety net.

**`goal-home.png`** · accent red `#EF4444`
> Subject: a small house with a rounded roof and a tiny key resting in front of the door.
> Home purchase.

**`goal-palmtree.png`** · accent blue `#3B7DF5`
> Subject: a single palm tree with four rounded fronds on a tiny round island of sand.
> Holiday.

**`goal-car.png`** · accent red `#EF4444`
> Subject: a compact cute car seen from the front three-quarter with a small bow ribbon on the
> roof. New car.

**`goal-laptop.png`** · accent purple `#8B5CF6`
> Subject: a slightly open laptop seen from the front three-quarter, the screen a plain
> off-white surface with a single soft bar chart shape on it.

**`goal-phone.png`** · accent teal `#14B8A6`
> Subject: a rounded smartphone standing slightly tilted, front three-quarter, the screen a
> plain off-white surface with one soft app-tile grid shape. (Planning page, big purchase kind.)

**`goal-plane.png`** · accent blue `#3B7DF5`
> Subject: a chunky friendly passenger plane banking up-right, rounded nose, three round
> windows, tiny soft cloud behind it.

**`goal-gift.png`** · accent orange `#F2994A`
> Subject: a rounded gift box with a bow on top in the darker shade of the same hue.

**`goal-heart.png`** · accent red `#EF4444`
> Subject: a plump rounded heart with a soft off-white highlight, sitting at a slight angle.

**`goal-graduation.png`** · accent indigo `#4F46E5`
> Subject: a graduation cap with a rounded tassel resting on a single closed book.

**`goal-wrench.png`** · accent orange `#F2994A`
> Subject: a chunky wrench and a small nut, the wrench lying diagonally. Repairs and
> maintenance.

**`goal-piggy.png`** · accent purple `#8B5CF6`
> Subject: a classic rounded piggy bank facing right with a coin dropping into the slot.

**`goal-trending.png`** · accent green `#34B27B`
> Subject: a chunky rounded arrow rising in two steps from bottom-left to top-right, with a
> small plain coin at its base.

**`goal-target.png`** · accent yellow `#F5B400`
> Subject: a round archery target with three rings and a short chunky arrow stuck in the
> centre, seen at a slight angle.

**`goal-leaf.png`** · accent brand `#158F6B`
> Subject: a small rounded tree with a soft round canopy next to a tiny park bench.
> Retirement and the long term.

### 3.7 Dashboard, insights and planning cards

Card-header icons. Same rules, but these can be a touch more descriptive.

**`card-where-money-goes.png`** · accent brand `#158F6B`
> Subject: a chunky pie chart with one slice slightly pulled out, the slices in three shades of
> the same hue.

**`card-position.png`** · accent blue `#3B7DF5`
> Subject: three rounded pillars of coins of different heights standing side by side.

**`card-goals.png`** · accent brand `#158F6B`
> Subject: a small triangular flag on a pole planted on the top of a rounded hill.

**`card-income-stability.png`** · accent green `#34B27B`
> Subject: a rounded balance scale, perfectly level, with a plain coin on each pan.

**`card-upcoming.png`** · accent blue `#3B7DF5`
> Subject: a chunky calendar page with a small round clock face overlapping its bottom-right
> corner. No numbers on either.

**`card-income-stopped.png`** · accent purple `#8B5CF6`
> Subject: a rounded life ring (lifebuoy) with four soft segments, floating at a slight angle.

**`card-resilience.png`** · accent green `#34B27B`
> Subject: a rounded shield with a small sprout growing from the top edge. Strength that
> grows.

**`card-afford.png`** · accent orange `#F2994A`
> Subject: a plain coin balanced on a rounded fingertip-like pedestal, with a small question
> of balance: the coin tilts slightly. Keep it to a coin on a small rounded stand.

**`card-income-change.png`** · accent blue `#3B7DF5`
> Subject: a rounded slider control, a horizontal track with a chunky round knob, and a small
> coin above the knob.

**`card-per-day.png`** · accent brand `#158F6B`
> Subject: a single plain coin resting inside a small rounded bowl, a daily allowance.

**`card-expensive-months.png`** · accent orange `#F2994A`
> Subject: three chunky rounded bars side by side, the middle one taller and in a darker shade,
> with a small round alert dot above it.

**`card-subscriptions.png`** · accent purple `#8B5CF6`
> Subject: two chunky rounded arrows chasing each other in a circle, with a small plain coin in
> the middle.

**`card-car-cost.png`** · accent orange `#F2994A`
> Subject: a compact car seen from the side with a plain coin in place of one wheel.

**`card-largest.png`** · accent indigo `#4F46E5`
> Subject: a small podium with three rounded steps, the tallest in the middle, and a plain coin
> standing on the top step.

**`card-savings-projection.png`** · accent green `#34B27B`
> Subject: a rounded piggy bank with a soft upward zig-zag arrow rising behind it.

**`card-allocation.png`** · accent purple `#8B5CF6`
> Subject: a chunky donut chart (ring) with four segments in four shades of the same hue.

### 3.8 States and callouts

**`state-empty.png`** · accent blue `#3B7DF5`
> Subject: an empty rounded glass jar with a soft lid, slightly transparent walls in the
> lighter shade, nothing inside. Friendly, not sad.

**`state-success.png`** · accent green `#34B27B`
> Subject: a round badge with an off-white check mark in the centre and a soft scalloped edge.

**`state-warning.png`** · accent orange `#F2994A`
> Subject: a rounded triangle with an off-white exclamation mark in its centre. Soft, not
> alarming.

**`state-tip.png`** · accent yellow `#F5B400`
> Subject: a rounded light bulb glowing softly, with a small navy base. One tiny four-point
> sparkle beside it.

**`state-celebrate.png`** · accent brand `#158F6B`
> Subject: a small rounded trophy cup with a tiny leaf on its lid instead of a star.

---

## 4. How the icons are wired in

- **Originals** (1024 or 1254 px) live in `design/icons/`. They are the source of truth.
- **Served copies** are 256 px PNGs in `public/icons/`, produced from the originals with the
  PowerShell snippet below. Re-run it after replacing or adding an original.
- The list of valid names is `PICTURES` in `src/components/ui/pictures.ts`. Add a name there
  when you add a file; TypeScript then accepts it anywhere an icon is expected.
- Any component that takes an `icon` prop (`IconTile`, `StatCard`, `ItemRow`, `Callout`,
  `EmptyState`, nav items) accepts either a picture name string or a lucide component, so a
  spot can fall back to a line icon at any time by passing the lucide component again.

```powershell
Add-Type -AssemblyName System.Drawing
$src = "design\icons"; $dst = "public\icons"
Get-ChildItem $src -Filter *.png | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $bmp = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent); $g.DrawImage($img, 0, 0, 256, 256); $g.Dispose()
  $bmp.Save((Join-Path $dst $_.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $img.Dispose()
}
```

### Still line icons (candidates for a second batch)

Two insight cards have no dedicated illustration yet. Until these are generated they reuse
`nav-home-bills` (committed lifestyle) and `nav-leisure` (reducible expenses):

**`card-committed.png`** · accent orange `#F2994A`
> Subject: a chunky rounded padlock, closed, with a plain coin set into its face. Committed
> costs that cannot easily change.

**`loan-csn.png`** · accent indigo `#4F46E5`
> Subject: a rounded graduation cap resting on a small stack of two plain coins. A student loan.
> Until generated, CSN loans reuse `goal-graduation`.

**`loan-mortgage.png`** · accent red `#EF4444`
> Subject: a small rounded house with a plain key lying in front of it, the key's bow a coin.
> Until generated, mortgages reuse `goal-home`.

**`loan-car.png`** · accent orange `#F2994A`
> Subject: a small rounded car seen from the front three-quarter with a plain paper tag hanging from
> its mirror. Until generated, car loans reuse `goal-car`.

**`loan-credit.png`** · accent purple `#8B5CF6`
> Subject: a chunky rounded payment card at a slight angle with a small plain coin half-tucked behind
> it. Until generated, credit cards reuse `account-everyday` and personal loans `account-cash`.

**`nav-loans.png`** · accent red `#EF4444`
> Subject: a plain coin with a rounded downward arrow beside it, the balance going down. The Loans page
> and the Loans row on Home; until generated they reuse `stat-bank`.

**`card-reduce.png`** · accent green `#34B27B`
> Subject: a pair of rounded scissors about to snip a plain receipt with a zig-zag edge.
> Expenses you could realistically cut.
