# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. Most days it is quiet, but when a very popular concert goes on sale, a huge crowd arrives at once and competes for a small number of seats. The hard part of the design is therefore not average load: it is **surviving the spike without ever selling the same seat twice**.

The document follows six parts: (1) requirements, (2) estimates, (3) API, (4) data model, (5) architecture, (6) trade-offs. The explanation of how double-booking is prevented is in Part 4.3 and is referenced again in Part 5.

---

## Part 1: Requirements

### 1.1 Functional requirements

1. Users can **register, log in** and manage an account.
2. Users can **browse and search events** by artist, city, venue and date.
3. Users can **view an event's seat map** with live availability and prices.
4. Users can **select seats and hold them temporarily** (10 minutes) while they pay.
5. Users can **pay** for held seats and receive confirmed tickets.
6. Users can **view their tickets** (with a QR code) and order history.
7. Held seats that are not paid for are **released automatically** when the hold expires.
8. Users receive a **confirmation email** after purchase.
9. Organizers can create events and set seat layouts and prices (admin side, out of scope for detailed design).

### 1.2 Non-functional requirements

| Quality | Requirement | Why it matters |
|---|---|---|
| **Correctness (most important)** | A seat must **never** be sold to two people. A user must never be charged without receiving a ticket, nor receive a ticket without being charged. | Double-selling means angry customers at the venue door, refunds, and lost trust. |
| **Consistency** | Seat ownership is **strongly consistent**: once a hold or sale succeeds, every later request sees it. Browsing data (event descriptions, even the seat map display) may be slightly stale (a few seconds). | Correctness is required where money and seats change hands; staleness is harmless where users merely look. |
| **Speed** | Browse and event pages: p95 under 300 ms. Seat map: p95 under 500 ms. Hold request: p95 under 1 s, even during a big sale. | Users in a high-demand sale abandon or refresh-spam if the site feels slow, which makes load worse. |
| **Fairness** | Roughly first-come-first-served among people who arrive for a sale; limits on tickets per person (for example, 4); protection from bots and scalpers' scripts. | With 10 buyers for every seat, unfairness (bots, people with faster connections hammering the server) is the main source of complaints. |
| **Availability** | 99.9% normally; the checkout path should target 99.99% during an on-sale. | Downtime during the sale is the most visible failure possible. |
| **Scalability** | Handle roughly 500-3,000 times the normal request rate for short bursts. | See Part 2. |
| **Resilience** | A crash of any single server, cache node or worker must not lose or duplicate orders. Payment and ticket creation must be idempotent. | Retries are unavoidable in distributed systems and must be safe. |
| **Durability** | Orders, payments and tickets are never lost (replicated database, backups). | They are financial records. |
| **Security** | Passwords hashed; card data handled by a PCI-compliant payment provider and never stored by us; HTTPS everywhere. | Legal and trust requirements. |
| **Observability** | Metrics, logs and alerts for hold success rate, payment failures, queue length and latency. | The sale is a one-shot event; problems must be spotted in seconds. |

---

## Part 2: Estimates

### 2.1 Assumptions

| Assumption | Value |
|---|---|
| Registered users | 2,000,000 |
| Visitors on a normal day | 50,000 |
| Pages viewed per visitor on a normal day | 10 |
| Tickets sold on a normal day | 5,000 |
| Average tickets per order (assumed) | 2 |
| Peak multiplier for a normal day (assumed) | 5x average |
| Seconds per day | 86,400 |
| Big sale: people trying to buy | 200,000 within the first 10 minutes (600 s) |
| Big sale: seats available | 20,000 |
| Requests per big-sale user (assumed) | About 10 (event page, seat map and its refreshes, hold attempts, payment) |
| Hold attempts per big-sale user (assumed) | About 3 (when a seat is taken, they try another) |
| Share of big-sale users arriving in the first minute (assumed) | 50% |

### 2.2 Normal day

```
Page views per day   = 50,000 x 10          = 500,000 views/day
Average page views   = 500,000 / 86,400     = ~5.8 views/s
Peak page views      = 5.8 x 5              = ~29 views/s

Tickets per day      = 5,000
Orders per day       = 5,000 / 2            = 2,500 orders/day
Average ticket sales = 5,000 / 86,400       = ~0.06 tickets/s   (about 1 order every 35 s)
Peak ticket sales    = 0.06 x 5             = ~0.3 tickets/s
```

