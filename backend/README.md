# Backend — LMS API (Next.js + Prisma + PostgreSQL)

Plena arayüzünün (:3002) kullandığı API. http://localhost:3001 üzerinde çalışır; kendi sayfaları (login/admin) artık kullanılmaz.

## Lokal çalıştırma

Repo kökünden `./start-local.sh` önerilir. Sadece backend'i başlatmak için:

```bash
npm install
npm run db:setup     # ilk kurulum: prisma db push + demo verisi
npm run dev -- -p 3001
```

PostgreSQL, repo kökündeki gömülü kurulumdan çalışır (`.tools/pg`). Bağlantı bilgisi `.env` içindeki `DATABASE_URL`'dedir.

## Önemli dizinler

- `src/app/api/` — REST endpoint'leri (auth, admin, user)
- `src/lib/` — domain kuralları (video/PDF ilerlemesi, sınav, aktivasyon, depolama)
- `prisma/` — şema, migration'lar ve seed
- `storage/videos/` — lokal modda yüklenen MP4/PDF içerikleri (gitignore)

Süresi dolan tenant-scoped ve yarım kalmış depolama nesnelerini güvenle
temizlemek için periyodik olarak `npm run storage:cleanup` çalıştırın.

## İçerik sınırları

- MP4 video: en fazla 1 GB
- PDF: en fazla 50 MB

Production ortamında içerikler private S3 bucket'a yüklenir; lokal geliştirmede
`STORAGE_DRIVER=local` kullanılır.

## Testler

```bash
npm test   # vitest
```

## Multi-customer bootstrap

Migration deploy sonrasında Martı backfill doğrulaması ve kontrollü bootstrap
komutları kullanılabilir:

```bash
npm run db:backfill:marti
PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_PASSWORD=... npm run db:bootstrap:platform-admin
BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_USER_EMAIL=... npm run db:bootstrap:customer
```

Customer kullanıcıları global benzersiz e-postaya sahiptir. Customer ve ilk
admin oluşturma işlemi normalde ayrı `/platform` panelinden yapılır; kullanıcı
inactive oluşturulur ve mevcut aktivasyon bağlantısı + 6 haneli kod akışıyla
şifresini belirler. Platform Admin oturumu `plena_platform_session`, normal
kullanıcı oturumu ise `marti_session` cookie'sini kullanır.

## Docker (opsiyonel)

`docker-compose.yml` Postgres + MinIO + Caddy ile konteynerli kurulum içindir:

```bash
docker compose up --build
# http://localhost:8080
```
