import Image from "next/image"

export function Logo() {
  return (
    <div className="flex items-center justify-center space-x-2">
      <div className="rounded-full size-12 w-12 overflow-hidden flex items-center justify-center">
        <Image
          src="/mahora.png"
          alt="Mahora"
          width={48}
          height={48}
          className="rounded-full object-cover"
        />
      </div>
      <span className="text-xl font-semibold text-white">Mahora</span>
    </div>
  )
}

