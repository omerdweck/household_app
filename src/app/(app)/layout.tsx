import { BottomNav } from "@/components/BottomNav";
import { getHousehold } from "@/lib/household";

// Every page inside (app) requires a signed-in household member.
// The middleware already sends signed-out users to /login; this also
// catches signed-in accounts that are not in the members table.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getHousehold();
  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-28 pt-6">{children}</div>
      <BottomNav />
    </>
  );
}
