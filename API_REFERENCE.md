# Backend API Reference

Base URL:

```text
http://localhost:5000
```

Most application endpoints live under `/api`. Some public landing-page workflows are mounted directly by their route files but still use `/api/...` paths.

Authentication:

```http
Authorization: Bearer <token>
```

## Core

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | API running message |
| GET | `/api/health` | Health, environment, MongoDB status |
| GET | `/api/_routes` | Debug route list when `DEBUG_ROUTES=1` |

## Authentication

Mounted at `/api/auth` and `/auth`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password/:token` | Reset password |
| GET | `/api/auth/google/config` | Google SSO config |
| GET | `/api/auth/google` | Start Google SSO |
| GET | `/api/auth/google/callback` | Complete Google SSO |
| POST | `/api/auth/sso/initiate` | Start generic SSO |
| GET | `/api/auth/sso/callback` | Complete generic SSO |

## Users and Team Access

Mounted at `/api/users`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/users/register` | Register user/company |
| GET | `/api/users/activate/:token` | Activate account |
| POST | `/api/users/complete-activation` | Complete activation |
| POST | `/api/users/resend-activation` | Resend activation email |
| POST | `/api/users/admin/activate` | Admin activates a user |
| GET | `/api/users/public-request-link/:companySlug` | Public request context |
| GET | `/api/users` | List users |
| GET | `/api/users/clients-requestors` | List clients and requestors |
| POST | `/api/users/invite` | Invite user |
| GET | `/api/users/invite/:token` | Read invite |
| POST | `/api/users/accept-invite` | Accept invite |
| GET | `/api/users/invites` | List invites |
| DELETE | `/api/users/invites/:id` | Delete invite |
| PATCH | `/api/users/company/manage` | Manage company |
| PATCH | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

## Work Orders and Issues

Mounted at `/api/issues`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/issues` | List issues by role/context |
| POST | `/api/issues` | Create issue/request |
| GET | `/api/issues/:id` | Get issue |
| PUT | `/api/issues/:id` | Update issue |
| DELETE | `/api/issues/:id` | Delete issue |
| POST | `/api/issues/:id/assign` | Assign external technician |
| POST | `/api/issues/:id/assign-internal` | Assign internal technician |
| POST | `/api/issues/:id/approve` | Approve issue |
| POST | `/api/issues/:id/decline` | Decline issue |
| POST | `/api/issues/:id/resubmit` | Resubmit issue |
| POST | `/api/issues/:id/evidence/before` | Upload before evidence |
| POST | `/api/issues/:id/evidence/after` | Upload after evidence |
| GET/POST | `/api/issues/:id/files` | List/add files |
| GET/POST | `/api/issues/:id/activity` | List/add activity |
| GET/POST | `/api/issues/:id/costs` | List/add costs |
| GET/POST | `/api/issues/:id/parts` | List/add parts |
| POST | `/api/issues/:id/parts/reconcile` | Reconcile parts |
| GET/POST | `/api/issues/:id/labor` | List/add labor |
| GET/POST/DELETE | `/api/issues/:id/links` | Manage issue links |
| GET/PUT | `/api/issues/:id/provider-portal` | Provider portal settings |

## Properties and Assets

| Base Path | Description |
| --- | --- |
| `/api/properties` | Property CRUD and photo uploads |
| `/api/assets` | Asset CRUD, movement, spare parts, downtime |
| `/api/internal-technicians` | Internal technician CRUD |
| `/api/technicians` | External technician CRUD, invites, assignment list |
| `/api/maintenance-templates` | Maintenance template CRUD |

Common asset endpoints:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/assets/count` | Count assets |
| GET/POST | `/api/assets` | List/create assets |
| GET/PUT/DELETE | `/api/assets/:id` | Read/update/delete asset |
| PATCH | `/api/assets/:id/status` | Update status |
| POST | `/api/assets/:id/move` | Move asset |
| GET | `/api/assets/:id/movements` | Movement history |
| GET/POST | `/api/assets/:id/spare-parts` | List/add spare parts |
| GET/POST | `/api/assets/:id/downtime` | List/add downtime |

## Preventive Maintenance

Mounted at `/api/maintenance-schedules`.

