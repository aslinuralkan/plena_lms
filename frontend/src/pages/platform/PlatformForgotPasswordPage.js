import { useState } from "react";
import { Link } from "react-router-dom";
import { http } from "@/lib/api";

export default function PlatformForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    const response = await http.post("/platform/auth/forgot-password", { email });
    setMessage(response.data.message);
  }
  return (
    <main className="min-h-screen bg-navy-950 flex items-center justify-center p-6 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8"><h1 className="text-2xl font-semibold">Platform şifresini yenile</h1><p className="mt-2 text-sm text-slate-400">Super Admin hesabınıza ait e-postayı girin.</p><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" placeholder="E-posta" /><button className="mt-3 w-full rounded-xl bg-cyan-500 px-4 py-3 font-medium text-navy-950">Bağlantı gönder</button>{message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}<Link to="/platform/login" className="mt-5 block text-center text-xs text-cyan-300">Girişe dön</Link></form></main>
  );
}
