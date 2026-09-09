import { AssignmentTarget, EnrollmentStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export { checkWindow } from "./window";
export type { EnrollmentWindow, WindowCheck } from "./window";

/**
 * Bir atamanın hedeflediği kullanıcı kimlikleri.
 * USER hedefinde tek kişi, GROUP hedefinde ekibin aktif üyeleri.
 */
async function resolveTargetUserIds(assignment: {
  customerId: string;
  target: AssignmentTarget;
  userId: string | null;
  groupId: string | null;
}): Promise<string[]> {
  if (assignment.target === AssignmentTarget.USER) {
    return assignment.userId ? [assignment.userId] : [];
  }
  if (!assignment.groupId) return [];

  const members = await prisma.groupMember.findMany({
    where: {
      groupId: assignment.groupId,
      group: { customerId: assignment.customerId },
      user: { active: true, customerId: assignment.customerId },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/**
 * Atamayı kullanıcı bazlı Enrollment kayıtlarına yayar.
 * Var olan kayıtların ilerlemesi korunur, sadece tarih penceresi tazelenir.
 */
export async function syncEnrollmentsForAssignment(
  assignmentId: string,
  customerId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, customerId },
  });
  if (!assignment) return 0;

  const userIds = await resolveTargetUserIds(assignment);

  for (const userId of userIds) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: assignment.courseId } },
      update: {
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        dueAt: assignment.dueAt,
        reminderDays: assignment.reminderDays,
        assignedAt: assignment.assignedAt,
      },
      create: {
        customerId: assignment.customerId,
        userId,
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        dueAt: assignment.dueAt,
        reminderDays: assignment.reminderDays,
        assignedAt: assignment.assignedAt,
        status: EnrollmentStatus.NOT_STARTED,
      },
    });
  }

  return userIds.length;
}

/** Bir kullanıcı ekibe eklendiğinde ekibin tüm atamalarını ona da yayar. */
export async function syncEnrollmentsForGroupMember(
  groupId: string,
  userId: string,
  customerId: string,
) {
  const assignments = await prisma.assignment.findMany({
    where: {
      target: AssignmentTarget.GROUP,
      groupId,
      customerId,
      course: { active: true },
    },
  });

  for (const assignment of assignments) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: assignment.courseId } },
      update: {
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        dueAt: assignment.dueAt,
        reminderDays: assignment.reminderDays,
      },
      create: {
        customerId,
        userId,
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        dueAt: assignment.dueAt,
        reminderDays: assignment.reminderDays,
        assignedAt: assignment.assignedAt,
        status: EnrollmentStatus.NOT_STARTED,
      },
    });
  }

  return assignments.length;
}

/**
 * Süresi geçmiş ve hâlâ tamamlanmamış kayıtları OVERDUE'ya çeker.
 * Okuma öncesi çağrılır; tamamlananlar hiç dokunulmaz.
 */
export async function refreshOverdue(where?: Prisma.EnrollmentWhereInput) {
  return prisma.enrollment.updateMany({
    where: {
      ...where,
      dueAt: { not: null, lt: new Date() },
      passed: false,
      status: {
        in: [
          EnrollmentStatus.NOT_STARTED,
          EnrollmentStatus.IN_PROGRESS,
          EnrollmentStatus.FAILED,
        ],
      },
    },
    data: { status: EnrollmentStatus.OVERDUE },
  });
}

/** Kullanıcının şu an görebileceği kayıtlar: başlangıç tarihi gelmiş olanlar. */
export function visibleEnrollmentWhere(
  userId: string,
  customerId: string,
): Prisma.EnrollmentWhereInput {
  return {
    userId,
    customerId,
    startsAt: { lte: new Date() },
    course: { active: true },
  };
}