A normal day is trivial: one small server and one database could handle it. Storage is also small (about 900,000 orders and 1.8 million tickets per year, under a few GB).

### 2.3 Big sale (popular concert goes on sale)

```
Users                = 200,000 in 600 s     = ~333 new users/s (average over the 10 minutes)
Total requests       = 200,000 x 10         = 2,000,000 requests
Average request rate = 2,000,000 / 600      = ~3,300 requests/s

First-minute surge   = 100,000 users in 60 s = ~1,700 users/s
Peak request rate    = 1,700 x 10           = ~17,000 requests/s

Hold attempts        = 200,000 x 3          = 600,000 attempts  ->  ~1,000/s average, ~5,000/s in the first minute
Seats sold           = 20,000 in 10 minutes = ~33 tickets/s on average
Demand vs supply     = 200,000 / 20,000     = 10 people per seat
Seats held at once   = at most 20,000 (there are only 20,000 seats)
```

Contention is the dominant fact: **90% of the people who show up will not get a ticket**, and thousands will fight for the same few "best" seats at the same instant.

### 2.4 Comparison

| Metric | Normal day | Big sale | Increase |
|---|---|---|---|
| Page views / requests per second (average) | ~5.8 | ~3,300 | ~575x |
| Page views / requests per second (peak) | ~29 | ~17,000 | ~575x (vs normal peak), ~2,900x (vs normal average) |
| Ticket sales per second (average) | ~0.06 | ~33 | ~575x |
| Seats being fought over | Spread across many events | 20,000 seats of one event | Concentrated on one event |
| Duration | All day | About 10 minutes | Extremely bursty |

**Conclusion:** the system must be sized for the big sale, not the normal day; it is read-heavy (seat map views) with a short, intense burst of contended writes (holds and purchases). The write rate itself (hundreds to a few thousand writes per second) is manageable for one well-tuned database, **provided the read traffic is kept away from it** and the incoming crowd is throttled.

---

## Part 3: API

All endpoints use HTTPS and JSON. Authenticated endpoints require a bearer token. Writes that spend money or seats accept an `Idempotency-Key` header so a retried request never causes a duplicate.

| # | Method and path | Purpose | Notes |
|---|---|---|---|
| 1 | `GET /events?query=&city=&date=&page=` | **Browse and search events.** Returns a page of events. | Public, cacheable by CDN for 30-60 s. |
| 2 | `GET /events/{eventId}` | Event details (artist, venue, time, price range, sale start time, sold-out flag). | Public, CDN-cacheable. |
| 3 | `GET /events/{eventId}/seats?section=` | **View seats.** Returns each seat with status `AVAILABLE`, `HELD` or `SOLD`, and price. | Served from a cache that is at most 1-2 s old. Display only; not authoritative. |
| 4 | `POST /events/{eventId}/holds` | **Hold seats.** Body: `{"seatIds": [101, 102]}`. Returns `201 {"orderId": 9001, "expiresAt": "..."}` or `409 Conflict` listing the seats that are no longer available. | Authenticated. All-or-nothing. Max 4 seats. This is the key double-booking-safe step (Part 4.3). |
| 5 | `DELETE /holds/{orderId}` | Release held seats early (user changes mind). | Authenticated, owner only. |
| 6 | `POST /orders/{orderId}/payments` | **Pay.** Body: `{"paymentToken": "tok_..."}` with `Idempotency-Key`. Returns `200 {"status": "PAID", "tickets": [...]}`, `402` if payment fails, or `410 Gone` if the hold expired. | Authenticated. The token comes from the payment provider, so card numbers never touch our servers. |
| 7 | `GET /users/me/tickets` | **View your tickets.** Lists the user's tickets with event, seat and QR code. | Authenticated. |
| 8 | `GET /orders/{orderId}` | Order status (`PENDING`, `PAID`, `EXPIRED`, `CANCELLED`). | Authenticated, owner only. Used by the client to poll after payment. |
| 9 | `POST /events/{eventId}/waiting-room` | Join the virtual queue for a hot sale; returns a queue position and ticket. | Used only for high-demand events (Part 5). |
| 10 | `GET /events/{eventId}/waiting-room/status` | Poll queue position; when admitted, returns a short-lived **admission token** required by endpoint 4. | Cheap, served from Redis. |
| 11 | `POST /auth/login`, `POST /auth/register` | Account access. | Rate-limited. |

