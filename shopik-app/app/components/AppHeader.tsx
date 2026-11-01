import Link from "./ScreenLink";
import type { Account } from "@/lib/identity";
import Avatar from "./Avatar";


// One header gives every protected page the same visible Google account.
export default function AppHeader({
  account,
  page,
}: {
  account: Account;
  page: "products" | "expenses" | "settings";
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          Shopik
        </Link>
        <nav aria-label="Основна навігація" className="flex flex-wrap gap-4">
          <Link
            href="/"
            aria-current={page === "products" ? "page" : undefined}
          >
            Список покупок
          </Link>
          <Link
            href="/expenses"
            aria-current={page === "expenses" ? "page" : undefined}
          >
            Витрати
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {/* <ThemeToggle /> */}
          <Link
            href="/settings"
            aria-label={`Налаштування акаунта: ${account.name}`}
            aria-current={page === "settings" ? "page" : undefined}
            className="flex min-h-11 min-w-11 max-w-full items-center gap-3 rounded outline-offset-4"
          >
            <Avatar name={account.name} url={account.avatar_url} />
            <span
              className="account-name max-w-40 truncate"
              title={account.name}
            >
              {account.name}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
