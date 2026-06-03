// Explicit, minimal 404 page. Defining it (as a plain server component with no
// client imports) keeps the auto-generated /_not-found export graph trivial,
// which avoids the flaky static-export worker failure on this project.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111827",
        color: "#f8f8f2",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <p>404 — page not found</p>
    </main>
  );
}