Example hold failure:

```json
HTTP/1.1 409 Conflict
{ "error": "SEATS_UNAVAILABLE", "unavailableSeatIds": [102] }
```

---

## Part 4: Data Model

### 4.1 Tables and relationships

```
 users 1 ------< orders 1 ------< tickets >------ 1 seats >------ 1 events
                    |                                                  |
                    1                                                  |
                    |                                                  |
                    +------< payments                  events >------ 1 venues

 seats.order_id --> orders.order_id   (the pending or paid order currently holding the seat)

 users   1 : many orders      (a user places many orders)
 events  1 : many seats       (each event has its own seat inventory)
 orders  1 : many tickets     (an order buys one or more seats)
 seats   1 : 0..1 valid ticket (a seat can have at most one valid ticket)
 orders  1 : many payments    (retries and refunds are separate payment records)
 venues  1 : many events
```

### 4.2 Table definitions (PostgreSQL)

```sql
CREATE TABLE users (
  user_id        BIGINT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venues (
  venue_id   BIGINT PRIMARY KEY,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL,
  capacity   INT  NOT NULL
);

CREATE TABLE events (
  event_id      BIGINT PRIMARY KEY,
  venue_id      BIGINT NOT NULL REFERENCES venues(venue_id),
  title         TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  on_sale_at    TIMESTAMPTZ NOT NULL,
  max_per_user  INT NOT NULL DEFAULT 4,
  status        TEXT NOT NULL CHECK (status IN ('DRAFT','ON_SALE','SOLD_OUT','CANCELLED','DONE'))
);
CREATE INDEX idx_events_search ON events (starts_at, status);

CREATE TABLE orders (
  order_id         BIGINT PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(user_id),
  event_id         BIGINT NOT NULL REFERENCES events(event_id),
  status           TEXT NOT NULL CHECK (status IN ('PENDING','PAID','EXPIRED','CANCELLED','REFUNDED')),
  total_cents      INT NOT NULL CHECK (total_cents >= 0),
  expires_at       TIMESTAMPTZ NOT NULL,          -- hold deadline while PENDING
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)               -- a retried request cannot create a second order
);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);

-- One row per physical seat PER EVENT. This is the inventory that must never be oversold.
CREATE TABLE seats (
  seat_id          BIGINT PRIMARY KEY,
  event_id         BIGINT NOT NULL REFERENCES events(event_id),
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INT  NOT NULL,
  price_cents      INT  NOT NULL,
  status           TEXT NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE','HELD','SOLD')),
  order_id         BIGINT REFERENCES orders(order_id),   -- who holds/owns it
  hold_expires_at  TIMESTAMPTZ,
  UNIQUE (event_id, section, row_label, seat_number),     -- no duplicate seat definitions
  CHECK ( (status = 'AVAILABLE' AND order_id IS NULL AND hold_expires_at IS NULL)
       OR (status = 'HELD'      AND order_id IS NOT NULL AND hold_expires_at IS NOT NULL)
       OR (status = 'SOLD'      AND order_id IS NOT NULL) )
);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_seats_hold_expiry  ON seats (hold_expires_at) WHERE status = 'HELD';

CREATE TABLE tickets (
  ticket_id    BIGINT PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(order_id),
  seat_id      BIGINT NOT NULL REFERENCES seats(seat_id),
  event_id     BIGINT NOT NULL REFERENCES events(event_id),
  qr_code      TEXT   NOT NULL UNIQUE,
  status       TEXT   NOT NULL CHECK (status IN ('VALID','REFUNDED','CANCELLED'))
);
-- Final safety net: at most ONE valid ticket per seat, enforced by the database itself.
CREATE UNIQUE INDEX uniq_valid_ticket_per_seat ON tickets (seat_id) WHERE status = 'VALID';

CREATE TABLE payments (
  payment_id        BIGINT PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders(order_id),
  provider_ref      TEXT UNIQUE,                 -- charge id from the payment provider
  amount_cents      INT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('PENDING','SUCCEEDED','FAILED','REFUNDED')),
  idempotency_key   TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The four core tables requested (users, events, seats, orders) are supported by `venues`, `tickets` and `payments`.

### 4.3 How double-booking is prevented

The core idea: **the database is the single source of truth for seat ownership, and it makes the decision atomically.** The application never does "check if free, then mark as taken" as two separate steps, because between the two steps another request could sneak in (a race condition). Instead, the check and the claim are **one atomic statement**, protected by row locks, with constraints as a backstop.

**Layer 1: Atomic conditional hold (transaction + row lock).**

When `POST /events/{id}/holds` arrives, the app server runs, in one transaction:

```sql
BEGIN;
INSERT INTO orders (order_id, user_id, event_id, status, total_cents, expires_at, idempotency_key)
VALUES (:order_id, :user_id, :event_id, 'PENDING', :total, now() + interval '10 minutes', :idem_key);

