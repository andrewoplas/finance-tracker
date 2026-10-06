import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { dateOnly, manilaToday } from '@/lib/finance/core'

// Lazy initialize OpenAI client
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openai
}

const outputSchema = z.object({
  transactions: z.array(z.object({
    amount: z.number().positive().max(9999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001),
    type: z.enum(['income', 'expense', 'transfer']), description: z.string().min(1).max(300),
    categoryName: z.string().nullable(), accountName: z.string().nullable(), toAccountName: z.string().nullable(),
    date: dateOnly, confidence: z.number().min(0).max(1),
  })).min(1).max(20), message: z.string().max(500),
})

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origin rejected' }, { status: 403 })
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    const input = z.object({ text: z.string().trim().min(3).max(4000) }).safeParse(await request.json())
    if (!input.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { text } = input.data
    if (!text || text.trim().length < 3) {
      return NextResponse.json({ error: 'Text too short' }, { status: 400 })
    }

    // Fetch user's categories and accounts for context
    const [categoriesRes, accountsRes, patternsRes] = await Promise.all([
      supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id),
      supabase.from('accounts').select('id, name, icon').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('transactions')
        .select('description, amount, type, category:categories(name), account:accounts!transactions_account_id_fkey(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (categoriesRes.error || accountsRes.error || patternsRes.error) return NextResponse.json({ error: 'Context unavailable' }, { status: 503 })
    const categories = categoriesRes.data || []
    const accounts = accountsRes.data || []
    const recentTransactions = patternsRes.data || []

    const expenseCategories = categories.filter(c => c.type === 'expense').map(c => c.name)
    const incomeCategories = categories.filter(c => c.type === 'income').map(c => c.name)
    const accountNames = accounts.map(a => a.name)

    // Build context from recent transactions
    const recentPatterns = recentTransactions.slice(0, 10).map(t => ({
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: (t.category as unknown as { name?: string })?.name,
      account: (t.account as unknown as { name?: string })?.name,
    }))

    const today = manilaToday()

    const prompt = `You are a Filipino finance transaction parser. Parse the user's natural language into structured transaction data.

USER INPUT: "${text}"

AVAILABLE DATA:
- Expense Categories: ${expenseCategories.join(', ')}
- Income Categories: ${incomeCategories.join(', ')}
- Accounts: ${accountNames.join(', ')}
- Today's Date: ${today}

RECENT TRANSACTIONS (for pattern matching):
${recentPatterns.map(p => `- ${p.description}: ₱${p.amount} (${p.type}, ${p.category}, ${p.account})`).join('\n')}

INSTRUCTIONS:
1. Parse the input into one or more transactions
2. For each transaction, extract:
   - amount (number, required) - look for numbers, "k" means thousands
   - type: "expense" (spent/paid/bought), "income" (received/got/earned), "transfer" (transferred/moved)
   - description (merchant/source name)
   - categoryName (MUST match one of the available categories exactly, or null)
   - accountName (MUST match one of the available accounts exactly, or null if not mentioned)
   - toAccountName (only for transfers, must match an account name)
   - date (ISO format, default to today, "yesterday" = subtract 1 day, "last week" = subtract 7 days)
   - confidence (0.0-1.0)

3. Handle Filipino/Taglish: "nagbayad" = paid, "kuryente" = electricity, "binili" = bought

RESPOND WITH VALID JSON ONLY (no markdown):
{
  "transactions": [
    {
      "amount": 250,
      "type": "expense",
      "description": "Jollibee",
      "categoryName": "Food & Dining",
      "accountName": null,
      "toAccountName": null,
      "date": "${today}",
      "confidence": 0.95
    }
  ],
  "message": "Parsed 1 expense transaction"
}`

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a transaction parser. Always respond with valid JSON only, no markdown formatting.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Clean response (remove potential markdown)
    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    let parsed
    try {
      parsed = outputSchema.parse(JSON.parse(cleanedResponse))
    } catch {
      return NextResponse.json({
        error: 'Could not validate the suggested transactions'
      }, { status: 500 })
    }

    // Map category and account names to IDs
    const transactions = parsed.transactions.map((t) => ({
      ...t,
      categoryId: categories.find(c => c.name.toLowerCase() === t.categoryName?.toLowerCase())?.id || null,
      accountId: accounts.find(a => a.name.toLowerCase() === t.accountName?.toLowerCase())?.id || null,
      toAccountId: accounts.find(a => a.name.toLowerCase() === t.toAccountName?.toLowerCase())?.id || null,
    }))

    const response = {
      success: true,
      transactions,
      message: parsed.message,
      categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type, icon: c.icon })),
      accounts: accounts.map(a => ({ id: a.id, name: a.name, icon: a.icon })),
    }

    return NextResponse.json(response)
  } catch {
    return NextResponse.json({
      error: 'Failed to parse transaction'
    }, { status: 500 })
  }
}
