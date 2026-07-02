import BottomNav from "@/components/layout/BottomNav";
import SignOutButton from "@/components/SignOutButton";

export default function AppShell({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl pb-16 md:pb-0">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="text-lg font-bold">{title}</h1>
        <SignOutButton />
      </header>
      <main className="p-4">{children}</main>
      <BottomNav />
    </div>
  );
}