UPDATE seats
   SET status = 'HELD',
       order_id = :order_id,
       hold_expires_at = now() + interval '10 minutes'
 WHERE event_id = :event_id
   AND seat_id  = ANY(:seat_ids)                  -- ids sorted ascending (avoids deadlocks)
   AND ( status = 'AVAILABLE'
         OR (status = 'HELD' AND hold_expires_at < now()) );   -- expired holds can be taken

-- The app checks the number of rows updated:
--   rows_updated == number of seats requested  -> COMMIT  (all seats are ours)
--   otherwise                                  -> ROLLBACK, return 409 (all-or-nothing)
```

Why this is safe: when two users (A and B) click the same seat at the same moment, the database takes a **row-level lock** on that seat when the first `UPDATE` touches it. The second `UPDATE` must wait until the first transaction commits. After it commits, the second statement **re-checks the `WHERE` condition**, sees `status = 'HELD'` with a future expiry, matches **zero rows**, and the app returns `409 Conflict`. Exactly one winner, decided by the database, with no application-level locking.

```
Time   User A                                   User B
 t1    BEGIN; UPDATE seat 101 ...   (locks row)
 t2                                             BEGIN; UPDATE seat 101 ...   (waits for lock)
 t3    1 row updated -> COMMIT
 t4                                             lock released; WHERE re-evaluated:
                                                status is now HELD -> 0 rows -> ROLLBACK -> 409
```

Multi-seat requests sort seat IDs before updating, so two users who want overlapping sets of seats lock rows in the same order and cannot deadlock each other. If a deadlock still occurs, the database aborts one transaction and the app retries once.

**Layer 2: Atomic purchase (transaction with ownership checks).**

Payment happens through an external provider, so we never keep a database transaction open during the charge (that would hold locks for seconds and wreck throughput). The flow is:

1. Extend the hold slightly (for example, to 5 more minutes) and mark the order as paying, so the sweeper cannot release the seats mid-payment.
2. Call the payment provider **outside** any transaction, using the order's idempotency key.
3. On success, finalize in one short transaction:

```sql
BEGIN;
SELECT status, expires_at FROM orders WHERE order_id = :order_id AND user_id = :user_id FOR UPDATE;
--   (order must be PENDING; locking it also prevents a double submit from finalizing twice)

UPDATE seats SET status = 'SOLD', hold_expires_at = NULL
 WHERE order_id = :order_id AND status = 'HELD';
--   rows_updated must equal the number of seats in the order; otherwise ROLLBACK and refund

INSERT INTO tickets (ticket_id, order_id, seat_id, event_id, qr_code, status)
  SELECT :new_id, order_id, seat_id, event_id, :qr, 'VALID' FROM seats WHERE order_id = :order_id;

UPDATE orders SET status = 'PAID' WHERE order_id = :order_id;
UPDATE payments SET status = 'SUCCEEDED' WHERE order_id = :order_id;
COMMIT;
```

Because the seat update requires `order_id = :order_id AND status = 'HELD'`, only the order that holds the seat can sell it. If the hold somehow lapsed and another order took the seat, the update matches zero rows, the transaction rolls back, and the payment is **automatically refunded**. The user is never charged for a seat they do not get.

**Layer 3: Database constraints as a last line of defense.**

Even if there were a bug in the application code, the schema makes double-booking impossible:

- `uniq_valid_ticket_per_seat`, a **partial unique index** on `tickets(seat_id) WHERE status = 'VALID'`: the database physically refuses to insert a second valid ticket for the same seat. The second insert fails with a constraint violation and its transaction rolls back.
- `CHECK` constraint on `seats` ties `status` to `order_id`: a seat cannot be `SOLD` without an owner, or `AVAILABLE` while pointing at an order.
- `UNIQUE (event_id, section, row_label, seat_number)`: the same physical seat cannot be defined twice for an event.
- `UNIQUE (user_id, idempotency_key)` on `orders` and `UNIQUE idempotency_key` on `payments`: a double-click or network retry replays the same request instead of creating a second order or charge.
- Foreign keys: tickets cannot reference seats, orders or events that do not exist.

**Layer 4: Expiry of abandoned holds.**

A background worker runs every few seconds:

```sql
UPDATE seats SET status = 'AVAILABLE', order_id = NULL, hold_expires_at = NULL
 WHERE status = 'HELD' AND hold_expires_at < now();
UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at < now();
```

Even if the worker is late, the hold query in Layer 1 treats an expired hold as available (`hold_expires_at < now()`), so correctness never depends on the sweeper running on time.

**What we deliberately do NOT rely on:** the cache, the seat map shown in the browser, or a Redis lock to decide who gets a seat. The seat map is a *hint* (it may be 1-2 seconds stale and users may click a seat that was just taken); the **hold is the decision**. A distributed lock held in a cache could expire or be lost on failover, whereas a database row lock inside a transaction cannot be bypassed.

**Summary of the guarantee:** one atomic conditional update decides who wins a seat; ownership checks in the purchase transaction ensure only the holder can sell it; a unique index makes a second valid ticket for the same seat impossible; idempotency keys make retries safe.

---

## Part 5: Architecture

### 5.1 Diagram

```
                                 +-----------------------+
                                 |   Users (web/mobile)  |
                                 +-----------+-----------+
                                             |
                                             v
                        +------------------------------------------+
                        |   CDN + WAF (bot filtering, rate limits)  |
                        |  caches: event pages, images, JS/CSS,     |
                        |  search results, "sold out" page          |
                        +--------------------+---------------------+
                                             | cache misses and
                                             | dynamic API calls
                                             v
                        +------------------------------------------+
                        |   Waiting Room (virtual queue)           |
                        |   active for hot on-sales; admits users  |
                        |   in batches with an admission token     |
                        |   (state in Redis)                       |
                        +--------------------+---------------------+
                                             |
                                             v
                                   +-------------------+
                                   |   Load Balancer   |
                                   +---------+---------+
                          +------------------+------------------+
                          |                                     |
                          v                                     v
              +-----------------------+            +-------------------------+
              |  Browse App Servers   |            |  Checkout App Servers   |
              |  (events, search,     |            |  (holds, payments,      |
              |   seat map reads)     |            |   orders, tickets)      |
              |  stateless, many      |            |  stateless, protected   |
              +-----+-----------+-----+            +-----+----------+--------+
                    |           |                        |          |
                    v           v                        |          |
              +-----------+  +-----------+               |          +---------------------+
              |  Redis    |  | Read      |               |                                |
              |  Cache    |  | Replicas  |               v                                v
              | (seat map |  | (browse   |      +----------------------+       +--------------------+
              |  1-2 s,   |  |  queries) |      |   Primary Database   |       |  Payment Provider  |
              |  events,  |  +-----^-----+      |   (PostgreSQL)       |       |  (external, PCI)   |
              |  counters)|        |            |  seats, orders,      |       +--------------------+
              +-----------+        | replication|  tickets, payments   |
                    ^              +------------+  ALL holds and sales |
                    |                           +----------+-----------+
                    |                                      |
                    | refreshed from replica               | after commit: publish event
                    |                                      v
              +-----+-----------+               +----------------------+
              | Seat-map        |               |   Message Queue      |
              | snapshot job    |               |  (order-paid,        |
              | (every 1 s)     |               |   hold-expired,      |
              +-----------------+               |   email, refund)     |
                                                +----------+-----------+
                                                           |
                                         +-----------------+-----------------+
                                         v                 v                 v
                                  +-------------+  +---------------+  +----------------+
                                  | Email /     |  | Ticket / QR   |  | Hold-expiry    |
                                  | notification|  | PDF worker    |  | sweeper &      |
                                  | worker      |  | -> Object     |  | refund worker  |
                                  +-------------+  | Storage       |  +----------------+
                                                   +---------------+
