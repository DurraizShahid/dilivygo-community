# Chat system (orders + support)

## Conversation types (`conversations.type`)

| Type | Participants | Purpose |
|------|----------------|--------|
| `customer_vendor` | Customer + vendor staff (`resolveVendorStaffUserIdForOrder`) | Restaurant ↔ customer for an order. Assigned rider may also read/send (extended access in `callerCanAccessConversationAsync`). |
| `customer_rider` | Customer + assigned delivery rider | Direct customer ↔ rider messaging for an order. |
| `vendor_rider` | Vendor staff + assigned rider | Restaurant coordination with the rider (not for customer-to-rider). |
| `customer_support` | Customer + platform sentinel (`participant_2_id`); superadmin replies | SaaS / superadmin support inbox. |

### Support tenancy (organization scope)

1. **Customer web → `POST /api/chat/support-tickets`**  
   `createSupportTicket` sets `conversations.organization_id` from, in order: `req.organizationId` (org marketplace host from `attachProjectRef` / `resolveHostScope`), then `req.customer.organizationId` / `organization_id` from the session, then **`customers.organization_id` merged onto `req.customer` in `attachProjectRef`** after `customerModel.findById`.  
   **Marketplace customers** (`req.customer.isMarketplaceCustomer`) **must** resolve an organization id; otherwise the API returns **400** so SaaS never receives unscoped tickets.

2. **SaaS dashboard → `/api/saas/sa/support/*`**  
   `pinSaasOrganizationId` overwrites `req.query.organizationId` with the Clerk member’s org (client cannot pick another org). `GET …/support/conversations` calls `findAllSupport({ organizationId })` so only that org’s rows are returned. Per-thread routes use **`requireSaasOrgOwns({ table: 'conversations' })`** so UUID guessing cannot cross tenants.

3. **Platform superadmin → `/api/superadmin/support/*`**  
   Unscoped or query-filtered lists for operators; not org-pinned.

4. **Customer read/write on existing threads**  
   For `customer_support`, `conversationTenantMismatch` returns **true** when the customer’s resolved org id and the conversation’s `organization_id` are both set and differ, blocking cross-org access even if ids were misaligned.

## REST (`/api/chat`)

- `POST /conversations` — body `{ orderId, type }` with `type` in `customer_vendor` \| `vendor_rider` \| `customer_rider`.
- `POST /support-tickets` — customer-only; creates `customer_support`.
- Messages: `GET/POST /conversations/:id/messages`, `PATCH /conversations/:id/read`.
- Support-only: `PATCH .../support-status`, `GET/PUT .../support-rating`.

## WebSocket (`/ws`)

- Order chats: `chat:message`, `chat:read` broadcast to the conversation’s `project_ref` bucket.
- Support: same payloads via `broadcastSupportChat` (workspace + `__platform__`).
- `chat:typing` is handled by `lib/chat-typing-relay.js`, which loads the conversation, checks `lib/chat-ws-access.js` (`wsIdentityMayRelayTyping`: participant, extended rider on `customer_vendor` / `vendor_rider` / `customer_rider`, or superadmin on support), then broadcasts to the workspace or support fan-out.
- `chat:support_status` — support ticket closed/reopened.

## Frontend sharing

- `@dilivygo/chat` — `createOrderChatHooks(api)` for `useConversations` / `useMessages` (TanStack Query + sorted history); `usePeerTypingIndicator` / `useThrottledTypingEmit(ws)` for typing UX (staff/rider order threads).
- `@dilivygo/ui` — `supportInboxThreadRows` (SaaS/superadmin support inbox); `OrderChatShell`, `OrderChatMessageList`, `ChatComposer`, `ChatPeerTypingBar`, `ChatMessageBubble` (read receipts when `readAt` is set on DTOs) for vendor + rider order chat pages.

## Migrations

- `085_conversation_type_customer_rider.sql` — adds `customer_rider` to the type check and re-tags legacy customer+rider rows that were stored as `vendor_rider`.
