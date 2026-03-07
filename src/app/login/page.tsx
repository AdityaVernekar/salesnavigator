"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    const { error: signInError } = await supabaseClient.auth.signInWithPassword(
      {
        email: email.trim(),
        password,
      },
    );
    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }
    await supabaseClient.auth.getSession();
    const nextParam = searchParams.get("next");
    const destination =
      nextParam && nextParam.startsWith("/") ? nextParam : "/";
    window.location.assign(destination);
  }

  async function handleSignUp() {
    setError(null);
    setInfo(null);
    setIsSubmitting(true);

    const signupResponse = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
    const signupPayload = await signupResponse.json().catch(() => null);

    if (!signupResponse.ok || !signupPayload?.ok) {
      setIsSubmitting(false);
      setError(signupPayload?.error ?? "Could not create account");
      return;
    }

    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (signInError) {
      setInfo("Account created. Please sign in with your new credentials.");
      return;
    }

    window.location.assign("/auth/onboarding");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full space-y-4 rounded border p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your workspace, or create an account if your email is approved.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || !email.trim() || password.length < 6}
          className="w-full"
          onClick={handleSignUp}
        >
          {isSubmitting ? "Please wait..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[70vh] w-full max-w-md" />}>
      <LoginForm />
    </Suspense>
  );
}
