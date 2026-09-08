'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <section className="panel">
        <h1>Something went wrong</h1>
        <p>Your saved audition data remains in PostgreSQL.</p>
        <button onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
