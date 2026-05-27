import { useSession, signIn, signOut, signUp } from "@/lib/auth";

export function useAuth() {
  const { data: session, isPending, error } = useSession();

  const loginWithGoogle = () =>
    signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });

  const loginWithEmail = (email: string, password: string) =>
    signIn.email({ email, password, callbackURL: window.location.origin });

  const registerWithEmail = (name: string, email: string, password: string) =>
    signUp.email({ name, email, password, callbackURL: window.location.origin });

  const logout = () => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } });

  return {
    user: session?.user ?? null,
    session,
    isLoading: isPending,
    isAuthenticated: !!session?.user,
    error,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
  };
}
