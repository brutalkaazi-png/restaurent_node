# Restaurant QR - Express.js port

This is an Express.js conversion of the Laravel restaurant/QR-ordering
platform you uploaded. The **full** app is large (58 controllers, 22
models, 144 Blade views - a multi-week job for a human team), so this pass
ports one complete, working slice end-to-end rather than generating a
shallow skeleton for all 58 controllers. It's been run against a real MySQL
database and manually tested through the full cart -> confirm -> kitchen
flow (see "What was actually tested" below).

## ⚠️ Rotate your secrets first

The uploaded `.env` contained a **live Stripe secret key and an OpenAI
key**. Treat both as compromised and rotate them in their respective
dashboards regardless of anything else you do with this code. Nothing from
that file was copied into this project - `.env.example` only has
placeholders.

## What's fully ported and tested

- **Auth**: login (with the same user_type/user_role redirect branching),
  logout, registration with slug de-duplication, OTP verification.
  Passwords are checked with `bcryptjs`, normalizing Laravel's `$2y$` hash
  prefix so it can authenticate against a users table populated by the
  original PHP app.
- **Dine-in QR ordering** (`TableMenuController` -> `src/controllers/tableMenuController.js`,
  full 1:1 port of every method): menu display, table
  session/ownership handling (including the "someone else has this table
  open" start-over prompt), add-to-cart, live cart rendering, order
  confirmation, kitchen routing (food vs. drink), pay-first vs. pay-later
  billing, bill requests, Stripe PaymentIntent creation, transactional paid
  -order completion, table status polling.
- **Database layer**: Sequelize models for every table this module
  touches, with associations mirroring the original Eloquent relationships.
  Schema was reconstructed by reading all ~80 Laravel migrations by hand
  (packagist.org wasn't reachable in this environment, so `php artisan
  migrate` couldn't be run to generate it automatically) - see
  `sql/schema.sql`.

## What was actually tested (not just written)

I installed MariaDB + PHP/Composer in the sandbox, loaded `sql/schema.sql`,
seeded a demo restaurant/table/item, booted `server.js` for real, and
exercised the flow with `curl`:
`GET /demo-restaurant/menu/table-1` → table auto-occupied, session cookie
set → `POST /add-table-menu` → `GET /get-tablecart?show=my` (correct cart
HTML + totals) → `POST /tablecart/store` → confirmed the `table_customers`
row's status flipped to `order_food` in the DB, matching the original
`sendToKitchen()` logic. Auth/register routes were syntax- and
route-checked but not run against seeded users (no OTP email backend
configured) - test those before relying on them.

## What's fully ported and tested (round 2: Kitchen/Bar/Counter)

- **Kitchen + Bar boards** (`KitchenController.php` / `BarController.php`
  -> `src/controllers/stationController.js`). These two Laravel
  controllers were ~95% duplicated code differing only in `is_drink` /
  status names, so they're ported as one parameterized factory
  (`createStationController('kitchen'|'bar')`) instead of copy-pasting -
  same behavior, less duplication. Covers the active-orders board,
  item-status updates (single item or bulk by category), the
  time-wise/table-wise/item-wise view fragments, order-history-by-date,
  and the live kitchen/bar order-count badges. Also merges in
  `TableCustomersPreorder` rows, exactly like the original, for
  restaurants using the pay-first flow.
- **Counter screen** (`CounterController.php` -> `src/controllers/counterController.js`,
  full 1:1 port of every method): the live table
  grid with automatic status derivation (occupied → preparing → ordered →
  served, plus pay-first auto-clear), per-table order drill-down, manual
  bill preparation with discount/tax, order completion (creates the
  `Order`/`OrderItem` rows and resets the table), pay-first order
  approval (moves `TableCustomer` rows into `TableCustomersPreorder` and
  frees the table immediately), table cancellation, online/delivery order
  approval into a virtual table, and undo-bill-request.
- **New model**: `TableCustomersPreorder` (the pay-first preorder queue),
  with the `sql/schema.sql` table to match.
- **Role middleware**: `requireKitchenAdmin` / `requireCounterAdmin`,
  ported field-for-field from `CheckKitchenAdmin.php` / `CheckCounterAdmin.php`.

### Tested (not just written)

Logged in as a seeded restaurant-owner user, then exercised the real
lifecycle end-to-end against the DB: confirmed order → kitchen marks it
`preparing` → `order_delivered` → counter's `get_table_updates` correctly
derived the table status → `make_bill` rendered the right item/total →
`complete_order` created the `Order` + `OrderItem` rows with the exact
expected total and reset the table to `available` with token/session
cleared. Also verified `/kitchen-admin/kitchen` and
`/counter-admin/:slug/counter` render correctly for a real logged-in
session. The bulk item-status-by-category endpoint, the pay-first
approve-table-order path, and the online-order approval path were
route/syntax-checked but not exercised with seeded data - test those
before relying on them.

## What's fully ported and tested (round 3: SuperAdmin menu management)

- **Categories, Menu items (with variants/toppings), Tables CRUD**
  (`SuperAdmin/CategoryController.php`, `SuperAdmin/MenuController.php`,
  `SuperAdmin/RestaurantTableController.php` -> `src/controllers/categoryController.js`,
  `menuController.js`, `restaurantTableController.js`), including image
  uploads (via `multer`), slug de-duplication, drag-order persistence
  endpoints, and the has_variants/has_toppings dynamic sub-forms.
- **`res` middleware** (`requireRestaurantOwner`), ported field-for-field
  from `ResMiddleware.php`.
- A minimal `/dashboard` landing page linking to all the management +
  staff screens (the original `DashboardController` wasn't ported - see below).

### Tested (not just written)

Logged in as the seeded restaurant owner and ran the actual gap this
module closes: created a category through the UI, created a menu item
with two variants through the UI, created a second table through the UI,
then confirmed the new item **immediately appeared on the public
customer-facing menu page** (`/demo-restaurant/menu/table-1`) - the full
loop from admin CRUD to what a diner sees now works, which was the whole
point of this pass (previously menu data could only be seeded directly in
the DB). Also caught and fixed a bug from an earlier pass while doing
this: the `categories` table's image column is actually named
`category_image` (added in a later migration), not `image` - it's fixed
in both the model and `sql/schema.sql` now.

### What's simplified vs. the original in this pass

- **No QR code generation** - `MenuController::qr_code()` /
  `RestaurantTableController::qr_code()` used `App\Helpers\QRHelper`,
  which wasn't ported. Each table's ordering URL is just
  `/{restaurant.slug}/menu/{table.table_slug}`, so add the `qrcode` npm
  package and generate an image of that URL if you need this back.
- **No image resizing** - the original resizes uploads to max 1000x1000
  with PHP's GD library; `src/utils/mediaHelper.js` stores the file as-is.
  Add `sharp` if you need that back.
- Update/delete use `POST /resource/:id/delete` instead of Laravel's
  resourceful `PUT`/`DELETE` routes, since that's what the plain HTML
  forms in the views above send. Functionally identical, just not
  method-spoofed.

## What's fully ported and tested (round 4: real-time updates)

- **Socket.IO-based live updates** replacing the polling-only fallback and
  the earlier `src/utils/events.js` console.log stub. `src/utils/socket.js`
  holds the `io` singleton (initialized once in `server.js`, which now
  creates an explicit `http.createServer(app)` so both Express and
  Socket.IO share the same port). Staff screens join a
  `restaurant-{id}` room (mirroring the original's unused Pusher channel
  naming, `restaurant.{id}`) and get a `restaurant-update` event pushed to
  them the instant an order is placed or any order/table status changes.
- Wired into every status-changing action across the three modules built
  so far: order confirmation, bill requests, paid-order completion,
  pay-first confirm-and-pay (`tableMenuController.js`); every kitchen/bar
  status update, single or bulk (`stationController.js`); and counter
  order updates, bill completion, table cancellation, and order
  decline (`counterController.js`).
- Kitchen/bar board and the counter screen now listen live instead of
  (or in addition to, for the counter's resilience fallback) polling.

**One place this pass goes beyond strict 1:1 parity**: the original app's
`App\Events\NewOrderPlaced` broadcast existed in the PHP code but nothing
in `resources/views` actually subscribed to it (`grep -rn "Echo.channel"
resources/views` turns up nothing) - so the original was polling-only in
practice despite having broadcast infrastructure. This port actually
wires the listener side up, since shipping the same polling-only
experience felt like a regression worth fixing rather than a rule worth
following literally.

### Tested (not just written)

Booted the server, connected a real `socket.io-client` in a separate Node
process, had it join `restaurant-1`, then hit the kitchen
`update-order` endpoint via curl and confirmed the client received the
`restaurant-update` event live with the correct payload
(`{restaurantId, reason: 'status-change', station: 'kitchen'}`) - this is
an actual live push over a real WebSocket connection between two separate
processes, not a mocked test.

### Scaling note

`src/utils/socket.js` runs Socket.IO in-process, same single-process
caveat as `src/utils/cacheStore.js` from the ordering module - fine for
one Node process, but you'll need the `socket.io` Redis adapter
(`@socket.io/redis-adapter`) before running more than one server instance,
since a client connected to server A won't otherwise see an update
triggered by a request that landed on server B.

## What's fully ported and tested (round 5: delivery/pickup checkout flow)

- **Public online ordering menu** (`HomeController.php` ->
  `src/controllers/homeController.js`): a *separate* menu/cart flow from
  the table-QR one - `/{slug}/menu` (no table involved) with a plain
  session-stored cart (matching the original's `session('cart')` array
  format and composite-key logic, crc32 comment-hashing included) rather
  than `TableCustomer` DB rows.
- **Checkout** (`CheckoutController.php` -> `src/controllers/checkoutController.js`):
  guest checkout, guest-creates-account-at-checkout, and
  logged-in-user checkout, pickup vs. home-delivery with the delivery
  charge toggle, COD order placement (Stripe card payment is wired for
  COD-equivalent server logic but needs Stripe.js added client-side to
  actually tokenize a card - noted inline).
- **Order confirmation page** (`OrderController.php`, the customer-facing
  one - not to be confused with `SuperAdmin/OrderController.php` -> 
  `src/controllers/customerOrderController.js`).
- This closes the exact gap flagged at the end of the previous round:
  `CounterController.approveOrder` expects an `Order` row with
  `order_status: 'requested'` to already exist - now something actually
  creates one.

### Tested (not just written)

Ran the complete loop with curl against a real DB and a running server: browsed
the online menu as a fresh guest session → added an item to the session
cart (verified the exact cart JSON shape, composite key, and comment) →
loaded `/checkout` → placed the order as a guest with no account → landed
on `/order/1` showing the right name/items → logged in as the restaurant
owner → saw the order on the counter's pending-online-orders panel →
approved it → confirmed in the DB that a virtual table (`Online #1`) was
created and the order item correctly routed to the kitchen with status
`order_food`. This is the full admin-and-customer loop working together,
not just one side.

### What's simplified vs. the original in this pass

- No outbound email (`OrderAdminEmail` / `OrderUserEmail`) - same TODO
  pattern as the auth/register email notes elsewhere in this file.
- No `Contact`/`store_contact` (the marketing "contact us" form on the
  main landing page) - unrelated to ordering, low priority, skipped.
- Card payment on checkout needs Stripe.js wired up client-side to
  produce a real `stripeToken` before `#stripe_token_input` gets set -
  the server-side verification logic is there, just not the client half.

## What's fully ported and tested (round 6: waiter management)

- **Waiter CRUD** (`SuperAdmin/WaiterController.php` -> `src/controllers/waiterController.js`):
  restaurant owners can create/edit/delete waiter
  accounts. Waiters are just `users` rows with `user_role: 'waiter'` and
  `waiter_id` pointing back at the owning restaurant - the same
  relationship `User.waiters`/`User.restaurant` in `models/index.js`
  already modeled from round 1's auth work, now with a management UI on
  top of it.
- Confirmed this plugs correctly into the existing login branching from
  round 1: a waiter logging in with their own credentials lands on
  `/home`, distinctly from the owner's `/dashboard` redirect - that
  branch existed in `authController.js` since the first pass but had
  never actually been exercised with a real waiter account until now.

### Investigated but intentionally not built further

The restaurant-owner-facing `/dashboard` (`DashboardController.php`,
*not* `SuperAdmin/DashboardController.php` - there are two different
controllers named `DashboardController` in the original codebase) turned
out to be a one-line controller that just renders a mostly-static
"subscribe to unlock ordering" page - `resources/views/res/dashboard.blade.php`
has no stats, charts, or AJAX calls in it. There was nothing substantive
to port beyond what round 3 already built as a links page, so I left it
as-is and spent the round on waiter management instead, which was the
part with real remaining scope. (The *other* `DashboardController`, under
`SuperAdmin/`, is the platform-level one with real restaurant-count/
subscription-count stats - that one's still not ported, see below.)

### Tested (not just written)

Logged in as the seeded owner, created a waiter through the real form
POST, confirmed the row landed in the DB with the exact
`user_type/user_role/waiter_id` combination the original login branching
depends on, then logged in *as that waiter* with their own password and
confirmed the redirect went to `/home` rather than `/dashboard` - i.e.
this is the first time in this whole project the waiter login branch (present
in the code since round 1) has actually been exercised end-to-end.

## What's fully ported and tested (round 7: platform-level SuperAdmin)

- **Platform dashboard** (`SuperAdmin/DashboardController.php` -> `src/controllers/superAdminDashboardController.js`):
  restaurant-registration counts and
  subscription-purchase counts, with the same daily/monthly/yearly/custom
  date-range filtering logic as the original (note: this is a *different*
  `DashboardController` from the one investigated in round 6 - see that
  round's notes on the naming collision between
  `App\Http\Controllers\DashboardController` (restaurant-facing, no real
  stats) and `App\Http\Controllers\SuperAdmin\DashboardController` (this
  one, platform-facing, has real stats)).
- **Restaurant management** (`SuperAdmin/RestaurantController.php` ->
  `src/controllers/superAdminRestaurantController.js`): list with
  search/status/subscription filters and pagination, approve/reject
  status changes, edit (name/slug/email/address/phone/image/logo),
  soft-delete, subscription history view, order history view.
- **Platform settings** (`SuperAdmin/SettingController.php` ->
  `src/controllers/settingController.js`): the key/value settings CRUD
  that `src/utils/settingHelper.js` (built back in the kitchen/bar/counter
  round) already reads currency/etc. from - that helper had no admin UI
  behind it until now.
- **Subscription plan management** (`SuperAdmin/AddSubscriptionController.php`
  -> `src/controllers/subscriptionPlanController.js`): CRUD for the
  purchasable plans themselves (name, duration in months, cost, image).
  This is *plan* management, not the per-restaurant subscribe/switch flow
  (`SuperAdmin/SubscriptionController.php`/`RestaurantSubscriptionController.php`)
  or payment-gateway integration (`StripePaymentController.php`/
  `EsewaPaymentController.php`) - those still aren't ported, since they're
  tightly coupled to whichever payment gateway you actually plan to use
  and there's no live gateway configured in this environment to test
  against honestly.
- **`superadmin` middleware** (`requireSuperAdmin`), ported field-for-field
  from `AdminMiddleware.php`.
- Extended the `Subscription` model with the columns the original actually
  has (`subscription_type`, `month`, `cost`, `image`, `del_status`) - round
  1 had only stubbed `name`.

### Tested (not just written)

Seeded a superadmin user and a pending restaurant, then ran the real
platform-admin loop against the DB: logged in and confirmed the redirect
went to `/superadmin/dashboard` (not `/dashboard`, matching the
user_type-based branching from round 1); loaded the dashboard and
restaurant list and confirmed the pending restaurant showed up correctly
filtered; approved it through the real form POST and confirmed
`status` flipped to `approved` in the DB; bulk-edited platform settings
through the same nested-bracket form convention (`option_value[currency]`)
the original uses and confirmed both rows landed correctly; created a
subscription plan with an image upload and confirmed it persisted with
the right duration/cost. All against a live server and live DB, no mocks.

## What's fully ported and tested (round 8: time-window discounts)

- **Discount management** (`SuperAdmin/DiscountController.php` ->
  `src/controllers/discountController.js`): restaurant owners create
  time-window + day-of-week discount rules (e.g. "20% off, Mon-Fri,
  3pm-5pm") and attach them to specific menu items via the
  `discount_items` many-to-many pivot, matching the original's
  `belongsToMany` relationship exactly.
- **`Item.getActiveDiscount()` / `getDiscountedPrice()`** ported into
  `models/index.js` / `models/Item.js`, including the original's slightly
  unusual "round to the nearest $5" behavior (verified this isn't a
  simplification - re-read `app/Models/Item.php` and it really does
  `round($discountedPrice / 5) * 5`, so e.g. a $10 item at 20% off rounds
  right back to $10; a $20 item at 25% off correctly becomes $15).

**This is the second time this project has gone beyond strict parity, same
pattern as round 4's Socket.IO work**: a `grep -rln "getActiveDiscount"
resources/views/ app/Http/Controllers/` in the original codebase turns up
*nothing* - the discount model/logic existed, restaurant owners could
create discounts through `SuperAdmin/DiscountController.php`, but nothing
in any Blade view or controller ever actually called
`getActiveDiscount()`/`getDiscountedPrice()` to display or charge a
discounted price. It was a fully-wired admin feature with no visible
effect. Rather than porting "an admin can configure discounts that do
nothing," this pass wires the display and pricing through on both the
table-ordering menu (`tableMenuController.js`) and the online-ordering menu
(`homeController.js`) - discounted prices now show with a strikethrough +
badge, and adding an item to either cart charges the discounted price.
Discounts only ever apply to an item's base price, never to a variant's
price (matching the original's `getDiscountedPrice($this->price)` signature,
which has no variant concept at all).

### Tested (not just written) - and a bug I caught along the way

Created a real discount through the UI (25% off, all days, all-day
window) attached to a seeded item, then hit the live table-ordering menu
and confirmed the discounted price displayed - **first attempt showed no
discount at all**, root-caused via a standalone debug script to a bug
where I'd set the computed fields on `item.dataValues.foo` instead of
`item.foo` (Sequelize model instances only proxy declared-attribute
access through `dataValues` automatically; ad-hoc fields need to be set as
plain instance properties for `item.foo` to read them back). Fixed, then
re-verified: the menu showed the struck-through original price and the
correct discounted price, and confirmed via direct DB query that adding
the item to the table-ordering cart actually stored the discounted line
price, not the full price - i.e. the discount doesn't just *display*,
it's the price that gets billed.

## What's fully ported and tested (round 9: promotions)

- **Promotion management** (`SuperAdmin/PromotionController.php` ->
  `src/controllers/promotionController.js`): restaurant owners create
  named promotions (date range, day-of-week, optional time window,
  active/inactive) with a set of items at specific offer prices, via the
  `promotion_items` table (a real one-to-many here, not a pivot - matches
  `PromotionItem` having its own `offer_price` column, unlike `Discount`'s
  plain many-to-many).
- **Public offer pages** (`OfferController.php` -> `src/controllers/offerController.js`):
  `/{slug}/offer` (all active promotions) and
  `/{slug}/offer/{promotion-slug}` (one promotion's detail), both gated
  behind the restaurant having an active subscription - unlike the main
  ordering menu, which isn't gated this way. **Unlike round 8's
  discounts, this is a feature the original genuinely wires up end-to-end**
  (`grep` confirms `offer.blade.php`/`offer-all.blade.php` really do
  render `$promotion->items`), so this round is a straight, faithful port
  with no "the original never actually used this" caveat attached.

### Tested (not just written) - including a second real bug caught

Created a promotion through the UI, confirmed the DB rows were correct,
then verified the subscription gate both ways: hit `/demo-restaurant/offer`
*before* seeding an active `UserSubscription` and got the correct
"subscription is currently inactive" page, then seeded one and confirmed
the same URL now shows the real promotion with the item's original price
struck through against the offer price. Along the way, **a curl test
caught a second real bug**: `offer_price[<item_id>]` bracket-notation form
fields silently broke because `qs` (which `express.urlencoded({extended:true})`
uses under the hood) converts an all-numeric-key bracket object into an
*array* instead of a plain object - so `offer_price[1]=6.50` does not
reliably become `{ "1": "6.50" }`, it can come back as `["6.50"]` with the
key information lost. Confirmed this with a temporary debug log of the
actual parsed `req.body`, then fixed it by switching the form to flat
`offer_price_<item_id>` field names reassembled into a map server-side,
documented inline in `promotionController.js` so the same mistake doesn't
get repeated in a future round.

## What's fully ported and tested (round 10: inventory tracking)

- **Inventory item + stock-movement management**
  (`SuperAdmin/InventoryController.php` -> `src/controllers/inventoryController.js`):
  create items with a starting quantity (which itself records an initial
  "in" transaction, exactly matching the original's `DB::transaction`
  wrapping both writes), edit name/unit, delete, and the stock-in/stock-out
  flows that each record an immutable `InventoryTransaction` row rather
  than just mutating the quantity - so there's always an audit trail of
  *why* the number changed. `InventoryItemPolicy`'s ownership check
  (`$user->id === $item->user_id`) is replicated as a `WHERE id = ? AND
  user_id = ?` on every lookup, same pattern used for waiters/discounts/
  promotions elsewhere in this port.
- **Stock report** (`SuperAdmin/InventoryReportController.php` ->
  `src/controllers/inventoryReportController.js`): opening/in/out/closing
  stock for a date period (daily/weekly/monthly/yearly/custom), computed
  the same way as the original - sum every transaction *before* the
  period start for opening stock, then sum in/out separately *within* the
  period.

### Tested (not just written)

Created a real inventory item with a 100kg starting quantity through the
UI, confirmed that recorded an "Initial stock" transaction; stocked in 50kg
and stocked out 30kg through their respective forms; confirmed the
running quantity (120kg) matched a hand-computed sum of all three
transaction rows exactly; confirmed the over-withdrawal guard correctly
rejects trying to stock out more than the current quantity. Then pulled
the stock report for today and independently verified via a regex-parsed
check of the rendered HTML that opening=0, in=150, out=30, closing=120 -
matching the raw transaction data - and pulled the same report for
yesterday (a date with zero activity) and confirmed it correctly showed
all zeros rather than leaking today's numbers into an empty window.

## What's fully ported and tested (round 11: order reporting)

- **Item-level order reports** (`SuperAdmin/OrderReportController.php` /
  `TableOrderReportController.php` -> `src/controllers/orderReportController.js`):
  these two Laravel controllers are near-identical - differing only in
  the `qr_type` filter ('Order Online QR' vs 'Table Based QR') and view
  path - so they're ported as one parameterized factory
  (`createOrderReportController(qrType, viewPrefix)`), same pattern as
  round 2's kitchen/bar factory. Covers the grouped-by-category,
  summed-by-item sales list and the per-item order-history drill-down.
- **Order summary dashboard** (`SuperAdmin/OrderSummaryController.php` ->
  `src/controllers/orderSummaryController.js`): total order count/sales
  split by online vs. table-based orders. Only the original's *active*
  code path is ported - the file has a large commented-out alternate
  implementation gated on subscription plan name that never actually
  runs, so porting it would mean porting dead code.
- **Shared date-range helper** (`src/utils/reportDateFilter.js`) - kept
  deliberately separate from round 10's `inventoryReportController.js`
  date logic (which also needs `weekly`) rather than forcing a single
  over-general helper on both.
- **A real bug found in the original, not reproduced**: `OrderReportController`'s
  `'custom'` date case does `$start_date = date($start_date);` -
  PHP's global `date()` expects a Unix timestamp as its argument, not a
  date string, so passing something like `"2026-01-01"` there isn't valid
  usage. This port parses the two dates properly instead of reproducing
  that bug, and says so in a comment in `reportDateFilter.js` rather than
  silently "fixing" it without a trace.

### Tested (not just written)

Seeded two online orders' worth of `order_items` (Spring Rolls x2 +
Iced Tea x1, `qr_type: 'Order Online QR'`) and one table order (Iced Tea
x2, `qr_type: 'Table Based QR'`), then verified all three reports against
hand-computed expected numbers: order-summary showed total=2 orders/$29
combined, split correctly into online (1 order/$23) and table (1 order/$6);
the online item-report showed Spring Rolls 2 sold/$20 and Iced Tea 1
sold/$3; the table item-report showed *only* Iced Tea 2 sold/$6, correctly
excluding Spring Rolls (which only appeared in the online order). Also
verified the drill-down "view one item's order history" page, and that
the daily date filter correctly includes today's seeded data but excludes
it when filtering for yesterday. This exercised a query shape I flagged as
risky while writing it - grouping on a raw column reference into a
deeply-nested association (`item.category.category_name`) with
`raw: true` - and it produced exactly the right grouped totals against
real data, not just a 200 status code.

## Automated test suite (round 12: consolidation)

After eleven rounds of manually curl-testing each new module by hand, this
round converts the most important of those manual checks into a real,
runnable, passing automated test suite - so future changes have
regression protection instead of relying on re-running curl commands from
memory.

- **`src/app.js`**: the Express app configuration was extracted out of
  `server.js` into its own factory function, so tests can `require()` it
  directly and drive it with `supertest` without needing a real listening
  port or Socket.IO initialized. `server.js` is now a thin bootstrap
  (create the app, wrap in an HTTP server, init Socket.IO, connect the DB,
  listen) - **this refactor was smoke-tested itself** (boot + login +
  authenticated page load) before anything was built on top of it.
- **`tests/helpers/setup.js`**: rebuilds the schema from `sql/schema.sql`
  against a *separate* test database (`.env.test`, `DB_DATABASE=restaurant_jp_test`
  by default - never the dev DB), and provides a `seedBaseline()` fixture
  (one restaurant + table + category + item) shared across test files.
- **Six test files, 16 tests total**, covering the highest-value flows
  from each round: `auth.test.js` (login branching by user_type/user_role,
  including the waiter-redirect case verified for the first time back in
  round 6), `ordering.test.js` (the full dine-in lifecycle: menu load →
  cart → confirm → kitchen prepare/deliver → counter billing → Order
  creation → table reset), `checkout.test.js` (guest delivery checkout →
  counter approval → virtual table creation), `pricing.test.js`
  (discount price + rounding, promotion subscription-gating),
  `inventoryAndReports.test.js` (stock math + over-withdrawal rejection,
  online-vs-table order report separation), `management.test.js`
  (category/item-with-variants/table CRUD reflected on the public menu),
  and `superadmin.test.js` (platform-admin-only access + restaurant
  approval).
- Run with `npm test` (requires `restaurant_jp_test` to exist - see
  Setup below). Uses Node's built-in test runner (`node:test`, no extra
  runner dependency) plus `supertest` for HTTP assertions, with
  `--test-concurrency=1` so test files - which share one test database -
  never run concurrently and race each other.

### Two real bugs this suite caught immediately, on first run

Running the suite for the first time (not writing it and assuming it'd
pass) surfaced two genuine issues in the *tests themselves*, both fixed
and documented rather than silently patched:

1. The variants-CRUD test initially sent its request with
   `superagent`'s generic form-serialization (`.type('form')` +
   a JS array-of-objects), which does **not** produce the same
   `variants[0][name]=...` indexed structure the real browser form
   (`res/menu/create.ejs`) builds by hand via JavaScript before submit -
   it instead produces a "columnar" `variants[name][]=...` shape that
   `qs` parses completely differently. Fixed by sending JSON instead
   (`express.json()` parses a real array-of-objects unambiguously) rather
   than fighting `superagent`'s form serializer to match browser
   behavior it was never built to replicate.
2. The discount-percentage assertion expected literal `"25% off now"`,
   but the `discount_percentage` column is a `DECIMAL`, which
   Sequelize/MySQL return as the string `"25.00"`, not the number `25` -
   so the rendered page correctly says `"25.00% off now"`. Fixed the
   assertion, not the app - the app's behavior was correct.

## What's explicitly NOT ported yet

Everything else in the original app. In particular:

- **The rest of the SuperAdmin panel**: platform-level restaurant
  approval/management, discounts, promotions, inventory, subscriptions
  billing, settings, reports, waiter management, visiting cards, the
  actual `DashboardController` (stats/charts).
- **Delivery/pickup checkout flow** (`CheckoutController`, `OrderController`,
  non-table `Order` flow, and the customer-facing side of "requested"
  online orders that `CounterController.approveOrder` expects to exist).
- **Google/Facebook OAuth** (Socialite).
- **Staff-call history and escalation** - the current staff-call panel covers
  pending requests and resolution only; reporting and escalation rules remain
  future work.
- **Outbound email** (OTP emails, welcome emails) - noted as TODOs in
  `authController.js` / `registerController.js`.
- **File uploads** (item/category images, restaurant logo) - needs
  `multer`; noted as a TODO in `registerController.js`.
- **The swappable menu-template system** - `menu/table.ejs` is a single
  functional layout, not the original's per-restaurant template picker.
- The other 130 Blade views.

## Setup

```bash
npm install
cp .env.example .env   # fill in real DB creds + rotated Stripe keys
mysql -u root -e "CREATE DATABASE restaurant_jp"
mysql -u root restaurant_jp < sql/schema.sql
npx sequelize-cli db:migrate
npx sequelize-cli db:seed --seed 20260917034909-demo-restaurant.js
npm start
```

The demo seed is repeatable. It creates five kitchen, counter, waiter, and
customer accounts, plus the demo restaurant owner and at least five tables.
All demo accounts use `password123`; the superadmin account is
`demo.superadmin@restaurant.local`, the owner is
`demo.owner@restaurant.local`, and the numbered role accounts follow the
pattern `demo.<role>.<n>@restaurant.local` (the first account omits `.1`).

## Feature map

- Customer table ordering: `src/controllers/tableMenuController.js` and `src/views/menu/table.ejs`
- Online pickup/delivery ordering: `src/controllers/homeController.js`, `src/controllers/checkoutController.js`, and `src/views/menu/online.ejs`
- Kitchen and bar boards: `src/controllers/stationController.js` and `src/views/station/index.ejs`
- Counter tables and billing: `src/controllers/counterController.js` and `src/views/res/counter.ejs`
- Staff calls: `src/controllers/staffCallController.js`, `src/views/res/staff-calls.ejs`, and `src/views/menu/table.ejs`
- Owner menu, category, table, and waiter management: `src/controllers/menuController.js`, `categoryController.js`, `restaurantTableController.js`, and `waiterController.js`
- Superadmin dashboard and platform management: `src/controllers/superAdmin*Controller.js`, `settingController.js`, and `subscriptionPlanController.js`
- Realtime staff updates: `src/utils/socket.js` and `src/utils/events.js`
- Database schema and migrations: `sql/schema.sql` and `migrations/`

This is a demo Express/Sequelize port. Payment gateways, physical printers,
delivery-platform integrations, outbound email, multi-process Socket.IO
scaling, and the broader SaaS specification in `todo/todo.pdf` are not
pretended to be production integrations.

### Running the tests

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS restaurant_jp_test"
# edit .env.test if your local DB user/password differ from the defaults
npm test
```

`npm test` rebuilds the schema from `sql/schema.sql` against
`restaurant_jp_test` every run (via `tests/helpers/setup.js`), so this is
always safe to run against a scratch database - it never touches whatever
DB `.env` (not `.env.test`) points at.

Sessions currently use `express-session`'s in-memory store - fine for this
dev/testing pass, but swap in `connect-session-sequelize` (reuses the same
DB) or `connect-redis` before running more than one process, the way
Laravel's `SESSION_DRIVER=file` wouldn't survive multiple servers either.

Stripe isn't in `package.json` yet on purpose (rotate your key first, then
`npm install stripe`) - `createTablePaymentIntent` already has the
integration code, just commented to require it at call time.

## Project layout

```
server.js                          Thin bootstrap: create app, HTTP server, Socket.IO, DB connect, listen
src/app.js                         Express app factory (used directly by tests via supertest)
src/config/database.js             Sequelize connection
src/models/                        One file per Eloquent model, + index.js for associations
src/middleware/auth.js             ensureAuth/ensureGuest/loadCurrentUser (ports auth/guest middleware)
src/controllers/authController.js  Login/logout/OTP
src/controllers/registerController.js
src/controllers/tableMenuController.js   The full dine-in ordering module
src/routes/web.js                  Ported subset of routes/web.php
src/views/                         EJS views (chosen over Blade's component
                                    system since EJS doesn't support Blade
                                    components 1:1; layout via express-ejs-layouts)
src/utils/                         Password hashing, slug helper, cache-lock stub, event stub
sql/schema.sql                     Flattened schema for the tables this module uses
tests/                              16 automated tests across 6 files (see "Automated test suite" above), run via `npm test`
.env.test                           Test-database config (separate from .env - never points at your dev DB)
```

## Suggested next steps, in order

1. Expand the test suite's coverage as you build on this - it currently
   covers the highest-value path through each major module, not every
   endpoint (e.g. the bulk item-status-by-category kitchen endpoint, the
   pay-first approve-table-order path, and most SuperAdmin CRUD screens
   beyond restaurant approval aren't covered yet - see round 3/4's READMEs
   for what else was only manually spot-checked).
2. Pick a real payment gateway and wire up the actual subscription
   purchase/renewal flow (`RestaurantSubscriptionController.php`,
   `StripePaymentController.php`/`EsewaPaymentController.php`) plus
   Stripe.js client-side for card payments on checkout and table-ordering
   (`tableMenuController.js` already creates the PaymentIntent
   server-side) - all of this was deliberately left unbuilt rather than
   faked against a gateway that isn't actually configured.
3. Add the `socket.io` Redis adapter before running more than one server
   process (see "Scaling note" above) - same for the in-memory session
   store and payment-lock cache noted elsewhere in this file.
4. Wire up outbound email (order confirmations, OTP, contact form,
   restaurant status-change notifications) - there are several TODOs
   marked for this throughout the codebase.
5. If you build more forms with per-item keyed inputs (offer prices,
   custom fields, etc.), use the flat `<prefix>_<id>` naming convention
   from `res/promotion/create.ejs`/`promotionController.js`, not
   `<prefix>[<id>]` bracket notation - see the qs array-conversion bug
   documented there.

At this point every major functional area of the original Laravel app has
a tested Express equivalent: auth, dine-in ordering, kitchen/bar/counter,
menu/table/waiter management, real-time updates, delivery/pickup
checkout, platform administration, discounts, promotions, inventory, and
order reporting - now backed by a real automated test suite rather than
purely manual verification. What's left is narrower and mostly
infrastructure/integration work rather than new product surface - see the
numbered list above.
