# Plena LMS multi-customer rollout

Bu geçiş Martı Denizcilik verisini yerinde korur. Kayıt kimlikleri ve mevcut
`storageKey` değerleri değiştirilmez.

## 1. Expand + backfill

`20260908100000_expand_customer_foundation` Customer, CustomerSettings,
PlatformAdmin ve StorageObject tablolarını oluşturur; kritik tablolara nullable
`customerId` ekler. `customer-marti-denizcilik` kaydı `ON CONFLICT` ile
idempotent oluşturulur ve mevcut kayıtlar yalnızca `customerId IS NULL` iken
backfill edilir. Mevcut Video satırları için metadata kaydı açılır, fiziksel
dosyalar taşınmaz.

Doğrulama:

```sql
SELECT 'User', count(*) FROM "User" WHERE "customerId" IS NULL
UNION ALL SELECT 'Course', count(*) FROM "Course" WHERE "customerId" IS NULL
UNION ALL SELECT 'Enrollment', count(*) FROM "Enrollment" WHERE "customerId" IS NULL
UNION ALL SELECT 'Video', count(*) FROM "Video" WHERE "customerId" IS NULL;

SELECT count(*) FROM "Video" v
LEFT JOIN "StorageObject" s ON s."id" = v."storageObjectId"
WHERE s."id" IS NULL OR s."storageKey" <> v."storageKey";
```

Uygulama bu aşamada eski JWT'lerde customer claim yoksa doğrulanmış User
kaydından customerId çözer. Claim ile User kaydı uyuşmazsa oturum reddedilir.

## 2. Isolate + contract

API sürümü deploy edildikten ve yukarıdaki sorgular sıfır döndükten sonra
`20260908103000_contract_customer_isolation` customerId alanlarını NOT NULL
yapar ve Group, Category, QuestionCategory, QuestionPool isim benzersizliğini
Customer kapsamına çeker.

Doğrulama:

```sql
SELECT "customerId", "email", count(*) FROM "User"
GROUP BY "customerId", "email" HAVING count(*) > 1;

SELECT e."id" FROM "Enrollment" e
JOIN "User" u ON u."id" = e."userId"
JOIN "Course" c ON c."id" = e."courseId"
WHERE e."customerId" <> u."customerId" OR e."customerId" <> c."customerId";
```

## Rollback yaklaşımı

- Uygulama rollback'i additive sütunları ve tabloları yerinde bırakır; eski
  sürüm bunları yok sayabilir.
- Contract migration geri alınmadan önce API trafiği durdurulur. Gerekirse
  customer-scoped unique indeksleri kaldırılıp eski global unique indeksleri
  yeniden kurulur; veri satırları veya dosyalar silinmez.
- StorageObject yaşam döngüsünde eski içerik 7 gün `PENDING_DELETE` kalır.
  Rollback sırasında ilgili kayıt tekrar `ACTIVE` yapılır ve Video'nun eski
  storageKey/storageObjectId değeri geri bağlanır.
- Upload başlamadan açılan kayıtlar 24 saat `PENDING_DELETE` kalır; böylece
  yarım kalan upload/transaction nesneleri de izlenebilir. `npm run
  storage:cleanup` komutu zamanlanmış iş olarak çalıştırılır, süresi dolan
  nesneyi storage'dan sildikten sonra metadata durumunu `DELETED` yapar.
- Martı Customer kaydı veya backfill edilen customerId değerleri rollback'te
  silinmez. Böylece ileri migration tekrar güvenle çalıştırılabilir.

## Yayın kapıları

1. Martı admin ve çalışan login regresyonu.
2. Eski MP4/PDF storageKey ile byte-range oynatma.
3. İki Customer ile cross-customer ID denemeleri (user, group, course, pool,
   question, report, video).
4. Customer pasifleştirme ve iki cookie'nin birbirinden bağımsız doğrulanması.
5. Plena bootstrap'ın ikinci çalıştırmada Customer/User çoğaltmaması.
