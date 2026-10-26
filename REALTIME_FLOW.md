# Real-Time Role Interaction — Restaurant POS

## Socket.IO Room Architecture

Every authenticated socket joins rooms based on its server-verified role and restaurant:

| Room | Joined by | Purpose |
|---|---|---|
| `restaurant:{restaurantId}` | All staff | Restaurant-wide broadcasts (table status, menu availability) |
| `biller-{restaurantId}` | ADMIN, BILLER | Billing events (new orders, payments, closures) |
| `kitchen-{restaurantId}` | ADMIN, KITCHEN, WAITER | Kitchen order events |
| `role:{role}:{restaurantId}` | Role members | Role-targeted notifications |
| `user:{userId}` | Individual | Personal notifications |
| `table:{tableId}` | Subscribers | Table-specific updates |

Room membership is derived **server-side** from the verified session — the frontend never supplies a role or restaurant ID.

## Event Contract

### Order lifecycle
| Event | Emitted by | Received by | Payload |
|---|---|---|---|
| `order:created` | Backend (after POST /api/orders) | Biller, Kitchen | `{ order, bill }` |
| `order:submitted` | Backend | Biller, Kitchen | `{ orderId, tableSessionId }` |
| `order:status-changed` | Backend (PATCH status) | All | `{ orderId, status }` |
| `order:item-cancelled` | Backend | All | `{ orderId, itemId }` |
| `kitchen:order-received` | Backend | Kitchen | `{ order }` |
| `kitchen:status-changed` | Backend | Waiter, Biller | `{ orderId, status }` |
| `kitchen:order-ready` | Backend | Waiter | `{ orderId }` |

### Table / session lifecycle
| Event | Emitted by | Received by | Payload |
|---|---|---|---|
| `table-session:opened` | Backend | All | `{ sessionId, tableId }` |
| `table-session:closed` | Backend | All | `{ sessionId, tableId }` |
| `session:closed` | Backend | All | `{ sessionId }` |
| `table:updated` | Backend | All | `{ tableId, status }` |
| `table:updated` (status AVAILABLE) | Backend on bill close | Waiter (grid turns green) | `{ tableId, status }` |

### Billing
| Event | Emitted by | Received by | Payload |
|---|---|---|---|
| `bill:updated` | Backend | Biller | `{ billId, tableSessionId }` |
| `bill:payment-recorded` | Backend | Biller | `{ billId, paymentId }` |
| `bill:paid` / `bill:closed` | Backend | All | `{ billId, tableSessionId }` |
| `receipt:issued` | Backend | Biller | `{ receiptNumber }` |

### Menu
| Event | Emitted by | Received by | Payload |
|---|---|---|---|
| `menu:item-availability-updated` | Backend | All waiters | `{ itemId, available, soldOut, isAvailable }` |

## End-to-End Real-Time Scenario

1. **Waiter A** logs in → socket joins `restaurant:R`, `kitchen-R`, `role:WAITER:R`.
2. **Biller** logs in → socket joins `restaurant:R`, `biller-R`, `role:BILLER:R`.
3. **Kitchen** logs in → socket joins `restaurant:R`, `kitchen-R`, `role:KITCHEN:R`.
4. Waiter selects Table 05 (AVAILABLE) → `POST /api/table-sessions` → backend creates `TableSession`, sets table → OCCUPIED → emits `table-session:opened` + `table:updated`. **Biller and Admin dashboards instantly show Table 05 occupied.**
5. Waiter submits Chicken Momo ×2 + Coke ×2 → `POST /api/orders` → backend saves `Order` + `OrderItem` snapshots, recalculates `Bill` → emits `order:created` to `biller-R` and `kitchen-R`. **Biller sees new items + running total (Rs. 542.40) without refresh; Kitchen sees the order appear.**
6. Waiter adds Chowmein later → new `Order` batch → same events → **Biller total updates to Rs. 711.90; Kitchen sees a separate batch card.**
7. Kitchen marks READY → emits `kitchen:status-changed` + `kitchen:order-ready` → **Waiter sees "Ready to Serve" badge instantly.**
8. Biller records cash payment → emits `bill:payment-recorded` + `bill:updated` → **Waiter/biller totals update.**
9. Biller clicks "Close Bill" → backend ACID transaction: Bill → PAID, Receipt generated, session closed, table → AVAILABLE → emits `session:closed`, `table:updated` (AVAILABLE). **Waiter's table grid turns green instantly; Admin dashboard counts update.**
10. Admin toggles a menu item to Sold Out → emits `menu:item-availability-updated` → **All waiter pads gray out that item instantly.**

## Reliability Guarantees
- Business data is **persisted to PostgreSQL before any socket emit** (emit happens after transaction commit).
- Socket delivery is a **notification**, not the source of truth — clients re-fetch authoritative data on reconnect.
- Idempotency keys prevent duplicate orders/payments on retry.
- Reconnection triggers TanStack Query invalidation → full state recovery from DB.

## Verification
A programmatic two-session test confirmed: Biller received `order:created` **before** the HTTP response returned (zero perceived delay). All three roles' sockets authenticated via the same HttpOnly session cookie.