```

**Request paths**

- **Browse path:** User -> CDN -> Browse App Server -> Redis -> (miss) Read Replica. The primary database is never touched.
- **Seat map path:** User -> Browse App Server -> Redis snapshot (refreshed once per second from a replica).
- **Buy path:** User -> CDN/WAF -> Waiting Room (if enabled) -> Load Balancer -> Checkout App Server -> Primary Database (hold, then purchase) -> Payment Provider -> Queue -> Workers.

### 5.2 Components

| Component | What it does and why it is there |
|---|---|
| **CDN** | Serves images, static files and cacheable pages (event details, search results) from edge servers, so the vast majority of the 17,000 requests/s never reach our servers. |
| **WAF / rate limiter** | Blocks known bots, enforces per-IP and per-account request limits, and adds CAPTCHA challenges before a hot sale, protecting both fairness and capacity. |
| **Waiting room (virtual queue)** | Holds back the crowd for a hot sale and admits users at a rate the checkout system can handle (for example, 1,000-2,000 at a time), turning a thundering herd into a controlled flow and giving fairness (order of arrival). |
| **Load balancer** | Distributes traffic across app servers, removes unhealthy ones and routes browse and checkout traffic to separate pools. |
| **Browse app servers** | Stateless servers for read-only requests (events, search, seat map); can be scaled out widely and cannot hurt checkout if overwhelmed. |
| **Checkout app servers** | Stateless servers that run the hold, payment and ticket logic; a separate pool so that browsing floods can never starve buyers, and sized to the admission rate rather than the crowd size. |
| **Redis cache** | Keeps event data, the 1-2 second seat-map snapshot, queue state and rate-limit counters in memory, so reads cost nothing at the database. |
| **Seat-map snapshot job** | Reads seat statuses from a replica once per second and writes them to Redis, so 10,000 seat-map requests per second become about one database query per second per event. |
| **Primary database (PostgreSQL)** | Holds the authoritative seat, order, ticket and payment data and performs the atomic hold and purchase transactions that guarantee no double-booking (Part 4.3). |
| **Read replicas** | Serve browse and snapshot queries from copies of the primary, keeping the primary free for writes. |
| **Payment provider** | Handles card data and charging (PCI compliance), called outside database transactions with idempotency keys. |
| **Message queue** | Lets the checkout path return quickly and hand slow work (emails, ticket PDFs, refunds, expiry events) to background workers, absorbing bursts and allowing retries. |
| **Workers** | Send confirmation emails, generate ticket PDFs and QR codes, release expired holds, and issue automatic refunds when a payment succeeds but the seat is lost. |
| **Object storage** | Stores event images and generated ticket PDFs cheaply and durably, served through the CDN. |

### 5.3 How the design survives the big sale

1. **Absorb the crowd at the edge.** Event pages, images and scripts come from the CDN; the "sold out" page is a static page. The 17,000 requests/s peak reaches our servers as a small fraction of that.
2. **Throttle with the waiting room.** Instead of 200,000 people hitting checkout at once, the waiting room admits users in batches. The checkout and database layers see a steady, predictable load that was sized for in advance, and users receive a fair queue position rather than a random timeout.
3. **Keep reads off the primary.** The seat map comes from a Redis snapshot refreshed once per second. Thousands of people refreshing the map put almost no load on the database.
4. **Keep the write path short and narrow.** A hold is a single transaction with one indexed `UPDATE` (a few milliseconds). Even at about 5,000 hold attempts per second in the first minute, most of which fail fast with 409, a properly sized primary can keep up, and the admission rate caps the number that arrive.
5. **Separate pools.** Browse traffic and checkout traffic run on different server pools, so a flood of browsing cannot block someone who is paying.
6. **Fail fast when sold out.** When the last seat is sold, the event's status flips to `SOLD_OUT`, the cache and CDN serve a sold-out response, and further hold requests are rejected without touching the database, which removes 90% of the crowd's load almost instantly.
7. **Pre-provision.** Because on-sale times are known in advance, servers, cache nodes and replicas are scaled up before the sale and the cache is warmed, rather than relying on autoscaling that reacts too slowly to a 10-minute spike.
8. **Isolate slow dependencies.** The payment provider is called outside database transactions and with timeouts and retries; if it is slow, seats stay safely held (up to the expiry) and no database locks are tied up. Emails and PDFs run in workers off the queue, so a mail outage does not slow checkout.
9. **Safe under failure.** If a checkout server crashes after payment but before finalizing, the idempotency key lets the retry finish the order; if finalizing becomes impossible, the refund worker returns the money. The primary has a synchronous standby for failover so confirmed sales are not lost.
10. **Fairness controls.** Per-user ticket limit (4), one active hold per account, CAPTCHA and rate limits at the WAF, and the admission token (required for holds) stop scripts from bypassing the queue.

---

## Part 6: Trade-offs

### 6.1 Strong consistency for seats versus scalability and availability

- **Choice:** all holds and purchases go through a single primary database with ACID transactions.
- **Benefit:** simple, provably correct protection against double-booking.
- **Cost:** the primary is a single write point, so write capacity is limited to what one machine can do (and failover takes seconds). It is acceptable here because the write rate is modest (about 33 sales/s, a few thousand hold attempts/s at most) once reads are cached and the crowd is throttled.
- **Alternative:** sharding by `event_id` (so each event's seats live on one shard) would raise capacity later while keeping each event's transactions single-node; we avoid it now because of the added complexity. We deliberately do **not** choose an eventually consistent store for seat ownership, since correctness is the top requirement.

### 6.2 Stale seat map (cache) versus freshness

- **Choice:** the seat map is a snapshot up to 1-2 seconds old.
- **Benefit:** it cuts database reads by orders of magnitude and keeps the map fast.
- **Cost:** users sometimes click a seat that has just been taken and receive a `409` ("seat no longer available, please choose another").
- **Mitigation:** the client shows a friendly message, highlights alternatives and may poll more often for a small area of the map. Correctness is unaffected because the hold, not the map, decides.

### 6.3 Waiting room: protection and fairness versus user friction

- **Choice:** a virtual queue in front of checkout for hot events.
- **Benefit:** the system stays up, load is predictable, and ordering is fairer than a free-for-all that favors bots and fast connections.
- **Cost:** extra moving parts and a worse experience for those who wait for a long time (and most will leave empty-handed because of the 10:1 oversubscription). Some users are annoyed even when the process is fair.
- **Mitigation:** show accurate position and estimated wait; allow pre-registration; for the very hottest events, consider a randomized lottery for everyone who joins before the sale starts instead of strict arrival order, which removes the advantage of racing.

### 6.4 Hold duration: fairness to buyers versus seat utilization

- **Choice:** 10-minute holds.
- **Benefit:** enough time to pay without panic.
- **Cost:** abandoned holds lock seats away from others; in a 10:1 sale, seats may appear sold out while some are only held, causing a flurry of last-minute returns.
- **Mitigation:** shorten holds (for example, to 5 minutes) for hot events, show a countdown, and release seats immediately when a user cancels or payment fails.

### 6.5 Atomic conditional update versus explicit locking (pessimistic or distributed locks)

- **Choice:** a single `UPDATE ... WHERE status = 'AVAILABLE'` with a rows-affected check, plus constraints.
- **Benefit:** short lock duration, high throughput, no lock management, nothing to leak.
- **Cost:** a conflict is only discovered at write time (user sees 409), and hot seats see contention.
- **Alternative rejected:** `SELECT ... FOR UPDATE` while the user thinks or pays would hold locks for minutes, and Redis-only distributed locks can be lost on failover and cannot protect the database from a buggy client.

### 6.6 Pre-provisioned capacity versus cost

- **Choice:** scale up ahead of a known on-sale rather than rely on autoscaling.
- **Benefit:** capacity is already there when 17,000 requests/s arrive in the first minute.
- **Cost:** paying for servers that sit idle most of the time (a 575x gap between normal and peak); this is mitigated by scaling down immediately after the sale and by renting capacity only for the event window.

---

## Summary

| Question | Answer |
|---|---|
| Normal traffic | ~5.8 page views/s (peak ~29/s); ~0.06 tickets/s |
| Big sale traffic | ~3,300 requests/s average, ~17,000/s first-minute peak; ~33 tickets/s |
| Difference | About 575x in rate; 10 buyers for each seat |
| Biggest risk | Selling a seat twice under heavy concurrency |
| How it is prevented | Atomic conditional `UPDATE` in a transaction (row lock), ownership-checked purchase transaction, partial unique index on valid tickets, idempotency keys, expiry sweeper as cleanup only |
| How the big sale is survived | CDN, waiting room, cached seat map, separate checkout pool, short single-row writes, fail-fast sold-out, pre-provisioned capacity |
| Main trade-offs | Strong consistency vs write scalability; stale seat map vs load; waiting room fairness vs friction; hold time vs utilization |
