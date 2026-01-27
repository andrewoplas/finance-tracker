# AI-Powered Transaction Input - Implementation Plan

**Created:** Jan 27, 2026  
**Goal:** Make transaction input effortless with natural language + AI parsing

---

## 🎯 Vision

Transform transaction input from a tedious 5+ field form into a simple conversation:

**Before (Current):**
1. Click "Add Transaction"
2. Select type (3 buttons)
3. Enter amount
4. Select account (dropdown)
5. Select category (dropdown)
6. Enter description
7. Pick date
8. Click submit

**After (AI-Powered):**
1. Click "Add Transaction"
2. Type: "Spent 250 on Jollibee"
3. Confirm → Done! ✨

---

## 📐 Architecture

### Components

```
┌─────────────────────────────────────────┐
│  AI Transaction Input Dialog            │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 💬 Natural Language Input          │ │ ← User types here
│  │ "Spent 250 on Jollibee for lunch"  │ │
│  └────────────────────────────────────┘ │
│               ↓                          │
│  ┌────────────────────────────────────┐ │
│  │ 🤖 AI Parser (Claude/GPT)          │ │ ← Parse via API
│  │ + History-based learning           │ │
│  └────────────────────────────────────┘ │
│               ↓                          │
│  ┌────────────────────────────────────┐ │
│  │ ✅ Parsed Fields (editable)        │ │ ← User can edit
│  │ Amount: ₱250                       │ │
│  │ Type: Expense                      │ │
│  │ Category: Food & Dining            │ │
│  │ Description: Jollibee              │ │
│  │ Account: [Cash] ← select           │ │
│  │ Date: Today                        │ │
│  └────────────────────────────────────┘ │
│               ↓                          │
│  [ 🚀 Confirm & Save ]                  │
└─────────────────────────────────────────┘
```

### Tech Stack

**AI Provider Options:**

1. **OpenAI GPT-4o-mini** (Recommended for MVP)
   - Cost: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
   - Fast, cheap, great at structured extraction
   - ~100 tokens per parse = $0.00007 per transaction

2. **Claude 3.5 Sonnet** (Premium option)
   - More accurate, better context understanding
   - ~$3 per 1M tokens
   - Slightly more expensive but excellent quality

3. **Hybrid Approach** (Future)
   - Start with local pattern matching
   - Fall back to AI only when needed
   - Reduces API costs

**Recommendation:** Start with GPT-4o-mini for cost-effectiveness, can upgrade later.

---

## 🔧 Implementation Details

### 1. Natural Language Parser

**API Route:** `/api/parse-transaction`

**Input:**
```json
{
  "text": "Spent 250 on Jollibee for lunch",
  "userId": "...",
  "userHistory": {
    "recentTransactions": [...],
    "frequentMerchants": [...],
    "categories": [...]
  }
}
```

**AI Prompt Template:**
```
You are a financial transaction parser for a Filipino user.

Parse this transaction: "{text}"

User's categories: {categories}
User's accounts: {accounts}
Recent transactions for context: {recentTransactions}

Extract:
1. amount (number, required)
2. type ("income" | "expense" | "transfer")
3. merchant/description (string)
4. category (from user's categories, best match)
5. account (suggest based on history)
6. date (ISO string, default to today)
7. confidence (0-1, how sure you are)

Return JSON only:
{
  "amount": 250,
  "type": "expense",
  "description": "Jollibee",
  "categoryId": "cat_food_dining",
  "accountId": "acc_cash",
  "date": "2026-01-27",
  "confidence": 0.95,
  "reasoning": "Amount clearly stated, Jollibee is a fast food chain (Food & Dining)"
}

If anything is unclear, set confidence lower and explain why.
```

**Output:**
```json
{
  "success": true,
  "parsed": {
    "amount": 250,
    "type": "expense",
    "description": "Jollibee",
    "categoryId": "cat_123",
    "accountId": null,
    "date": "2026-01-27",
    "confidence": 0.95
  },
  "suggestions": {
    "accounts": ["Cash", "BPI Debit"],
    "categories": ["Food & Dining"]
  },
  "warnings": ["Could not determine account from text"]
}
```

### 2. Smart Suggestion System

**Build a "transaction memory" system:**

