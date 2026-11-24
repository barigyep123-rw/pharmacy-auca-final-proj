"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Profile = {
  name: string;
  phone: string;
  email: string;
  address: string;
  receiptPrefix: string;
  receiptNext: number;
  receiptPadding: number;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  defaultDiscountBps: number;
  allowLineDiscount: boolean;
  defaultReorderLevel: number;
  tin: string;
  ebmSerial: string;
};

function percent(bps: number) {
  return String(bps / 100);
}

function toBps(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(parsed * 100)));
}

export function BusinessSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [prefix, setPrefix] = useState("UBZ");
  const [padding, setPadding] = useState(4);
  const [nextNumber, setNextNumber] = useState(1);

  useEffect(() => {
    let cancel = false;
    api<{ profile: Profile }>("/api/business")
      .then((result) => {
        if (cancel) return;
        setProfile(result.profile);
        setPrefix(result.profile.receiptPrefix);
        setPadding(result.profile.receiptPadding);
        setNextNumber(result.profile.receiptNext);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the business profile.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const preview = `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "") || "UBZ"}-${String(nextNumber).padStart(Math.min(8, Math.max(1, padding || 1)), "0")}`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFormError(null);
    try {
      const result = await api<{ profile: Profile }>("/api/business", {
        method: "PATCH",
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          phone: String(data.get("phone") ?? ""),
          email: String(data.get("email") ?? ""),
          address: String(data.get("address") ?? ""),
          tin: String(data.get("tin") ?? ""),
          ebmSerial: String(data.get("ebmSerial") ?? ""),
          receiptPrefix: prefix,
          receiptPadding: Math.min(8, Math.max(1, padding || 1)),
          taxRateBps: toBps(String(data.get("tax") ?? "0")),
          pricesIncludeTax: data.get("pricesIncludeTax") === "on",
          defaultDiscountBps: toBps(String(data.get("discount") ?? "0")),
          allowLineDiscount: data.get("allowLineDiscount") === "on",
          defaultReorderLevel: Number(data.get("reorder") ?? 0),
        }),
      });
      setProfile(result.profile);
      setPrefix(result.profile.receiptPrefix);
      setNextNumber(result.profile.receiptNext);
      toast.success("Business settings saved.");
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the business settings.");
    } finally {
      setPending(false);
    }
  }

  if (!profile && !error) return <LoadingBlock label="Opening business settings…" />;
  if (!profile) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Business"
        lede="The name on a receipt, how those receipts are numbered, and the defaults for tax, discount, and new stock lines."
      />
      <Card className="p-4">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
          {formError ? <div className="sm:col-span-2"><Notice>{formError}</Notice></div> : null}
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Pharmacy name</span>
            <Input name="name" defaultValue={profile.name} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Phone</span>
            <Input name="phone" defaultValue={profile.phone} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <Input name="email" defaultValue={profile.email} />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Address on the receipt</span>
            <Input name="address" defaultValue={profile.address} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">TIN</span>
            <Input name="tin" defaultValue={profile.tin} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">EBM device serial</span>
            <Input name="ebmSerial" defaultValue={profile.ebmSerial} placeholder="Leave blank until a certified device is connected" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Receipt prefix</span>
            <Input value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={8} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Digits</span>
            <Input
              inputMode="numeric"
              value={String(padding)}
              onChange={(event) => setPadding(Number(event.target.value) || 1)}
            />
          </label>
          <p className="sm:col-span-2 text-sm text-muted">
            Next receipt: <span className="font-medium text-ink">{preview}</span>
          </p>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Tax (%)</span>
            <Input name="tax" inputMode="decimal" defaultValue={percent(profile.taxRateBps)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Default discount (%)</span>
            <Input name="discount" inputMode="decimal" defaultValue={percent(profile.defaultDiscountBps)} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="pricesIncludeTax" defaultChecked={profile.pricesIncludeTax} />
            Shelf prices already include tax
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="allowLineDiscount" defaultChecked={profile.allowLineDiscount} />
            Allow a discount on a sale line
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Default reorder level</span>
            <Input name="reorder" inputMode="numeric" defaultValue={String(profile.defaultReorderLevel)} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save business settings"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
