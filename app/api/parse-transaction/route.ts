import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

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

interface ParsedTransaction {
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  categoryName: string | null
  accountName: string | null
  toAccountName: string | null
  date: string
  confidence: number
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    const { text } = await request.json()

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
      category: (t.category as any)?.name,
      account: (t.account as any)?.name,
    }))

    const today = new Date().toISOString().split('T')[0]

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
      parsed = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error('Failed to parse AI response:', cleanedResponse)
      return NextResponse.json({ 
        error: 'Failed to parse response',
        raw: cleanedResponse 
      }, { status: 500 })
    }

    // Map category and account names to IDs
    const transactions = parsed.transactions.map((t: ParsedTransaction) => ({
      ...t,
      categoryId: categories.find(c => c.name.toLowerCase() === t.categoryName?.toLowerCase())?.id || null,
      accountId: accounts.find(a => a.name.toLowerCase() === t.accountName?.toLowerCase())?.id || null,
      toAccountId: accounts.find(a => a.name.toLowerCase() === t.toAccountName?.toLowerCase())?.id || null,
    }))

    return NextResponse.json({
      success: true,
      transactions,
      message: parsed.message,
      categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type, icon: c.icon })),
      accounts: accounts.map(a => ({ id: a.id, name: a.name, icon: a.icon })),
    })
  } catch (error: any) {
    console.error('Parse transaction error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to parse transaction' 
    }, { status: 500 })
  }
}
