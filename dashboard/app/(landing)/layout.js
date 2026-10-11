// Landing layout: intentionally bare. The marketing page stands alone
// with no sidebar or top bar; this passthrough exists so the route
// group is explicit about that.
export default function LandingLayout({ children }) {
  return <>{children}</>;
}
