import Link from "next/link"
import siteConfig from "@site-config"

export function SupportLink() {
  const href = `mailto:${siteConfig.publicInfo.supportEmail}`

  return (
    <p className="text-sm text-muted-foreground">
      {siteConfig.support.prefix}
      <Link href={href} className="text-primary hover:text-primary/80 ml-1">
        {siteConfig.support.linkLabel}
      </Link>
      にお問い合わせください
    </p>
  )
}
