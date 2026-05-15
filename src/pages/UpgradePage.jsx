import { Sparkles } from "lucide-react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";

export function UpgradePage() {
  return (
    <div className="grid gap-5 pb-8">
      <Card className="grid gap-4 p-6 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-vault-pink text-vault-blue">
          <Sparkles size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-vault-ink">Upgrade AI</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-vault-muted">
            You have been killing it with the AI assistant, and used it over 100 times! Upgrade to keep using the AI photo assistant.
          </p>
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-vault-blue">Vault AI Plus</p>
          <h3 className="mt-1 text-xl font-black text-vault-ink">Keep organizing faster</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-vault-muted">
            Continue using AI photo analysis for rooms, shelves, drawers, and detail photos.
          </p>
        </div>
        <Button className="w-full" onClick={() => window.alert("In-app purchases are not connected in this web prototype yet.")}>
          Continue to in-app purchase
        </Button>
      </Card>
    </div>
  );
}
