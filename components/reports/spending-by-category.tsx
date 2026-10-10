'use client'

import { Transaction } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface SpendingByCategoryProps {
  transactions: Transaction[]
}

export function SpendingByCategory({ transactions }: SpendingByCategoryProps) {
  // Get current month expenses
  const now = new Date()
  const currentMonth = transactions.filter((t) => {
    const date = new Date(t.date)
    return (
      t.type === 'expense' &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    )
  })

  // Group by category
  const categoryTotals: Record<string, { name: string; amount: number; color: string; icon: string }> = {}

  currentMonth.forEach((t) => {
    const category = t.category
    const categoryName = category?.name || 'Uncategorized'
    if (!categoryTotals[categoryName]) {
      categoryTotals[categoryName] = {
        name: categoryName,
        amount: 0,
        color: category?.color || 'var(--transfer)',
        icon: category?.icon || '💰',
      }
    }
    categoryTotals[categoryName].amount += Number(t.amount)
  })

  const data = Object.values(categoryTotals).sort((a, b) => b.amount - a.amount)
  const total = data.reduce((sum, d) => sum + d.amount, 0)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spending by Category</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          No expenses this month
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
        <p className="text-sm text-muted-foreground">This month</p>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 12 }}
                formatter={(value) => formatCurrency(Number(value))}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {data.slice(0, 5).map((category) => (
            <div key={category.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm">
                  {category.icon} {category.name}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-medium">{formatCurrency(category.amount)}</span>
                <span className="text-muted-foreground ml-2">
                  ({((category.amount / total) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
