'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_WALLETS } from '@/lib/constants'
import { useRouter } from 'next/navigation'

export function AddWalletButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💰')
  const [color, setColor] = useState('#3b82f6')
  const [targetPercentage, setTargetPercentage] = useState('')

  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('wallets').insert({
      user_id: user.id,
      name,
      icon,
      color,
      target_percentage: targetPercentage ? parseFloat(targetPercentage) : null,
      balance: 0,
    })

    if (error) {
      toast.error('Failed to create wallet')
      setLoading(false)
      return
    }

    toast.success('Wallet created!')
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const handleQuickAdd = async (preset: typeof DEFAULT_WALLETS[0]) => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('wallets').insert({
      user_id: user.id,
      name: preset.name,
      icon: preset.icon,
      color: preset.color,
      target_percentage: preset.target_percentage,
      balance: 0,
    })

    if (error) {
      toast.error('Failed to create wallet')
      setLoading(false)
      return
    }

    toast.success(`${preset.name} created!`)
    setLoading(false)
    router.refresh()
  }

  const resetForm = () => {
    setName('')
    setIcon('💰')
    setColor('#3b82f6')
    setTargetPercentage('')
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add wallet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add wallet</DialogTitle>
          <DialogDescription>Create a wallet to organize your money.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Add Presets */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Quick Add:</p>
            <div className="flex gap-2">
              {DEFAULT_WALLETS.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdd(preset)}
                  disabled={loading}
                  className="flex-1"
                >
                  {preset.icon} {preset.name.split(' ')[0]}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or create custom</span>
            </div>
          </div>

          {/* Custom Wallet Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Wallet Name</Label>
              <Input
                id="name"
                placeholder="e.g., Emergency Fund"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icon">Icon (emoji)</Label>
                <Input
                  id="icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="💰"
                  maxLength={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">Target % (optional)</Label>
              <Input
                id="target"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g., 30"
                value={targetPercentage}
                onChange={(e) => setTargetPercentage(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
