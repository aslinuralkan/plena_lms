import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "@/lib/api";

export default function PlatformLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await http.post("/platform/auth/login", { email, password });
      navigate("/platform", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Giriş yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-navy-950 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Plena platform yönetimi</p>
        <h1 className="mt-3 text-3xl font-semibold">Super Admin Girişi</h1>
        <p className="mt-2 text-sm text-slate-400">Bu oturum müşteri kullanıcı girişinden tamamen ayrıdır.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" type="email" autoComplete="username" placeholder="E-posta" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" type="password" autoComplete="current-password" placeholder="Şifre" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="text-right"><Link to="/platform/forgot-password" className="text-xs text-cyan-300">Şifremi unuttum</Link></div>
          <button disabled={busy} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-medium text-navy-950 disabled:opacity-60">{busy ? "Giriş yapılıyor..." : "Platforma Gir"}</button>
        </form>
      </section>
    </main>
  );
}
