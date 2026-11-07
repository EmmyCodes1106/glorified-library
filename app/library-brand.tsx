import { getLibraryIdentity } from "@/lib/settings";

export default async function LibraryBrand() {
  const identity = await getLibraryIdentity();

  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
      {identity.logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.logoDataUrl}
          alt=""
          className="h-5 w-auto max-w-[72px] object-contain"
        />
      )}
      <span>{identity.name}</span>
    </p>
  );
}
