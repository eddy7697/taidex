import { signOut } from "@/auth";
export default function SignOutButton() {
  return (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
      <button className="text-sm text-gray-400" type="submit">登出</button>
    </form>
  );
}
