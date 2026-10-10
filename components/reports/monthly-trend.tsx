'use client'

import { Transaction } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface MonthlyTrendProps {
  transactions: Transaction[]
}

export function MonthlyTrend({ transactions }: MonthlyTrendProps) {
  // Group by month
  const monthlyData: Record<string, { income: number; expense: number }> = {}

  transactions.forEach((t) => {
    const date = new Date(t.date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expense: 0 }
    }

    if (t.type === 'income') {
      monthlyData[monthKey].income += Number(t.amount)
    } else if (t.type === 'expense') {
      monthlyData[monthKey].expense += Number(t.amount)
    }
  })

  const data = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => {
      const date = new Date(month + '-01')
      return {
        month: date.toLocaleDateString('en-PH', { month: 'short' }),
        Income: values.income,
        Expenses: values.expense,
      }
    })

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Trend</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          No data yet
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Trend</CardTitle>
        <p className="text-sm text-muted-foreground">Last 6 months</p>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)" }} />
              <YAxis
                tick={{ fill: "var(--muted-foreground)" }}
                tickFormatter={(value) =>
                  `₱${(value / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 12 }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Legend />
              <Bar dataKey="Income" fill="var(--income)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="var(--expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
