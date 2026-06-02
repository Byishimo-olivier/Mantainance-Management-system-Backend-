# FixNest Backend

Express API for the FixNest Maintenance Management System.

## What This Service Does

The backend provides APIs for authentication, users, properties, assets, issues, maintenance schedules, subscriptions, payments, inventory, purchase orders, reports, notifications, and public request workflows. It also starts background services for reminders, preventive maintenance generation, daily reports, monthly reports, and superadmin bootstrapping.

## Stack

- Node.js 18+
- Express
- MongoDB
- Prisma Client with MongoDB provider
- Mongoose
- JWT authentication
- Multer uploads
- Nodemailer email
- Twilio SMS
- node-cron schedulers
- Anthropic and Google Gemini AI integrations

## Project Structure

```text
src/
  index.js                         Express app entry point and route mounting
  bootstrap/superadmin.js          Ensures the configured superadmin exists
  middleware/                      Auth, audit, upload, trial middleware
  modules/
    auth/                          Login, password reset, Google/SSO auth
    user/                          Registration, activation, invites, team users
    property/, asset/              Properties, assets, movement, spare parts
    issue/                         Work orders/issues, assignment, evidence
    maintenanceSchedule/           PM schedules, recurrence, reminders, generation
    subscription/                  Plans, trials, payment integrations
    part/, inventorySet/, vendor/  Inventory and vendors
    purchaseOrder/                 Purchase order workflows and public responses
    reports/, report/              Daily and monthly report services
    ai/                            AI checklist, triage, summaries, chat
    requestSettings/               Portal and workflow configuration
prisma/
  schema.prisma                    Main MongoDB schema
scripts/                           Data repair, seed, diagnostic, and scheduler scripts
uploads/                           Runtime uploads, served from /uploads
```

## Setup

```powershell
npm install
npm run build
npm run dev
```

Production:

```powershell
npm start
```

Useful scripts:

- `npm run dev`: start with nodemon.
- `npm run start`: start with Node.
- `npm run build`: generate Prisma client.
- `npm run prisma`: run Prisma CLI.
- `npm run seed:properties`: seed sample properties.
- `npm run send:monthly-reports`: manually run monthly report sending.
- `npm run setup:mtn-collection`: configure MTN collection integration.
- `npm run test:openai`: run a quick OpenAI Responses API smoke test.
- `npm run patch-data` / `npm run repair-data`: legacy data repair helpers.

## Environment Variables

Minimum local `.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=mongodb+srv://...
JWT_SECRET=change-me
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
```

Common optional variables:

```env
# Superadmin bootstrap
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=change-me
SUPERADMIN_NAME=Super Admin
SUPERADMIN_ROTATE_PASSWORD=false
BCRYPT_SALT_ROUNDS=10

# Email / SMTP
EMAIL_SERVICE=cpanel
EMAIL_USER=info@your-domain.com
SMTP_AUTH_USER=info@your-domain.com
EMAIL_PASS=your-cpanel-mailbox-password
EMAIL_PASSWORD=your-cpanel-mailbox-password
EMAIL_FROM_NAME=FixNest
SMTP_HOST=mail.your-domain.com
SMTP_PORT=465
SMTP_SECURE=true
SKIP_MAIL_VERIFY=false
RESET_PASSWORD_URL=http://localhost:5173/reset-password
TEAM_EMAIL=team@example.com
DEMO_REQUEST_RECIPIENTS=team@example.com,sales@example.com

# AI
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...

# Google / generic SSO
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
GOOGLE_SSO_ALLOWED_DOMAINS=example.com
GOOGLE_SSO_DEFAULT_COMPANY_NAME=Example Company
GOOGLE_SSO_DEFAULT_ROLE=client
GOOGLE_SCOPE=openid email profile
GOOGLE_PROMPT=select_account
GOOGLE_ACCESS_TYPE=offline
GOOGLE_HOSTED_DOMAIN=example.com
SSO_PROVIDER_NAME=SSO
SSO_AUTHORIZATION_URL=...
SSO_TOKEN_URL=...
SSO_USERINFO_URL=...
SSO_CLIENT_ID=...
SSO_CLIENT_SECRET=...
SSO_REDIRECT_URI=...
SSO_SCOPE=openid email profile
SSO_DOMAIN=example.com
SSO_COMPANY_ID=...

# SMS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
TWILIO_DEFAULT_COUNTRY_CODE=+250

# Reports
ENABLE_MONTHLY_REPORT_SCHEDULER=true
MONTHLY_REPORT_SCHEDULER_HOURS=24

# Payments
PESAPAL_ENV=sandbox
PESAPAL_CALLBACK_URL=http://localhost:5000/api/payments/pesapal-status
BACKEND_PUBLIC_URL=https://api.example.com
PUBLIC_BACKEND_URL=https://api.example.com
MTN_COLLECTION_BASE_URL=...
MTN_COLLECTION_TOKEN=...
MTN_API_USER=...
MTN_API_KEY=...
MTN_SUBSCRIPTION_KEY=...
MTN_TARGET_ENVIRONMENT=sandbox
MTN_CALLBACK_URL=...
INTOUCHPAY_BASE_URL=...
INTOUCHPAY_USERNAME=...
INTOUCHPAY_ACCOUNT_NO=...
INTOUCHPAY_PARTNER_PASSWORD=...
INTOUCHPAY_CALLBACK_URL=...
SUBSCRIPTION_CLIENT_ID=...
SUBSCRIPTION_SECRET_ID=...
```

The AI chat module uses the OpenAI Responses API when `OPENAI_API_KEY` is present. This follows the official OpenAI quickstart shape: create an OpenAI client, call `client.responses.create(...)`, and read `response.output_text`.

## App Startup Behavior

On startup the app:

1. Loads `.env`.
2. Configures CORS for local, configured frontend, Vercel, and `.rw` origins.
3. Connects to MongoDB using `DATABASE_URL`.
4. Repairs selected user and technician indexes for multi-company support.
5. Starts monthly reports, maintenance reminders, PM auto-generation, and daily report scheduling.
6. Ensures the configured superadmin exists.
7. Loads system pricing into the payment service.

## Health and Debugging

- `GET /`: returns a basic API running message.
- `GET /api/health`: returns environment, MongoDB connection status, and timestamp.
- Set `DEBUG_ROUTES=1` to enable `GET /api/_routes` temporarily.

## Database

The Prisma schema is at `prisma/schema.prisma` and uses MongoDB. Major models include:

- `Company`, `User`, `Subscription`, `Payment`, `Invoice`
- `Property`, `Asset`, `AssetMovementLog`, `SparePart`
- `Issue`, `MaintenanceSchedule`, `MaintenanceReminderLog`
- `Technician`, `InternalTechnician`, `TechnicianInvite`
- `Material`, `MaterialRequest`, `Procurement`
- `Feedback`, `Manager`, `Notification`

Several modules also define Mongoose models beside their controllers and routes.

## Authentication and Roles

JWT tokens are sent with:

```http
Authorization: Bearer <token>
```

Known role values in the code include:

- `superadmin` / `super-admin`
- `admin`
- `manager`
- `client`
- `technician`
- `internal`
- `requestor`

Access control is implemented with `authenticate`, `optionalAuthenticate`, and `authorizeRoles` middleware.

## Uploads

Uploaded files are stored under `uploads/` and served from:

```text
/uploads/<filename>
```

Large JSON and form bodies are accepted up to `25mb`.

## Related Docs

- [API Reference](./API_REFERENCE.md)
- [Email Service Documentation](./EMAIL_SERVICE_README.md)
- [Daily Report Implementation](./DAILY_REPORT_IMPLEMENTATION.md)
- [PesaPal Testing Guide](./PESAPAL_TESTING_GUIDE.md)