```typescript
interface TransactionPattern {
  merchant: string
  normalizedName: string
  frequency: number
  avgAmount: number
  mostCommonCategory: string
  mostCommonAccount: string
  lastUsed: Date
}
```

**Database Table: `transaction_patterns`**
```sql
CREATE TABLE transaction_patterns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  merchant_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  frequency INT DEFAULT 1,
  avg_amount DECIMAL(10,2),
  category_id UUID,
  account_id UUID,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_patterns_user_merchant 
  ON transaction_patterns(user_id, normalized_name);
```

**How it works:**

1. When user saves a transaction, update pattern:
   ```typescript
   await upsertPattern({
     merchant: "Jollibee",
     amount: 250,
     category: "Food & Dining",
     account: "Cash"
   })
   ```

2. When parsing, fetch patterns:
   ```typescript
   const patterns = await getTopPatterns(userId, limit: 50)
   // Include in AI prompt context
   ```

3. AI uses patterns for better suggestions:
   ```
   User previously recorded "Jollibee" 15 times:
   - Average: ₱280
   - Category: Food & Dining (100%)
   - Account: Cash (80%), BPI (20%)
   ```

### 3. UI/UX Flow

**State Machine:**

```
IDLE → TYPING → PARSING → CONFIRMING → SAVED
  ↑                ↓
  └─── ERROR ←────┘
```

**Component: `AiTransactionDialog.tsx`**

```tsx
const [state, setState] = useState<'idle' | 'parsing' | 'confirming' | 'error'>('idle')
const [input, setInput] = useState('')
const [parsed, setParsed] = useState(null)
const [isEditing, setIsEditing] = useState(false)

// Debounced parsing
useEffect(() => {
  const timer = setTimeout(() => {
    if (input.length > 5) {
      parseTransaction(input)
    }
  }, 500)
  return () => clearTimeout(timer)
}, [input])
```

**Visual States:**

1. **Idle:** Large text input, examples shown
2. **Parsing:** Show spinner, "Understanding your transaction..."
3. **Confirming:** Show parsed fields (editable), confidence indicator
4. **Error:** Show error + fallback to manual form

### 4. Fallback Strategy

**If AI fails or confidence < 0.6:**

1. Show parsed fields with ⚠️ warning icons
2. Highlight uncertain fields in yellow
3. User can manually correct
4. OR: Fall back to traditional form

**Progressive Enhancement:**
- Start with AI mode
- If user repeatedly manually corrects → offer to switch to traditional mode
- "Having trouble? Switch to classic form"

### 5. Examples & Education

**Show helpful examples in empty state:**

```
┌─────────────────────────────────────┐
│ 💡 Try saying:                      │
│                                     │
│ • "Spent 250 on Jollibee"           │
│ • "Received 50000 salary"           │
│ • "Paid 1500 for electricity"       │
│ • "Transferred 10k to savings"      │
│ • "Got 5000 from freelance work"    │
└─────────────────────────────────────┘
```

**Contextual hints as user types:**

- Typing "spent" → Suggest completing with amount
- Typing numbers → Detect amount automatically
- Typing "on" → Expect merchant name next

---

## 🎨 UI Design

### Main Dialog

```
┌──────────────────────────────────────────┐
│  ✨ Add Transaction                      │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 💬 What did you spend or receive?  │ │
│  │                                    │ │
│  │ Spent 250 on Jollibee for lunch   │ │  ← Large input
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  🤖 Parsing... (or show parsed below)    │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Looks good?                        │ │
│  │                                    │ │
│  │ 💰 Amount      ₱250                │ │
│  │ 📤 Type        Expense             │ │
│  │ 🍔 Category    Food & Dining       │ │
│  │ 📝 Description Jollibee           │ │
│  │ 💳 Account     [Select] ← required │ │
│  │ 📅 Date        Today               │ │
│  └────────────────────────────────────┘ │
│                                          │
│  [ Edit Manually ]  [ 🚀 Save ]         │
└──────────────────────────────────────────┘
```

### Confidence Indicator

**High confidence (>0.8):** Green check ✅  
**Medium (0.6-0.8):** Yellow warning ⚠️  
**Low (<0.6):** Red question ❓ + suggest manual entry

### Quick Actions

After parsing, show quick edit buttons:

```
Category: Food & Dining [Change]
Account: Cash [Change]
Date: Today [Change]
```

