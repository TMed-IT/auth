import Link from "next/link"

export function SupportLink() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL
  const href = supportEmail ? `mailto:${supportEmail}` : "#"

  return (
    <p className="text-sm text-zinc-500">
      ご不明な点がある場合は、
      <Link href={href} className="text-primary hover:text-primary/80 ml-1">
        サポート
      </Link>
      にお問い合わせください
    </p>
  )
}

