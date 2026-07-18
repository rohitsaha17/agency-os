import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

/**
 * First-time password setup, shown to a signed-in user who has no password.
 * Server-gated so it never flashes for users who don't need it.
 */
export default async function SetPasswordPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, isActive: true, passwordHash: true },
  });

  if (!user || !user.isActive) redirect("/login");
  // Already has a password → nothing to do here.
  if (user.passwordHash) redirect("/");

  return <SetPasswordForm name={user.name} />;
}
