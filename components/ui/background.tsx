"use client"

import { motion } from "framer-motion"

export function BackgroundDecoration() {
  return (
    <>
      <div className="fixed inset-0 bg-linear-to-br from-auth-background-secondary via-background to-auth-background-secondary pointer-events-none" />
      <motion.div
        className="fixed top-20 left-20 w-72 h-72 bg-primary rounded-full blur-3xl pointer-events-none"
        animate={{
          x: [0, 100, -80, 50, 0],
          y: [0, 80, -60, 40, 0],
          scale: [1, 1.3, 0.9, 1.2, 1],
          rotate: [0, 90, -45, 45, 0],
          opacity: [0.15, 0.3, 0.12, 0.25, 0.15],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="fixed bottom-20 right-20 w-96 h-96 bg-auth-primary-strong rounded-full blur-3xl pointer-events-none"
        animate={{
          x: [0, -120, 90, -60, 0],
          y: [0, -100, 70, -50, 0],
          scale: [1, 1.4, 0.8, 1.3, 1],
          rotate: [0, -90, 60, -30, 0],
          opacity: [0.08, 0.2, 0.06, 0.15, 0.08],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </>
  )
}
