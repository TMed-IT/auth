import Image from "next/image"
import { UserRound } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { normalizeAvatarPath } from "@/lib/avatar"

export type AccountInfo = {
  email: string
  given_name?: string | null
  family_name?: string | null
  display_name?: string | null
  avatar?: string | null
}

export function AccountCard({ user }: { user: AccountInfo }) {
  const avatar = normalizeAvatarPath(user.avatar)
  const name = user.display_name ||
    `${user.family_name || ""} ${user.given_name || ""}`.trim() ||
    user.email

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/70 p-4">
      {avatar ? (
        <Image
          src={avatar}
          alt=""
          width={48}
          height={48}
          unoptimized
          referrerPolicy="no-referrer"
          className="size-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary">
          <UserRound className="size-6 text-foreground/80" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
    </div>
  )
}

export function AccountCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/70 p-4">
      <Skeleton className="size-12 shrink-0 rounded-full bg-foreground/10" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5 bg-foreground/10" />
        <Skeleton className="h-3 w-3/4 bg-foreground/10" />
      </div>
    </div>
  )
}
