import SignInButton from "@/components/SignInButton";
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">Taidex 台股看板</h1>
      <p className="text-gray-400">用 LINE 登入,開始追蹤你的自選股</p>
      <SignInButton />
    </main>
  );
}
