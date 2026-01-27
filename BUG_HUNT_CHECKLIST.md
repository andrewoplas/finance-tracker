# Bug Hunt Checklist - Finance Tracker

**Date:** Jan 27, 2026  
**Purpose:** Comprehensive testing before Andrew returns

---

## ✅ Pages to Test

### Authentication
- [ ] Login page loads
- [ ] Register page loads
- [ ] Can sign up new user
- [ ] Can login existing user
- [ ] Redirects to dashboard after login
- [ ] Shows error for wrong password
- [ ] Email validation works

### Dashboard
- [ ] Loads without errors
- [ ] Greeting shows correct name
- [ ] Stat cards display correct numbers
- [ ] Recent transactions list works
- [ ] FAB button visible and clickable
- [ ] Quick add dialog opens
- [ ] All links work

### Transactions
- [ ] Page loads
- [ ] List displays transactions
- [ ] Filters work (type, account, category)
- [ ] Search works
- [ ] Date filters work
- [ ] Can add new transaction
- [ ] Can delete transaction
- [ ] Empty state shows when no transactions
- [ ] Pagination/limit works (500 items)

### Accounts
- [ ] Page loads
- [ ] Account cards display
- [ ] Can add new account
- [ ] Can edit account
- [ ] Can archive account
- [ ] Can delete account
- [ ] Total balance calculates correctly
- [ ] Archived accounts show separately

### Wallets
- [ ] Page loads
- [ ] Wallet cards display
- [ ] Circular progress shows correctly
- [ ] Can add new wallet
- [ ] Can adjust wallet balance (add/remove)
- [ ] Can delete wallet
- [ ] Target percentage works
- [ ] Empty state shows when no wallets

### Recurring Transactions
- [ ] Page loads
- [ ] Can add recurring transaction
- [ ] Can edit recurring transaction
- [ ] Can delete recurring transaction
- [ ] Frequency options work

### Budgets
- [ ] Page loads
- [ ] Can add budget
- [ ] Can edit budget
- [ ] Can delete budget
- [ ] Budget tracking works

### Reports
- [ ] Page loads
- [ ] Charts render (if any)
- [ ] Data shows correctly
- [ ] Date range selection works

### Settings
- [ ] Page loads
- [ ] Profile settings work
- [ ] Category management works
- [ ] Can add custom category
- [ ] Can edit category
- [ ] Can delete category (if unused)

---

## 🎨 UI/UX Tests

### General
- [ ] All buttons have hover states
- [ ] All cards have proper shadows
- [ ] Colors match design system
- [ ] Typography is consistent
- [ ] Spacing feels right
- [ ] Loading states show properly
- [ ] Error states display correctly
- [ ] Empty states are friendly

### Navigation
- [ ] Sidebar highlights active page
- [ ] Sidebar links work
- [ ] Mobile menu opens/closes
- [ ] Mobile menu highlights active
- [ ] Logo clickable (goes to dashboard)

### Forms
- [ ] All inputs have labels
- [ ] Validation messages show
- [ ] Required fields marked
- [ ] Can submit with Enter key
- [ ] Focus states visible
- [ ] Placeholder text helpful

### Modals/Dialogs
- [ ] Open smoothly
- [ ] Close with X button
- [ ] Close with Escape key
- [ ] Close clicking outside (if appropriate)
- [ ] Don't close when clicking inside
- [ ] Backdrop visible
- [ ] Content scrollable if needed

---

## 📱 Mobile Tests (Responsive)

### Breakpoints
- [ ] Mobile (< 640px) works
- [ ] Tablet (640-1024px) works
- [ ] Desktop (> 1024px) works

### Mobile-Specific
- [ ] Header shows properly
- [ ] Mobile menu accessible
- [ ] FAB positioned correctly (bottom-20)
- [ ] FAB clickable (not clipped)
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll
- [ ] Cards stack properly
- [ ] Tables/lists scroll horizontally if needed

### Touch Interactions
- [ ] Buttons respond to tap
- [ ] No double-tap zoom on buttons
- [ ] Swipe actions work (if any)
- [ ] Scrolling smooth

---

## 🤖 AI Transaction Input Tests

### Basic Functionality
- [ ] Dialog opens from FAB
- [ ] Dialog opens from "Smart Add" button
- [ ] Text input accepts text
- [ ] Parse button works
- [ ] Shows loading state while parsing
- [ ] Returns parsed data
- [ ] Form fields populate correctly

### Single Transaction
- [ ] Can parse simple expense ("250 on Jollibee")
- [ ] Can parse income ("Received 5000 salary")
- [ ] Can parse transfer ("Moved 1000 to savings")
- [ ] Category auto-detected
- [ ] Amount extracted correctly
- [ ] Date defaults to today
- [ ] Can edit all fields
- [ ] Can save transaction

### Multiple Transactions
- [ ] Detects multiple amounts
- [ ] Shows "1 of 3" indicator
- [ ] Next button works
- [ ] Back button works
- [ ] Summary page shows all
- [ ] Can edit any transaction from summary
- [ ] Saves all correctly

### Error Handling
- [ ] Shows error if API key missing
- [ ] Shows error if text too short
- [ ] Shows error if parse fails
- [ ] Low confidence warning shows
- [ ] Can retry after error
- [ ] Validation errors display

