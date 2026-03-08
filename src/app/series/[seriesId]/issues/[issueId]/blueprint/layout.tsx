export default function BlueprintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Blueprint has its own full-screen layout, no parent chrome needed
  return <>{children}</>
}
