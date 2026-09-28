import { BrandLoader } from "@/components/ui/BrandLoader";

/**
 * Shown while a dashboard route is still rendering on the server.
 *
 * There was no loading.tsx anywhere in the app before this, so a navigation
 * that waited on the database showed the previous page, frozen, and nothing
 * else — indistinguishable from a click that did not register.
 */
export default function DashboardLoading() {
  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center p-8">
      <BrandLoader />
    </div>
  );
}
