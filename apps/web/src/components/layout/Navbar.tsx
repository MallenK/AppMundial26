import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Trophy, Users, BarChart3, Home, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const NAV_LINKS = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/predictions", label: "Predicciones", icon: Trophy },
  { to: "/community", label: "Comunidad", icon: Users },
  { to: "/players", label: "Jugadores", icon: BarChart3 },
];

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop navbar */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/8 bg-background/90 backdrop-blur hidden md:block">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-black text-lg">
            <span className="text-2xl">🌍</span>
            <span>Mundial 26</span>
          </Link>

          {/* Links */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  location.pathname === to
                    ? "bg-white/10 text-white"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Auth */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link to={`/profile/${user?.id}`} className="flex items-center gap-2 text-sm hover:opacity-80">
                {user?.image ? (
                  <img src={user.image} alt={user.name} className="h-7 w-7 rounded-full" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="hidden lg:block text-muted-foreground">{user?.name?.split(" ")[0]}</span>
              </Link>
              <button onClick={logout} className="text-muted-foreground hover:text-white p-1.5 rounded-md hover:bg-white/5 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" variant="outline">Entrar</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-white/8 bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 h-16">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                location.pathname === to ? "text-white" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          ))}
          {isAuthenticated ? (
            <Link
              to={`/profile/${user?.id}`}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                location.pathname.startsWith("/profile") ? "text-white" : "text-muted-foreground"
              )}
            >
              {user?.image ? (
                <img src={user.image} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <User className="h-5 w-5" />
              )}
              <span>Perfil</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
            >
              <User className="h-5 w-5" />
              <span>Entrar</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
