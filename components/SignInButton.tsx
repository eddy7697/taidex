import { signIn } from "@/auth";
export default function SignInButton() {
  return (
    <form action={async () => { "use server"; await signIn("line", { redirectTo: "/" }); }}>
      <button className="rounded bg-[#06C755] px-6 py-3 font-bold text-white" type="submit">
        使用 LINE 登入
      </button>
    </form>
  );
}
