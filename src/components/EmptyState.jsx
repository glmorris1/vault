import { Archive, Camera, MapPin } from "lucide-react";

const icons = { archive: Archive, camera: Camera, pin: MapPin };

export function EmptyState({ icon = "archive", title, children }) {
  const Icon = icons[icon] || Archive;

  return (
    <div className="rounded-[2rem] border border-dashed border-rose-200 bg-white/60 p-8 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-pink-100 text-vault-ink">
        <Icon size={28} strokeWidth={1.8} />
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-vault-muted">{children}</p>
    </div>
  );
}