Clicking opens inline editor (dropdown/datepicker)

---

## 🔐 Security & Privacy

### API Key Management

**Store OpenAI/Claude key securely:**
- Server-side only (never expose to client)
- Use environment variables
- Rotate keys periodically

**Rate limiting:**
- Max 50 parses per user per day (prevents abuse)
- Cache common patterns to reduce API calls

### Data Privacy

**What's sent to AI:**
- ✅ Transaction text (user typed)
- ✅ User's category names (needed for matching)
- ✅ Recent transaction patterns (anonymized merchant names)
- ❌ Account balances
- ❌ Full transaction history
- ❌ Personal info beyond what user typed

**Prompt sanitization:**
- Strip sensitive data before sending
- Don't include account numbers, full balances
- Anonymize if needed

---

## 💰 Cost Analysis

### Per-Transaction Cost

**GPT-4o-mini pricing:**
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

**Typical parse:**
- Prompt: ~800 tokens (includes context)
- Response: ~100 tokens
- Total: ~900 tokens
- Cost: ~$0.0001 per transaction

**Monthly estimates:**

| Transactions/month | API Cost | Cost per user |
|--------------------|----------|---------------|
| 100                | $0.01    | Negligible    |
| 500                | $0.05    | $0.05         |
| 1,000              | $0.10    | $0.10         |

**Optimization strategies:**

1. **Cache common patterns**
   - "Jollibee" → Food & Dining (no API call needed)
   - Reduces costs by ~60%

2. **Local fallback first**
   - Try regex patterns (amounts, keywords)
   - Only use AI for ambiguous cases
   - Saves 40-50% of API calls

3. **Batch processing**
   - Queue multiple parses
   - Process together (future feature)

---

## 📊 Success Metrics

**Track these to measure success:**

1. **Adoption Rate**
   - % of transactions using AI input vs manual form
   - Target: >60% after 2 weeks

2. **Parse Accuracy**
   - % of AI parses accepted without edits
   - Target: >85%

3. **Time Saved**
   - Avg time to add transaction (before vs after)
   - Target: 50% reduction (from ~30s to ~15s)

4. **User Satisfaction**
   - In-app feedback: "Was this helpful?"
   - Target: >4.5/5 stars

5. **Error Rate**
   - % of failed/low-confidence parses
   - Target: <10%

**Instrumentation:**

```typescript
await analytics.track('ai_transaction_parsed', {
  confidence: 0.95,
  editedFields: ['account'],
  timeToParse: 1200, // ms
  apiProvider: 'openai'
})
```

---

## 🚀 Implementation Phases

### Phase 1: MVP (Week 1)
**Goal:** Basic AI parsing works end-to-end

- [ ] Set up OpenAI API integration
- [ ] Create `/api/parse-transaction` route
- [ ] Build AI prompt template with basic context
- [ ] Create `AiTransactionDialog` component
- [ ] Implement parse → confirm → save flow
- [ ] Basic error handling + fallback to manual
- [ ] Deploy & test with real usage

**Deliverable:** Users can type natural language and get parsed transactions

### Phase 2: Smart Suggestions (Week 2)
**Goal:** AI learns from user's history

- [ ] Create `transaction_patterns` table
- [ ] Build pattern extraction logic
- [ ] Update AI prompt to include user patterns
- [ ] Add auto-complete for common merchants
- [ ] Show "Did you mean...?" suggestions
- [ ] Improve accuracy with historical context

**Deliverable:** AI gets smarter over time, higher accuracy

### Phase 3: Polish & Optimization (Week 3)
**Goal:** Make it delightful + reduce costs

- [ ] Add example hints in empty state
- [ ] Implement confidence indicators
- [ ] Build local pattern matching (fallback)
- [ ] Add analytics & tracking
- [ ] Optimize prompts (reduce token usage)
- [ ] A/B test different prompt styles
- [ ] Add keyboard shortcuts (Cmd+K to open)

**Deliverable:** Production-ready, cost-optimized feature

### Phase 4: Advanced Features (Future)
- [ ] Voice input (speech-to-text → AI parse)
- [ ] Receipt scanning with OCR
- [ ] SMS/Email forwarding for auto-import
- [ ] Batch processing ("Add 5 transactions at once")
- [ ] Multi-language support
- [ ] Telegram bot integration ("Just text me your expenses")

