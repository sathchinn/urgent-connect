import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, initials } from "@/lib/tickbell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LogOut, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const profile = useMyProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [avatar, setAvatar] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name ?? "");
      setStatus(profile.data.status_message ?? "");
      setAvatar(profile.data.avatar_url ?? "");
      setPhone((profile.data as { phone?: string | null }).phone ?? "");
    }
  }, [profile.data]);

  const save = async () => {
    if (!profile.data) return;
    const cleanPhone = phone.trim().replace(/[\s()-]/g, "");
    if (cleanPhone && !/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      toast.error("Enter a valid phone number (digits, optional leading +)");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        status_message: status.trim() || null,
        avatar_url: avatar.trim() || null,
        phone: cleanPhone || null,
      } as never)
      .eq("id", profile.data.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("That phone number is already used by another account");
      else toast.error(error.message);
    }
    else { toast.success("Profile saved"); qc.invalidateQueries(); }
  };

  const logout = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/home" })}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="font-semibold">Profile</div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col items-center animate-fade-up">
          <Avatar className="h-24 w-24 ring-4 ring-primary/20">
            {avatar && <AvatarImage src={avatar} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="mt-3 text-sm text-muted-foreground">{profile.data?.email}</div>
        </div>

        <div className="space-y-4 rounded-3xl bg-card p-5 shadow-soft">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Textarea value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl min-h-[70px]" placeholder="Available" />
          </div>
          <div className="space-y-1.5">
            <Label>Avatar URL</Label>
            <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} className="h-11 rounded-xl" placeholder="https://…" />
          </div>
          <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-elegant">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <div className="rounded-3xl bg-card p-2 shadow-soft">
          <button onClick={toggle} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-muted transition">
            {theme === "dark" ? <Sun className="w-5 h-5 text-accent" /> : <Moon className="w-5 h-5 text-primary" />}
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">Appearance</div>
              <div className="text-xs text-muted-foreground">{theme === "dark" ? "Dark mode" : "Light mode"}</div>
            </div>
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-destructive/10 transition text-destructive">
            <LogOut className="w-5 h-5" />
            <div className="flex-1 text-left text-sm font-medium">Log out</div>
          </button>
        </div>
      </div>
    </div>
  );
}
