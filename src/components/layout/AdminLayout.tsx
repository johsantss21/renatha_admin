import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  RefreshCw,
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
}

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/produtos', label: 'Produtos', icon: Package },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { path: '/assinaturas', label: 'Assinaturas', icon: RefreshCw },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card">
        <h1 className="text-xl font-bold text-primary">Hidroponia Admin</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform lg:translate-x-0 lg:static",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b hidden lg:block">
              <h1 className="text-xl font-bold text-primary">Hidroponia Admin</h1>
              <p className="text-sm text-muted-foreground mt-1">Painel Administrativo</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t">
              {user && (
                <div className="mb-4 px-4">
                  <p className="font-medium text-sm truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground">Administrador</p>
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5" />
                <span>Sair</span>
              </Button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