### Edge Cases
- [ ] Empty input handled
- [ ] Very long input handled
- [ ] Special characters handled
- [ ] Multiple languages (Taglish)
- [ ] Numbers with commas
- [ ] "k" notation (10k = 10000)

---

## 🐛 Known Issues Check

### Radix UI
- [ ] No empty string in Select values ✅ Fixed
- [ ] All SelectItems have valid values

### Supabase
- [ ] FK names explicit in joins ✅ Fixed
- [ ] No ambiguous relationships
- [ ] Auth redirects work

### Next.js
- [ ] Middleware deprecation warning (known, not critical)
- [ ] No build errors
- [ ] No TypeScript errors

---

## 🔍 Console Checks

### Clean Console
- [ ] No errors on page load
- [ ] No errors during navigation
- [ ] No errors during form submission
- [ ] Only our logging (🔵 🟢 🔴 🟡)

### Network
- [ ] No failed requests (check Network tab)
- [ ] API routes return 200
- [ ] No CORS errors
- [ ] Reasonable load times

### Performance
- [ ] No memory leaks (check Performance tab)
- [ ] No infinite loops
- [ ] Images load properly
- [ ] Fonts load

---

## 🔒 Security Checks

### Environment Variables
- [ ] API keys not exposed in client
- [ ] .env.local in .gitignore
- [ ] .env.local.example documented

### Authentication
- [ ] Can't access dashboard when logged out
- [ ] Redirects to login if not authenticated
- [ ] Can logout successfully
- [ ] Session persists on refresh

### Data Access
- [ ] Users only see their own data
- [ ] Can't access other users' transactions
- [ ] RLS policies working (Supabase)

---

## 💾 Data Tests

### CRUD Operations
- [ ] Create works (transactions, accounts, etc.)
- [ ] Read works (lists, details)
- [ ] Update works (edit dialogs)
- [ ] Delete works (with confirmation)

### Data Integrity
- [ ] Balance calculations correct
- [ ] Date sorting works
- [ ] Amounts display properly (₱ symbol)
- [ ] Numbers formatted (commas)
- [ ] Negative numbers show correctly

### Edge Cases
- [ ] Large amounts (millions)
- [ ] Zero amounts
- [ ] Negative amounts
- [ ] Very old dates
- [ ] Future dates
- [ ] Same date, multiple transactions

---

## 🎭 Accessibility

### Keyboard Navigation
- [ ] Can tab through forms
- [ ] Enter submits forms
- [ ] Escape closes dialogs
- [ ] Focus visible on all interactive elements

### Screen Readers
- [ ] Buttons have aria-labels (especially icon-only)
- [ ] Images have alt text
- [ ] Form fields have labels
- [ ] Error messages announced

### Color Contrast
- [ ] Text readable on all backgrounds
- [ ] Meets WCAG AA standards (4.5:1)
- [ ] Focus indicators visible

---

## 🚀 Performance

### Load Times
- [ ] Initial page load < 3s
- [ ] Navigation instant (client-side)
- [ ] API responses < 1s
- [ ] Images lazy-loaded

### Bundle Size
- [ ] No huge dependencies
- [ ] Tree-shaking working
- [ ] Unused code removed
- [ ] Fonts optimized

---

## 📝 Content & Copy

### Grammar & Spelling
- [ ] No typos in UI
- [ ] Consistent terminology
- [ ] Helpful error messages
- [ ] Friendly empty states

### Internationalization
- [ ] Currency symbol (₱) correct
- [ ] Date format appropriate
- [ ] Number format (commas)
- [ ] Taglish supported in AI

---

## 🔄 State Management

### UI State
- [ ] Loading states show
- [ ] Success states clear
- [ ] Error states dismissible
- [ ] Modal state preserved

### Data State
- [ ] Lists update after create/edit/delete
- [ ] Optimistic updates work
- [ ] Cache invalidation correct
- [ ] No stale data

---

## 🎯 User Flows

### New User Journey
1. [ ] Register → Success
2. [ ] Login → Dashboard
3. [ ] See welcome/empty states
4. [ ] Add first account → Works
5. [ ] Add first transaction → Works
6. [ ] Dashboard updates → Correct

### Typical Usage
1. [ ] Open app → Dashboard
2. [ ] Click FAB → Dialog opens
3. [ ] Type transaction → Parses correctly
4. [ ] Save → List updates
5. [ ] View in transactions page → Shows up

### Power User
1. [ ] Bulk add transactions → Multiple work
2. [ ] Filter transactions → Results correct
3. [ ] Export data → (Not implemented yet)
4. [ ] Manage budgets → Works
5. [ ] View reports → Works

---

## 🧪 Browser Testing

### Browsers to Test
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### Features per Browser
- [ ] All pages render
- [ ] All interactions work
- [ ] Styles correct
- [ ] No browser-specific bugs

---

## 📊 Results

**Tests Passed:** ___/___  
**Tests Failed:** ___/___  
**Issues Found:** ___

### Critical Issues
(none yet)

### Minor Issues
(to be filled during testing)

### Nice-to-Have Improvements
(to be filled during testing)

---

**Status:** 🟡 In Progress  
**Next:** Start systematic testing

---

*This checklist will be updated as testing progresses*