| Method | Path | Description |
| --- | --- | --- |
| GET/POST | `/api/maintenance-schedules` | List/create PM schedules |
| GET/PUT/DELETE | `/api/maintenance-schedules/:id` | Read/update/delete schedule |
| GET | `/api/maintenance-schedules/technician/:id` | Schedules for technician |
| POST | `/api/maintenance-schedules/:id/dismiss` | Dismiss reminder |
| POST | `/api/maintenance-schedules/:id/snooze` | Snooze reminder |
| POST | `/api/maintenance-schedules/:id/emailReminder` | Send email reminder |
| GET | `/api/maintenance-schedules/:id/reminder-logs` | Reminder logs |
| POST | `/api/maintenance-schedules/:id/generate-instances` | Generate PM instances |
| GET | `/api/maintenance-schedules/:id/instances` | List PM instances |
| POST | `/api/maintenance-schedules/auto-gen/trigger` | Manually trigger PM generation |

## Inventory and Purchasing

| Base Path | Description |
| --- | --- |
| `/api/parts` | Parts list, bulk import, quantity adjustment, sets |
| `/api/inventory-sets` | Inventory set CRUD and part membership |
| `/api/cycle-counts` | Cycle count CRUD |
| `/api/vendors` | Vendor CRUD and bulk import |
| `/api/material-requests` | Material request lifecycle |
| `/api/purchase-orders` | Purchase order CRUD |

Public purchase order endpoints:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/purchase-orders/public/:token` | Read public PO |
| POST | `/api/purchase-orders/public/:token/respond` | Public PO response |

## Subscriptions and Payments

Subscriptions are mounted at `/api/subscriptions`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/subscriptions` | Create subscription |
| GET | `/api/subscriptions/public/pricing` | Public pricing |
| GET | `/api/subscriptions/trial/status` | Trial status |
| POST | `/api/subscriptions/trial/initialize` | Start free trial |
| POST | `/api/subscriptions/trial/upgrade-to-paid` | Upgrade trial |
| GET | `/api/subscriptions/trial/can-access` | Feature access check |
| GET | `/api/subscriptions/status` | Company subscription status |
| GET | `/api/subscriptions/analytics/summary` | Subscription analytics |
| GET/PUT/DELETE | `/api/subscriptions/:id` | Subscription detail/update/delete |
| POST | `/api/subscriptions/:id/upgrade` | Upgrade plan |
| POST | `/api/subscriptions/:id/cancel` | Cancel subscription |

Payment routes are defined in `src/modules/subscription/payment.routes.js`. If mounted in your environment, they provide public pricing, PesaPal, Paypack, MTN mobile money, IntouchPay, status checks, deposits, refunds, and payment listing.

## Communication, Reports, and Settings

| Base Path | Description |
| --- | --- |
| `/api/email` | Test emails and invoice emails |
| `/api/notifications` | User notifications and direct messages |
| `/api/private-notes` | Current user's private notes |
| `/api/reports` | Daily report trigger/status |
| `/api/audit-logs` | Audit log search and security action |
| `/api/system-settings` | Global system settings |
| `/api/request-settings` | Request portal, workflow, tags, statuses, fields, and module settings |
| `/api/analytics-preferences` | Analytics preferences |

## AI

Mounted at `/api/ai`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/ai/generate-checklist` | Generate checklist |
| POST | `/api/ai/predict-maintenance/:assetId` | Predict maintenance |
| POST | `/api/ai/triage-issue` | Triage issue |
| GET | `/api/ai/maintenance-summary` | Maintenance summary |
| GET | `/api/ai/sentiment-summary` | Sentiment summary |
| GET | `/api/ai/dashboard-recommendations` | Dashboard recommendations |
| POST | `/api/ai/chat` | AI chat |

## Public and Marketing Workflows

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/demo-requests` | Create demo request |
| GET | `/api/demo-requests` | List demo requests |
| PATCH | `/api/demo-requests/:id/status` | Update demo request status |
| POST | `/api/contact-messages` | Create contact message |
| GET | `/api/contact-messages/conversations` | List conversations |
| GET | `/api/contact-messages/:sessionId` | Get conversation messages |
| POST | `/api/contact-messages/:sessionId/reply` | Reply to conversation |
| DELETE | `/api/contact-messages/:sessionId` | Delete conversation |
| PATCH | `/api/contact-messages/:sessionId/close` | Close conversation |
| POST | `/api/quote-requests` | Create quote request |
| GET | `/api/quote-requests` | List quote requests |
| PATCH | `/api/quote-requests/:id/status` | Update quote request status |

