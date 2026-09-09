"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { AuditAction, RetakePolicy, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadFileObject } from "@/lib/storage";
import { customerStorageKey } from "@/lib/tenant";

function parseRetakePolicy(value: FormDataEntryValue | null): RetakePolicy {
  return value === RetakePolicy.VIDEO_AND_TEST
    ? RetakePolicy.VIDEO_AND_TEST
    : RetakePolicy.TEST_ONLY;
}

export type CreateCourseResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createCourseAction(
  formData: FormData,
): Promise<CreateCourseResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const passPercent = Number(formData.get("passPercent") || 80);
    const maxAttempts = Number(formData.get("maxAttempts") || 0);
    const durationSec = Number(formData.get("durationSec") || 0);
    const questionPoolId = String(formData.get("questionPoolId") || "").trim();
    const questionCount = Number(formData.get("questionCount") || 0);
    const categoryId = String(formData.get("categoryId") || "").trim();
    const durationMinutes = Number(formData.get("durationMinutes") || 0);
    const retakePolicy = parseRetakePolicy(formData.get("retakePolicy"));
    const file = formData.get("video");

    if (!title || !description || !(file instanceof Blob) || file.size < 1) {
      return { ok: false, error: "Başlık, açıklama ve video zorunlu" };
    }
    if (!durationSec || durationSec < 1) {
      return { ok: false, error: "Video süresi gerekli" };
    }
    if (!Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) {
      return { ok: false, error: "Geçme barajı 0-100 arasında olmalı" };
    }
    if (file.size > 1024 * 1024 * 1024) {
      return {
        ok: false,
        error: "Video çok büyük (max 1GB). Daha kısa bir dosya deneyin.",
      };
    }

    const originalName =
      file instanceof File && file.name ? file.name : "video.mp4";
    const courseId = randomUUID();
    const fileId = randomUUID();
    const storageKey = customerStorageKey({
      customerId: session.customerId,
      courseId,
      fileId,
      extension: "mp4",
    });
    const contentType = file.type || "video/mp4";

    const safeMaxAttempts = Number.isFinite(maxAttempts) ? maxAttempts : 0;
    const safeQuestionCount = Number.isFinite(questionCount) ? questionCount : 0;

    const [category, pool] = await Promise.all([
      categoryId
        ? prisma.category.findFirst({
            where: { id: categoryId, customerId: session.customerId },
          })
        : null,
      questionPoolId
        ? prisma.questionPool.findFirst({
            where: { id: questionPoolId, customerId: session.customerId },
          })
        : null,
    ]);
    if (categoryId && !category) return { ok: false, error: "Kategori bulunamadı" };
    if (questionPoolId && !pool) return { ok: false, error: "Soru havuzu bulunamadı" };

    const pendingStorageObject = await prisma.storageObject.create({
      data: {
        customerId: session.customerId,
        storageKey,
        sizeBytes: file.size,
        contentType,
        status: "PENDING_DELETE",
        deleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await uploadFileObject(storageKey, file, contentType);

    const course = await prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          id: courseId,
          customerId: session.customerId,
          title,
          description,
          categoryId: categoryId || null,
          passPercent,
          maxAttempts: safeMaxAttempts,
          questionPoolId: questionPoolId || null,
          questionCount: safeQuestionCount,
        },
      });
      const storageObject = await tx.storageObject.update({
        where: { id: pendingStorageObject.id },
        data: { status: "ACTIVE", deleteAfter: null },
      });
      await tx.video.create({
        data: {
          customerId: session.customerId,
          courseId: created.id,
          storageObjectId: storageObject.id,
          storageKey,
          fileName: originalName,
          contentType,
          durationSec,
          sizeBytes: file.size,
        },
      });
      await tx.exam.create({
        data: {
          courseId: created.id,
          passPercent,
          maxAttempts: safeMaxAttempts,
          questionPoolId: questionPoolId || null,
          questionCount: safeQuestionCount,
          durationMinutes: durationMinutes > 0 ? durationMinutes : null,
          retakePolicy,
        },
      });
      return created;
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_COURSE,
      actor: session,
      entityType: "Course",
      entityId: course.id,
      metadata: { title, storageKey, passPercent, retakePolicy },
    });

    revalidatePath("/admin/courses");
    return { ok: true, id: course.id };
  } catch (err) {
    console.error("createCourseAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Eğitim oluşturulamadı",
    };
  }
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function createPoolAction(input: {
  name: string;
  description: string;
}): Promise<SimpleResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const name = input.name.trim();
    if (name.length < 2) return { ok: false, error: "Havuz adı çok kısa" };

    const exists = await prisma.questionPool.findUnique({
      where: {
        customerId_name: { customerId: session.customerId, name },
      },
    });
    if (exists) return { ok: false, error: "Bu isimde bir havuz zaten var" };

    const pool = await prisma.questionPool.create({
      data: {
        customerId: session.customerId,
        name,
        description: input.description.trim(),
      },
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_QUESTION_POOL,
      actor: session,
      entityType: "QuestionPool",
      entityId: pool.id,
      metadata: { name },
    });

    revalidatePath("/admin/courses");
    return { ok: true };
  } catch (err) {
    console.error("createPoolAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Havuz oluşturulamadı",
    };
  }
}

export async function addQuestionAction(input: {
  poolId: string;
  categoryId?: string;
  prompt: string;
  choices: { text: string; isCorrect: boolean }[];
}): Promise<SimpleResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const prompt = input.prompt.trim();
    const choices = input.choices.filter((c) => c.text.trim().length > 0);

    if (!input.poolId) return { ok: false, error: "Soru havuzu seçin" };
    if (prompt.length < 3) return { ok: false, error: "Soru metni çok kısa" };
    if (choices.length < 2) return { ok: false, error: "En az 2 şık gerekli" };
    if (choices.filter((c) => c.isCorrect).length !== 1) {
      return { ok: false, error: "Tam olarak 1 doğru cevap işaretleyin" };
    }

    const [pool, category] = await Promise.all([
      prisma.questionPool.findFirst({
        where: { id: input.poolId, customerId: session.customerId },
      }),
      input.categoryId
        ? prisma.questionCategory.findFirst({
            where: { id: input.categoryId, customerId: session.customerId },
          })
        : prisma.questionCategory.upsert({
            where: {
              customerId_name: {
                customerId: session.customerId,
                name: "Genel",
              },
            },
            update: {},
            create: {
              customerId: session.customerId,
              name: "Genel",
              description: "Belirli bir konu başlığına bağlı olmayan genel sorular.",
            },
          }),
    ]);
    if (!pool) return { ok: false, error: "Soru havuzu bulunamadı" };
    if (!category) return { ok: false, error: "Soru kategorisi bulunamadı" };

    const sortOrder = await prisma.question.count({
      where: { poolId: input.poolId },
    });

    await prisma.question.create({
      data: {
        poolId: input.poolId,
        categoryId: category.id,
        prompt,
        sortOrder,
        choices: {
          create: choices.map((c) => ({
            text: c.text.trim(),
            isCorrect: c.isCorrect,
          })),
        },
      },
    });

    revalidatePath("/admin/courses");
    return { ok: true };
  } catch (err) {
    console.error("addQuestionAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Soru eklenemedi",
    };
  }
}
