import { Archive, Camera, Home, MapPin } from "lucide-react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";

export function Onboarding({ onFinish }) {
  return (
    <main className="vault-centered-shell safe-bottom mx-auto grid min-h-svh w-full content-center px-5 py-8 md:px-8">
      <div className="mb-8">
        <div className="mb-4 grid size-16 place-items-center rounded-[1.4rem] bg-white text-vault-ink shadow-soft">
          <Archive size={30} />
        </div>
        <h1 className="text-5xl font-black tracking-tight text-vault-ink">Vault</h1>
        <p className="mt-3 text-lg font-medium leading-7 text-vault-muted">
          A calm home inventory for remembering what is stored where.
        </p>
      </div>

      <div className="grid gap-3">
        {[
          [Home, "Create locations", "Rooms, closets, cabinets, garages, or a parent's home."],
          [Camera, "Add photos", "Capture areas so storage is visual and easy to recognize."],
          [MapPin, "Place blue pins", "Mark exact drawers, shelves, bins, and hidden spots."],
        ].map(([Icon, title, text]) => (
          <Card key={title} className="flex items-center gap-4 rounded-[1.5rem] p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-pink-100 text-vault-ink">
              <Icon size={22} />
            </div>
            <div>
              <h2 className="font-bold">{title}</h2>
              <p className="text-sm leading-5 text-vault-muted">{text}</p>
            </div>
          </Card>
        ))}
      </div>

      <Button className="mt-8 w-full" onClick={onFinish}>
        Start organizing
      </Button>
    </main>
  );
}
