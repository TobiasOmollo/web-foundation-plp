# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow. The database stores **metadata only**; the photo files live in object storage.

---

## 1. Assumptions and Daily Active Users

| Assumption | Value |
|---|---|
| Registered users | 10,000,000 |
| Daily active share | 10% |
| Uploads per active user per day | 1 |
| Feed pages viewed per active user per day | 50 |
| Average original photo size | 2 MB |
| Thumbnail size per photo | 50 KB |
| Peak multiplier | 5x average |
| Seconds per day | 86,400 |
| Units | Decimal (1 TB = 1,000,000 MB) |

Additional assumptions (for bandwidth and metadata only):

- A feed page shows about 10 thumbnails (about 500 KB per page).
- One metadata row (photo ID, owner ID, object key, caption, timestamp) is about 500 bytes.

**Daily active users (DAU)**

```
DAU = 10,000,000 x 10% = 1,000,000 users per day
```

---

## 2. Load and Storage Estimates

### Uploads per second

```
Uploads per day      = 1,000,000 users x 1 photo = 1,000,000 uploads/day
Average uploads/sec  = 1,000,000 / 86,400        = ~11.6 uploads/s
Peak uploads/sec     = 11.6 x 5                  = ~58 uploads/s
```

### Feed views per second

```
Feed views per day   = 1,000,000 users x 50 pages = 50,000,000 views/day
Average views/sec    = 50,000,000 / 86,400        = ~579 views/s
Peak views/sec       = 579 x 5                    = ~2,900 views/s
```

### Photo storage per year

```
Originals per day    = 1,000,000 x 2 MB   = 2,000,000 MB = 2 TB/day
Thumbnails per day   = 1,000,000 x 50 KB  = 50 GB/day
Total per day        = ~2.05 TB/day

Originals per year   = 2 TB x 365         = 730 TB
Thumbnails per year  = 50 GB x 365        = ~18.25 TB
Total per year       = ~748 TB (about 0.75 PB)
```

If the object store keeps 3 copies for durability, the raw footprint is about 2.2 PB per year.

### Summary table

| Metric | Average | Peak (5x) |
|---|---|---|
| Uploads per second | ~11.6 | ~58 |
| Feed views per second | ~579 | ~2,900 |
| Upload bandwidth (2 MB x uploads/s) | ~23 MB/s | ~116 MB/s |
| Feed image bandwidth (0.5 MB x views/s) | ~290 MB/s | ~1.45 GB/s |

| Storage | Per day | Per year |
|---|---|---|
| Original photos | 2 TB | 730 TB |
| Thumbnails | 50 GB | ~18 TB |
| **Photo files total** | **~2.05 TB** | **~748 TB** |
| Metadata in the database (500 B/photo) | ~500 MB | ~180 GB |

---

## 3. Read-Heavy or Write-Heavy?

**SnapShare is read-heavy.** Each active user makes 50 feed views for every 1 upload, a ratio of about **50:1** (579 reads/s versus 11.6 writes/s on average).

What this means for the design:

- **Cache aggressively.** Feed results and hot metadata go in an in-memory cache, and image bytes go through a CDN, so most reads never reach the database.
- **Add read replicas.** Reads that miss the cache are served by replicas, keeping the primary free for writes.
- **Optimize the read path.** Feeds should be cheap to assemble (indexed queries or precomputed feeds) and thumbnails small, since they are what users see most.
- **Accept slightly stale reads.** Because writes are rare, serving a feed that is a few seconds old is a good price for speed.
- **Keep the write path simple and asynchronous.** Writes are few (58/s at peak), so one primary database is enough for now. Slow work like thumbnailing is pushed to a queue.

A note on bytes: by request count the system is read-heavy, but by **storage volume** it is write-heavy (about 0.75 PB of new data per year). That is why file storage must be a separately scalable system.

---

## 4. Why Photos Should Not Live in the Database

Photos should not be stored as blobs inside the database, because:

1. **Size.** About 748 TB per year would dwarf the roughly 180 GB of metadata, making backups, restores, and replication painfully slow and expensive.
2. **Cost.** Database storage and IOPS are far more expensive per GB than object storage.
3. **Performance.** Large blobs evict useful rows from memory and crowd out the small, frequent metadata queries that the app depends on.
4. **Replication lag.** Every replica would have to copy every photo byte, slowing the whole cluster.
5. **Delivery.** Databases cannot push bytes to users through a CDN; serving images through the app and database wastes their capacity.

**Where they go instead:** **object storage** (such as Amazon S3, Google Cloud Storage, or MinIO). It is built for huge, cheap, durable, write-once files, scales almost without limit, and integrates directly with a CDN. The database keeps only a pointer, for example:

```
photos(photo_id, owner_id, object_key, thumb_key, caption, created_at)
```

---

## 5. Architecture Diagram

```
                              +-----------+
                              |   Users   |
                              | (mobile / |
                              |   web)    |
                              +-----+-----+
                                    |
                 images (GET)       |        API calls (feed, upload request)
              +---------------------+---------------------+
              |                                           |
              v                                           v
        +-----------+                             +---------------+
        |    CDN    |                             | Load Balancer |
        | (edge     |                             +-------+-------+
        |  cache)   |                                     |
        +-----+-----+                      +--------------+--------------+
              |                            |              |              |
        cache miss                         v              v              v
              |                      +-----------+  +-----------+  +-----------+
              |                      | App       |  | App       |  | App       |
              |                      | Server 1  |  | Server 2  |  | Server N  |
              |                      +--+--+--+--+  +-----------+  +-----------+
              |                         |  |  |      (stateless, identical)
              |            +------------+  |  +--------------------+
              |            |               |                       |
              |            v               v                       v
              |     +-------------+  +------------------+   +--------------+
              |     |    Cache    |  |  Primary DB      |   |    Queue     |
              |     |   (Redis)   |  | (metadata only)  |   | (e.g. SQS /  |
              |     +-------------+  +--------+---------+   |  RabbitMQ)   |
              |      feed + metadata          |             +------+-------+
              |                               | replication        |
              |                               v                    v
              |                      +------------------+   +--------------+
              |                      |   Read Replica   |   | Thumbnail    |
              |                      | (feed/meta reads)|   | Worker(s)    |
              |                      +------------------+   +------+-------+
              |                                                    |
              |                                                    | read original,
              |                                                    | write 50 KB thumb
              v                                                    v
        +--------------------------------------------------------------+
        |                    Object Storage (S3-like)                  |
        |        originals/   (2 MB each)    thumbs/   (50 KB each)    |
        +--------------------------------------------------------------+
              ^
              |  direct upload with a pre-signed URL (bypasses app servers)
              |
        (Users upload the original file straight to object storage)
```

**Read path:** Users -> Load Balancer -> App Server -> Cache -> (miss) Read Replica; image bytes come from the CDN, which pulls from object storage on a miss.
**Write path:** Users -> App Server -> Primary DB (metadata) + Queue; the file itself goes Users -> Object Storage.

---

## 6. Components in One Sentence Each

| Component | The problem it solves |
|---|---|
| **CDN** | Delivers popular photos from servers near the user, cutting latency and keeping most image traffic off our origin servers. |
| **Load Balancer** | Spreads incoming requests across many app servers and routes around unhealthy ones, so no single server is a bottleneck or a single point of failure. |
| **App Servers** | Run the stateless business logic (auth, feed assembly, upload coordination) and can be added or removed freely to match traffic. |
| **Cache (Redis)** | Keeps hot feeds and metadata in memory so repeated reads are answered in microseconds without touching the database. |
| **Primary Database** | Durably stores the metadata (users, follows, photo records) with consistency, and takes all writes. |
| **Read Replica** | Serves read queries from a copy of the primary, multiplying read capacity and protecting the primary from the 50:1 read load. |
| **Object Storage** | Stores the huge volume of photo files cheaply and durably (hundreds of TB per year), which a database cannot do economically. |
| **Queue** | Decouples the upload request from slow follow-up work, absorbs traffic spikes, and lets jobs be retried if something fails. |
| **Thumbnail Worker** | Processes queued jobs in the background to create 50 KB thumbnails, so feeds load fast without slowing the upload response. |

