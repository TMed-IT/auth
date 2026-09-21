import Image from "next/image"
import siteConfig from "@site-config"

export function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <Image
        src={siteConfig.brand.logoPath}
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-lg"
        priority
      />
      <span className="text-lg font-medium tracking-wide text-foreground/80">
        {siteConfig.brand.organizationName}
      </span>
    </div>
  )
}