---

## 🎯 Example Parsing Cases

### Simple Expense
**Input:** "Spent 250 on Jollibee"  
**Parsed:**
```json
{
  "amount": 250,
  "type": "expense",
  "description": "Jollibee",
  "category": "Food & Dining",
  "confidence": 0.95
}
```

### Income with Context
**Input:** "Received 50000 salary from work"  
**Parsed:**
```json
{
  "amount": 50000,
  "type": "income",
  "description": "Salary",
  "category": "Salary/Wages",
  "confidence": 0.98
}
```

### Transfer
**Input:** "Transferred 10k from cash to savings"  
**Parsed:**
```json
{
  "amount": 10000,
  "type": "transfer",
  "fromAccount": "Cash",
  "toAccount": "Savings",
  "confidence": 0.90
}
```

### Ambiguous (Low Confidence)
**Input:** "bought something for 500"  
**Parsed:**
```json
{
  "amount": 500,
  "type": "expense",
  "description": "something",
  "category": "Shopping", // guessed
  "confidence": 0.55,
  "warnings": ["Description is vague, category uncertain"]
}
```
→ Show yellow warning, ask user to clarify

### Complex with Date
**Input:** "Paid 1500 for electricity bill yesterday"  
**Parsed:**
```json
{
  "amount": 1500,
  "type": "expense",
  "description": "Electricity bill",
  "category": "Utilities",
  "date": "2026-01-26",
  "confidence": 0.92
}
```

### Filipino Slang
**Input:** "Nagbayad 1500 sa kuryente kahapon"  
**Parsed:**
```json
{
  "amount": 1500,
  "type": "expense",
  "description": "Kuryente (Electricity)",
  "category": "Utilities",
  "date": "2026-01-26",
  "confidence": 0.85
}
```

---

## ⚠️ Edge Cases & Handling

### Multiple Amounts
**Input:** "Bought lunch for 250 and coffee for 120"  
**Strategy:** Parse first transaction, ask: "I see 2 transactions. Add both?"

### Missing Critical Info
**Input:** "bought food"  
**Strategy:** AI prompts: "How much did you spend?" (interactive follow-up)

### Unclear Category
**Input:** "spent 500 on stuff"  
**Strategy:** Show all categories, ask user to pick (low confidence)

### Wrong Date Format
**Input:** "paid rent on 25th"  
**Strategy:** Assume current month, confirm with user

### Invalid Amount
**Input:** "spent a lot on groceries"  
**Strategy:** Ask for specific amount, can't proceed without it

---

## 🛠 Technical Stack Summary

**Frontend:**
- React state machine for dialog flow
- Debounced input for real-time parsing
- Optimistic UI updates
- Keyboard shortcuts (Cmd+K)

**Backend:**
- Next.js API route: `/api/parse-transaction`
- OpenAI/Claude API integration
- Supabase for pattern storage
- Rate limiting with Redis (optional)

**Database:**
- New table: `transaction_patterns`
- Track merchant frequency, avg amounts
- Cache common parses

**Monitoring:**
- Track parse success rate
- Monitor API costs
- Log errors + low-confidence cases

---

## 🎉 Expected Impact

**Before AI:**
- Avg transaction input time: 30-45 seconds
- Users often abandon mid-entry
- Friction in daily usage

**After AI:**
- Avg input time: 10-15 seconds (50-70% faster)
- Higher engagement (easier to log transactions)
- "Feels magical" user experience

**Competitive Advantage:**
- Most finance apps: clunky forms
- This app: conversational, smart, learns

---

## 📋 Next Steps

**Once approved:**

1. Set up OpenAI API key (or Claude)
2. Build Phase 1 MVP (AI parsing + dialog)
3. Test with real data
4. Iterate on accuracy
5. Add Phase 2 (smart suggestions)
6. Polish & deploy Phase 3

**Timeline:** 3 weeks to production-ready feature

---

## 💭 Open Questions

1. **Which AI provider?** GPT-4o-mini (cheaper) or Claude (better)?
2. **Cost cap?** Set max API spend per month?
3. **Multi-language?** Support English + Filipino (Taglish)?
4. **Voice input?** Add speech-to-text as phase 4?
5. **Bulk import?** Parse multiple transactions from text dump?

---

**Ready to build?** Let me know if you want any changes! 🐾
