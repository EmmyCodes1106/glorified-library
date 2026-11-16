import Image from "next/image";
import darkLogo from "@/public/library-logo-dark.png";
import lightLogo from "@/public/library-logo-light.png";

export default function LibraryLogo({
  className = "h-10 w-12",
}: {
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`block shrink-0 ${className}`}>
      <Image
        src={lightLogo}
        alt=""
        sizes="160px"
        className="block h-full w-full object-contain dark:hidden"
      />
      <Image
        src={darkLogo}
        alt=""
        sizes="160px"
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}