---

## 7. Upload Flow, Step by Step

1. **User picks a photo** in the app and taps upload; the client sends an "upload request" (file type, size, caption) to the API through the **load balancer**.
2. **An app server authenticates** the user, validates the request (type, max size, rate limit), and generates a unique `photo_id` and `object_key`.
3. **The app server creates a pre-signed URL** for object storage that allows a single, time-limited upload to that key, and inserts a metadata row into the **primary DB** with `status = PENDING`.
4. **The app server returns** the `photo_id` and the pre-signed URL to the client.
5. **The client uploads the 2 MB file directly to object storage** using the URL, so photo bytes never pass through the app servers.
6. **Object storage confirms** the upload, either by an event notification or by the client calling a "complete" endpoint, which the app server verifies.
7. **The app server enqueues a thumbnail job** (`photo_id`, `object_key`) on the **queue** and sets the row to `status = PROCESSING`.
8. **The app server responds "success"** to the client right away; the user does not wait for thumbnailing.
9. **A thumbnail worker pulls the job**, downloads the original from object storage, generates a 50 KB thumbnail, and writes it to `thumbs/` in object storage.
10. **The worker updates the DB row** with `thumb_key` and `status = READY`, then acknowledges the job so it leaves the queue. If the worker crashes, the job is not acknowledged and is retried; repeated failures go to a dead-letter queue.
11. **Cache handling:** the new photo is added to (or invalidates) the relevant followers' cached feeds, and the CDN will cache the thumbnail the first time it is requested.
12. **Followers see the photo** the next time they load their feed, which shows the thumbnail via the CDN and loads the full 2 MB original only when tapped.

---

## 8. Trade-offs

1. **Caching and replicas versus freshness (consistency).**
   Cache and read replicas make reads fast and cheap, but a new photo may take seconds to appear because the cache is stale or the replica lags behind the primary. We accept this because feeds do not need to be perfectly real-time, and we can mitigate it with short TTLs, invalidating the uploader's own feed, and reading the uploader's own photos from the primary ("read your own writes").

2. **Asynchronous thumbnails versus immediate availability.**
   Using a queue keeps uploads fast and smooths spikes, but a photo has no thumbnail for a short time (typically seconds). The feed must handle this by hiding `PROCESSING` photos or showing a placeholder, and the system gains extra moving parts (queue, workers, retries, dead-letter handling) to operate.

3. **Direct-to-object-storage upload versus simplicity and control.**
   Pre-signed URLs remove 23 MB/s average (116 MB/s peak) of upload traffic from the app servers, but make the flow more complex (two-step upload, orphaned files if a client never finishes, validation happening after the upload). Proxying uploads through the app servers would be simpler, but far more costly to scale.

4. **Computing feeds on read versus precomputing on write (fan-out).**
   Computing the feed when the user opens it (query followed users' latest photos) is simple and cheap on writes, but slower per read. Precomputing each follower's feed at upload time makes reads very fast, but one upload by a user with a million followers triggers a million writes. Since SnapShare is read-heavy, a hybrid works best: precompute for normal users and compute on read for very popular accounts.

5. **CDN cost versus performance.**
   At about 290 MB/s average image egress, the CDN is a large recurring cost, but without it origin bandwidth and latency would be worse and more expensive. Longer CDN cache lifetimes lower cost but make deleting or replacing a photo slower to take effect.

6. **Single primary database versus write scaling.**
   At 58 writes/s peak, one primary is sufficient and keeps the data model simple, but it is a single point of failure (mitigated with a standby for failover) and will eventually need sharding (for example by user ID) as the user base grows, which adds significant complexity.

---

## Summary

| Question | Answer |
|---|---|
| Daily active users | 1,000,000 |
| Uploads per second | ~11.6 avg, ~58 peak |
| Feed views per second | ~579 avg, ~2,900 peak |
| Photo storage per year | ~748 TB (about 0.75 PB) |
| Read- or write-heavy? | Read-heavy (about 50:1) |
| Where do photos live? | Object storage, with a CDN in front |
| What does the database hold? | Metadata and pointers only |
