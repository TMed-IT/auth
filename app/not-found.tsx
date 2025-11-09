"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { LogInIcon } from "lucide-react"
import { Logo } from "@/components/ui/logo"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md text-center"
      >
        <div className="mb-8">
          <Logo />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8"
        >
          <div className="space-y-6">
            <div>
              <h1 className="text-6xl font-bold text-white mb-4">404</h1>
              <h2 className="text-2xl font-semibold text-white mb-2">ページが見つかりません</h2>
              <p className="text-zinc-400">
                お探しのページは存在しないか、認証に失敗しました
                <br />
                最初からやり直してください
              </p>
            </div>

            <Link
              href="/"
              className="w-full rounded-xl bg-white text-[#1f1f1f] hover:bg-zinc-100 shadow-sm border border-zinc-200 py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              <LogInIcon className="w-5 h-5" />
              <span>ログイン画面に戻る</span>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

