export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Todo List</h1>
        <nav className="app-nav">
          <span>Login</span>
          <span>Register</span>
        </nav>
      </header>
      <main className="app-main">
        <p>
          Frontend shell — the auth screens, todo list and category management
          are built here on <code>feature/frontend-ui</code>.
        </p>
        <p>
          API contract: <code>docs/api-spec.md</code>. Data access goes through{" "}
          <code>src/api/client.ts</code>.
        </p>
      </main>
    </div>
  );
}
