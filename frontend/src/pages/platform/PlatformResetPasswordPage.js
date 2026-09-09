import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { http } from "@/lib/api";

export default function PlatformResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event) {
    event.preventDefault();
    try {
      await http.post("/platform/auth/reset-password", { token, password });
      setDone(true);
      setMessage("Şifreniz yenilendi. Tüm eski platform oturumları kapatıldı.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Şifre yenilenemedi");
    }
  }
  return (
    <main className="min-h-screen bg-navy-950 flex items-center justify-center p-6 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8"><h1 className="text-2xl font-semibold">Yeni platform şifresi</h1><p className="mt-2 text-sm text-slate-400">En az 12 karakter kullanın.</p>{!done ? <><input type="password" minLength="12" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Yeni şifre" /><button className="mt-3 w-full rounded-xl bg-cyan-500 px-4 py-3 font-medium text-navy-950">Şifreyi yenile</button></> : null}{message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}<Link to="/platform/login" className="mt-5 block text-center text-xs text-cyan-300">Girişe dön</Link></form></main>
  );
}
