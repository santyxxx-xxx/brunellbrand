export const metadata = {
  title: "Panel de administración",
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }) {
  return <div className="min-h-screen bg-hueso">{children}</div>;
}
