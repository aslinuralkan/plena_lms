import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { refreshOverdue } from "@/lib/enrollment";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await requireSession(["ADMIN"]);
  if (!session) redirect("/login");
  const customerId = session.customerId;
  await refreshOverdue({ customerId });

  const [users, groups, courses, questions, enrollments, overdue, completed] =
    await Promise.all([
      prisma.user.count({ where: { customerId, role: "USER", active: true } }),
      prisma.group.count({ where: { customerId } }),
      prisma.course.count({ where: { customerId } }),
      prisma.question.count({
        where: { active: true, pool: { customerId } },
      }),
      prisma.enrollment.count({ where: { customerId } }),
      prisma.enrollment.count({ where: { customerId, status: "OVERDUE" } }),
      prisma.enrollment.count({ where: { customerId, status: "COMPLETED" } }),
    ]);

  const cards = [
    { label: "Aktif kullanıcı", value: users, href: "/admin/users" },
    { label: "Ekip", value: groups, href: "/admin/groups" },
    { label: "Eğitim", value: courses, href: "/admin/courses" },
    { label: "Havuzdaki soru", value: questions, href: "/admin/courses" },
    { label: "Atanmış kayıt", value: enrollments, href: "/admin/reports" },
    { label: "Tamamlanan", value: completed, href: "/admin/reports" },
    { label: "Süresi geçen", value: overdue, href: "/admin/reports" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sea-200 bg-white/90 p-6">
        <h2 className="text-xl font-semibold text-sea-950">Yönetici paneli</h2>
        <p className="mt-2 max-w-2xl text-sm text-sea-600">
          Kullanıcı, ekip, soru havuzu, eğitim ve tarih pencereli atamaları buradan
          yönetin. Raporlar sekmesinde izleme süresi, doğru/yanlış sayısı ve
          tamamlama durumlarını görebilirsiniz.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-sea-200 bg-white p-5 hover:border-sea-400"
          >
            <div className="text-3xl font-semibold text-sea-900">{c.value}</div>
            <div className="mt-1 text-sm text-sea-600">{c.label}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
