'use client'

import { Card, CardContent } from '@/components/ui/card'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { LucideIcon } from 'lucide-react'

interface AnimatedStatCardProps {
  title: string
  value: number
  icon: LucideIcon
  subtitle: string
  colorClass: string
  bgGradient: string
  prefix?: string
  showSign?: boolean
  index: number
}

export function AnimatedStatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  colorClass,
  bgGradient,
  prefix = '',
  showSign = false,
  index
}: AnimatedStatCardProps) {
  const sign = showSign && value >= 0 ? '+' : ''
  const displayValue = Math.abs(value)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.1,
        ease: [0.23, 1, 0.32, 1] // easeOutQuart
      }}
    >
      <Card className={`relative overflow-hidden border-0 ${bgGradient} shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
        <div className={`absolute top-0 right-0 w-24 h-24 ${colorClass}/10 rounded-full -translate-y-8 translate-x-8`} />
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <motion.div 
              className={`h-10 w-10 rounded-xl ${colorClass}/20 flex items-center justify-center`}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Icon className={`h-5 w-5 ${colorClass}`} />
            </motion.div>
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <div className={`text-3xl font-bold tabular-nums ${colorClass}`}>
            {sign}
            <CountUp
              end={displayValue}
              duration={1.5}
              decimals={2}
              decimal="."
              separator=","
              prefix={prefix}
              preserveValue={true}
              useEasing={true}
              easingFn={(t, b, c, d) => {
                // easeOutQuart
                return -c * ((t = t / d - 1) * t * t * t - 1) + b
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {subtitle}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
