import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { AuditAction, EnrollmentStatus, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { customerStorageKey } from "@/lib/tenant";
import {
  uploadFileObject,
  uploadObject,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function countPdfPages(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  const counts: number[] = [];
  const pageTree = /\/Type\s*\/Pages\b[\s\S]{0,1200}?\/Count\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pageTree.exec(text))) counts.push(Number(match[1]));
  if (counts.length > 0) return Math.max(...counts);
  return text.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

/**
 * Kursa MP4 video veya PDF doküman yükleme/değiştirme.
 * İç model geriye uyumluluk için Video adını korur; kursun tek ana içeriğidir.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, customerId: session.customerId },
    include: { video: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const durationSec = Math.round(Number(formData?.get("duration") || 0));
  const requestedPageCount = Math.round(Number(formData?.get("pageCount") || 0));

  if (!(file instanceof Blob) || file.size < 1) {
    return NextResponse.json({ error: "İçerik dosyası gerekli" }, { status: 400 });
  }
  const originalName = file instanceof File && file.name ? file.name : "content";
  const lowerName = originalName.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isMp4 = file.type === "video/mp4" || lowerName.endsWith(".mp4");
  if (!isPdf && !isMp4) {
    return NextResponse.json(
      { error: "Yalnızca MP4 video veya PDF dosyası yüklenebilir" },
      { status: 400 },
    );
  }

  const maxBytes = isPdf ? 50 * 1024 * 1024 : 1024 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: isPdf ? "PDF çok büyük (max 50MB)" : "Video çok büyük (max 1GB)" },
      { status: 413 },
    );
  }
  if (!isPdf && (!durationSec || durationSec < 1)) {
    return NextResponse.json({ error: "Video süresi gerekli" }, { status: 400 });
  }
  if (isPdf && (requestedPageCount < 1 || requestedPageCount > 5000)) {
    return NextResponse.json({ error: "PDF sayfa sayısı belirlenemedi" }, { status: 400 });
  }

  const contentType = isPdf ? "application/pdf" : "video/mp4";
  const fileId = randomUUID();
  const extension = isPdf ? "pdf" : "mp4";
  const storageKey = customerStorageKey({
    customerId: session.customerId,
    courseId,
    fileId,
    extension,
  });
  let checksum: string | null = null;
  let pdfBytes: Uint8Array | null = null;

  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      return NextResponse.json({ error: "Geçerli bir PDF dosyası seçin" }, { status: 400 });
    }
    const detectedPageCount = countPdfPages(bytes);
    if (detectedPageCount < 1 || detectedPageCount !== requestedPageCount) {
      return NextResponse.json(
        { error: "PDF sayfa sayısı doğrulanamadı; farklı bir PDF ile tekrar deneyin" },
        { status: 400 },
      );
    }
    checksum = createHash("sha256").update(bytes).digest("hex");
    pdfBytes = bytes;
  }

  // Önce temizleme kuyruğuna yazılır. Upload veya DB işlemi yarıda kalırsa
  // fiziksel nesne sahipsiz kalmaz; cleanup komutu bu kaydı güvenle toplar.
  const pendingStorageObject = await prisma.storageObject.create({
    data: {
      customerId: session.customerId,
      storageKey,
      checksum,
      sizeBytes: file.size,
      contentType,
      status: "PENDING_DELETE",
      deleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  try {
    if (pdfBytes) await uploadObject(storageKey, pdfBytes, contentType);
    else await uploadFileObject(storageKey, file, contentType);
  } catch (error) {
    console.error("Content upload failed:", error);
    return NextResponse.json({ error: "İçerik yüklenemedi" }, { status: 500 });
  }

  const newStorageObject = await prisma.$transaction(async (tx) => {
    const storageObject = await tx.storageObject.update({
      where: { id: pendingStorageObject.id },
      data: { status: "ACTIVE", deleteAfter: null },
    });
    await tx.video.upsert({
      where: { courseId },
      update: {
        customerId: session.customerId,
        storageObjectId: storageObject.id,
        storageKey,
        fileName: originalName,
        contentType,
        durationSec: isPdf ? requestedPageCount : durationSec,
        pageCount: isPdf ? requestedPageCount : null,
        sizeBytes: file.size,
      },
      create: {
        customerId: session.customerId,
        courseId,
        storageObjectId: storageObject.id,
        storageKey,
        fileName: originalName,
        contentType,
        durationSec: isPdf ? requestedPageCount : durationSec,
        pageCount: isPdf ? requestedPageCount : null,
        sizeBytes: file.size,
      },
    });
    if (course.video?.storageObjectId) {
      await tx.storageObject.updateMany({
        where: {
          id: course.video.storageObjectId,
          customerId: session.customerId,
          status: "ACTIVE",
        },
        data: {
          status: "PENDING_DELETE",
          deleteAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
    return storageObject;
  });

  const previousWasPdf = Boolean(course.video?.pageCount);
  const contentKindChanged = Boolean(course.video) && previousWasPdf !== isPdf;
  const contentReplaced = Boolean(course.video);
  if (contentReplaced) {
    await prisma.$transaction([
      // Kontrol noktaları ve ilerleme eski dosyanın konumlarına bağlıdır.
      prisma.checkpoint.deleteMany({ where: { courseId } }),
      prisma.enrollment.updateMany({
        where: { courseId },
        data: {
          status: EnrollmentStatus.NOT_STARTED,
          positionSec: 0,
          maxReachedSec: 0,
          watchedPercent: 0,
          totalWatchedSec: 0,
          videoCompleted: false,
          attemptCount: 0,
          bestScorePercent: null,
          lastCorrectCount: null,
          lastWrongCount: null,
          passed: false,
          firstStartedAt: null,
          lastActivityAt: null,
          completedAt: null,
        },
      }),
    ]);
  }

  await recordAudit({
    action: AuditAction.ADMIN_UPDATED_COURSE,
    actor: session,
    entityType: "Course",
    entityId: courseId,
    metadata: {
      contentUploaded: true,
      contentType,
      contentKindChanged,
      contentReplaced,
      pageCount: isPdf ? requestedPageCount : null,
      storageKey,
      storageObjectId: newStorageObject.id,
      sizeBytes: file.size,
    },
  });

  return NextResponse.json({ ok: true, size: file.size });
}
