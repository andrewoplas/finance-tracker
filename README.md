> Local overhaul: start with `/demo` for a synthetic, credential-free monthly review workspace. Read [implementation and rollout notes](docs/OVERHAUL.md) before applying migrations or enabling persisted writes. Imports, installment payments, shared collections, and balance reconciliation use reviewed atomic operations after the migrations. No external assistant integration is connected.

# 💰 Finance Tracker

A personal finance management app built with Next.js 14, Supabase, and Tailwind CSS.

## Features

- 📊 **Dashboard** - Overview of your financial health
- 💳 **Multiple Accounts** - Cash, Bank, E-Wallet, Credit Card, Savings, Investment
- 📝 **Transactions** - Track income, expenses, and transfers
- 🏷️ **Categories** - Organize spending with customizable categories
- 📈 **Reports** - Visualize spending by category and monthly trends
- 🎯 **Budgets** - Set and track spending limits by category
- 🔐 **Authentication** - Secure login with Supabase Auth

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **State**: Zustand
- **Charts**: Recharts

## Getting Started

### 1. Clone and Install

```bash
cd finance-tracker
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial_schema.sql` in the SQL Editor
3. Copy your project URL and anon key

### 3. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Account Types

| Type | Icon | Description |
|------|------|-------------|
| Cash | 💵 | Physical cash |
| Bank | 🏦 | Bank accounts |
| E-Wallet | 📱 | GCash, PayMaya, etc. |
| Credit Card | 💳 | Credit cards |
| Savings | 🐷 | Savings accounts |
| Investment | 📈 | Investment accounts |

## Project Structure

```
finance-tracker/
├── app/
│   ├── (auth)/           # Login, Register
│   ├── (dashboard)/      # Main app pages
│   │   ├── page.tsx      # Dashboard
│   │   ├── accounts/     # Accounts management
│   │   ├── transactions/ # Transaction list
│   │   ├── reports/      # Charts & analytics
│   │   ├── budgets/      # Budget tracking
│   │   └── settings/     # User settings
│   └── auth/callback/    # OAuth callback
├── components/
│   ├── ui/               # shadcn components
│   ├── layout/           # Sidebar, etc.
│   ├── dashboard/        # Dashboard widgets
│   ├── accounts/         # Account components
│   ├── transactions/     # Transaction components
│   ├── reports/          # Chart components
│   ├── budgets/          # Budget components
│   └── settings/         # Settings components
├── lib/
│   ├── supabase/         # Supabase clients
│   ├── constants.ts      # App constants
│   ├── store.ts          # Zustand store
│   └── utils.ts          # Utilities
├── types/
│   └── database.ts       # TypeScript types
└── supabase/
    └── migrations/       # SQL migrations
```

## License

MIT
