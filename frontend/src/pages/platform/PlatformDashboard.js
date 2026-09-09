import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "@/lib/api";

const emptyForm = {
  name: "",
  slug: "",
  adminName: "",
  adminEmail: "",
  plan: "",
};

function formatBytes(value) {
  if (!value) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [supportCustomer, setSupportCustomer] = useState(null);

  const load = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([
        http.get("/platform/auth/me"),
        http.get("/platform/customers"),
      ]);
      setAdmin(me.data);
      setCustomers(list.data);
    } catch {
      navigate("/platform/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  async function createCustomer(event) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await http.post("/platform/customers", {
        ...form,
        plan: form.plan || null,
        settings: { brandName: form.name },
      });
      setMessage(response.data.activationSent
        ? "Müşteri oluşturuldu ve ilk admin daveti gönderildi."
        : "Müşteri oluşturuldu; davet gönderilemedi.");
      setForm(emptyForm);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.error || "Müşteri oluşturulamadı");
    }
  }

  async function inviteAdmin(customer) {
    setMessage("");
    try {
      const response = await http.post(`/platform/customers/${customer.id}/invite-admin`);
      setMessage(response.data.activationSent
        ? "Customer Admin aktivasyon e-postası gönderildi."
        : "Customer Admin daveti gönderilemedi.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Admin daveti oluşturulamadı");
    }
  }

  async function toggleStatus(customer) {
    await http.patch(`/platform/customers/${customer.id}`, {
      status: customer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    await load();
  }

  async function openSupport(customer) {
    const reason = window.prompt("Destek erişimi nedenini yazın:");
    if (!reason) return;
    const response = await http.post(`/platform/customers/${customer.id}/support`, { reason });
    setSupportCustomer({ ...response.data.customer, warning: response.data.warning });
  }

  function showDetails(customer) {
    window.alert([
      customer.name,
      `Plan: ${customer.plan || "Tanımlı değil"}`,
      `Kullanıcı: ${customer.userCount} / ${customer.settings?.userLimit || "limitsiz"}`,
      `Admin: ${customer.adminCount}`,
      `Eğitim: ${customer.courseCount}`,
      `Depolama: ${formatBytes(customer.storageBytes)} / ${customer.settings?.storageLimitBytes ? formatBytes(customer.settings.storageLimitBytes) : "limitsiz"}`,
      `Son aktivite: ${customer.lastActivityAt ? new Date(customer.lastActivityAt).toLocaleString("tr-TR") : "Yok"}`,
    ].join("\n"));
  }

  async function editSettings(customer) {
    const brandName = window.prompt("Marka adı", customer.settings?.brandName || customer.name);
    if (brandName === null) return;
    const domain = window.prompt("Domain (boş bırakılabilir)", customer.settings?.domain || "");
    if (domain === null) return;
    const plan = window.prompt("Plan (boş bırakılabilir)", customer.plan || "");
    if (plan === null) return;
    await http.patch(`/platform/customers/${customer.id}`, {
      plan: plan || null,
      settings: { brandName, domain: domain || null },
    });
    await load();
  }

  async function logout() {
    await http.post("/platform/auth/logout").catch(() => {});
    navigate("/platform/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-10 text-navy-950">
      <header className="mx-auto max-w-7xl flex items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[0.18em] text-cyan-700">Plena LMS</p><h1 className="text-3xl font-semibold">Müşteri Yönetimi</h1><p className="mt-1 text-sm text-slate-500">{admin?.name || "Super Admin"}</p></div>
        <button onClick={logout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">Çıkış</button>
      </header>

      {supportCustomer ? (
        <aside className="mx-auto mt-6 flex max-w-7xl items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950" role="status">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em]">Destek görünümü · audit açık</p><p className="mt-1 text-sm">{supportCustomer.warning}</p></div>
          <button onClick={() => setSupportCustomer(null)} className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-medium">Görünümden çık</button>
        </aside>
      ) : null}

      <div className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Customers</h2></div>
          <div className="divide-y divide-slate-100">
            {customers.map((customer) => (
              <article key={customer.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1.3fr_repeat(4,0.55fr)_auto] md:items-center">
                <div><p className="font-semibold">{customer.settings?.brandName || customer.name}</p><p className="text-xs text-slate-500">{customer.slug} · {customer.plan || "Plan yok"}</p></div>
                <div><p className="text-xs text-slate-400">Kullanıcı</p><p className="font-medium">{customer.userCount}</p></div>
                <div><p className="text-xs text-slate-400">Admin</p><p className="font-medium">{customer.adminCount}</p></div>
                <div><p className="text-xs text-slate-400">Eğitim</p><p className="font-medium">{customer.courseCount}</p></div>
                <div><p className="text-xs text-slate-400">Depolama</p><p className="font-medium">{formatBytes(customer.storageBytes)}</p></div>
                <div className="flex flex-wrap gap-2"><button onClick={() => showDetails(customer)} className="rounded-lg border px-3 py-2 text-xs">Detay</button><button onClick={() => editSettings(customer)} className="rounded-lg border px-3 py-2 text-xs">Ayarlar</button><button onClick={() => inviteAdmin(customer)} className="rounded-lg border px-3 py-2 text-xs">Admin daveti</button><button onClick={() => openSupport(customer)} className="rounded-lg border px-3 py-2 text-xs">Destek görünümü</button><button onClick={() => toggleStatus(customer)} className={`rounded-lg px-3 py-2 text-xs ${customer.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{customer.status === "ACTIVE" ? "Aktif" : "Pasif"}</button></div>
              </article>
            ))}
          </div>
        </section>

        <form onSubmit={createCustomer} className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Yeni Customer</h2>
          <p className="mt-1 text-xs text-slate-500">İlk admin inactive oluşturulur ve aktivasyon daveti alır.</p>
          <div className="mt-5 space-y-3">
            {[["name", "Kurum adı"], ["slug", "slug"], ["plan", "Plan"], ["adminName", "İlk admin adı"], ["adminEmail", "İlk admin e-posta"]].map(([key, label]) => <input key={key} type={key === "adminEmail" ? "email" : "text"} required={key !== "plan"} placeholder={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />)}
          </div>
          {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
          <button className="mt-4 w-full rounded-xl bg-navy-950 px-4 py-3 text-sm font-medium text-white">Müşteri ve davet oluştur</button>
        </form>
      </div>
    </main>
  );
}
