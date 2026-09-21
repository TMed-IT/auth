"use client"

import { motion, type HTMLMotionProps } from "framer-motion"

import { cn } from "@/lib/utils"

export function AuthCard({ className, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={cn(
        "rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  )
}
