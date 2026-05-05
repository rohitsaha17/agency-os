import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="lg:ml-64 min-h-screen flex flex-col pt-14 lg:pt-0">
            {children}
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
