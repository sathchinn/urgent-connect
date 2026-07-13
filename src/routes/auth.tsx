import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/home` },
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        setLoading(false);
        return;
      }
      // Browser is redirecting to Google; nothing else to do.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created — check your email to confirm, then sign in.");
          setMode("signin");
          setLoading(false);
          return;
        }
        toast.success("Welcome to TickBell!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/home", replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      const friendly =
        /invalid login credentials/i.test(raw)
          ? "Wrong email or password. If you're new here, tap 'Create an account'."
          : /user already registered|already been registered/i.test(raw)
          ? "That email is already registered. Try signing in instead."
          : /weak|pwned|leaked|compromised/i.test(raw)
          ? "That password is too common. Please pick a stronger one (mix letters, numbers, symbols)."
          : raw;
      setErrorMsg(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Hero */}
      <div className="hidden md:flex md:w-1/2 gradient-hero text-primary-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-primary-glow/40 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Bell className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">TickBell</span>
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-5xl font-bold leading-tight tracking-tight">When every second matters.</h1>
          <p className="text-lg opacity-90 max-w-md">Ring one person or an entire group. A loud, unmissable alert — delivered in real time.</p>
        </div>
        <div className="relative z-10 text-sm opacity-70">© TickBell</div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <div className="md:hidden flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl gradient-primary flex items-center justify-center shadow-elegant">
              <Bell className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">TickBell</span>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{mode === "signin" ? "Welcome back" : "Create account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Sign in to keep the bell close." : "Start ringing in seconds."}
            </p>
          </div>

          <Button variant="outline" className="w-full h-11 rounded-xl font-medium" onClick={handleGoogle} disabled={loading}>
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-11 rounded-xl" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 rounded-xl" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 rounded-xl" required minLength={6} />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-elegant hover:opacity-95">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 mr-2" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
