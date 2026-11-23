"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { roleLabel, roles } from "@/lib/access";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";
import { useStaff } from "./session";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type StaffAccount = {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

function selectClass() {
  return "h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm";
}

export function SettingsScreen() {
  const me = useStaff();
  const [users, setUsers] = useState<StaffAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("pharmacist");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const result = await api<{ users: StaffAccount[] }>("/api/users");
    setUsers(result.users);
  }

  useEffect(() => {
    let cancel = false;
    api<{ users: StaffAccount[] }>("/api/users")
      .then((result) => {
        if (!cancel) setUsers(result.users);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load staff.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      toast.success(`${name} can sign in.`);
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("pharmacist");
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not add that person.");
    } finally {
      setPending(false);
    }
  }

  async function toggle(person: StaffAccount) {
    try {
      await api(`/api/users/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !person.active }),
      });
      toast.success(person.active ? `${person.name} is turned off.` : `${person.name} can sign in again.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update that account.");
    }
  }

  async function remove(person: StaffAccount) {
    if (!window.confirm(`Remove ${person.name} from the staff list?`)) return;
    try {
      await api(`/api/users/${person.id}`, { method: "DELETE" });
      toast.success(`${person.name} removed.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that person.");
    }
  }

  if (!users && !error) return <LoadingBlock label="Opening staff settings…" />;
  if (!users) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Staff and roles"
        lede="The owner adds people, picks what they can do, and can turn an account off or remove it."
        action={<Button onClick={() => setOpen(true)}>Add staff</Button>}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email or username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((person) => (
                <tr key={person.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{person.name}</td>
                  <td className="px-4 py-3">{person.email}</td>
                  <td className="px-4 py-3">{roleLabel(person.role)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={person.active ? "pine" : "neutral"}>{person.active ? "Active" : "Off"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={person.id === me?.id} onClick={() => void toggle(person)}>
                        {person.active ? "Turn off" : "Turn on"}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={person.id === me?.id} onClick={() => void remove(person)}>
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>They sign in with the email or username and the password you set here.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void create(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Email or username</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Role</span>
              <select className={selectClass()} value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {roleLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <DialogFooter>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
