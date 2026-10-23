# Jersey Baju - Backend (FCSV_BE)

Backend service untuk platform e-commerce dan tracking produksi jersey kustom **FCSV Apparel**. Dibangun menggunakan **Express.js**, **Prisma ORM**, **PostgreSQL**, dan **Socket.io**.

---

## 📋 Daftar Isi
1. [Tech Stack](#-tech-stack)
2. [Arsitektur & Keamanan (Zero-Trust)](#-arsitektur--keamanan-zero-trust)
3. [Panduan Instalasi & Menjalankan](#-panduan-instalasi--menjalankan)
4. [Konfigurasi Environment Variable](#-konfigurasi-environment-variable)
5. [Skema Database & Model Prisma](#-skema-database--model-prisma)
6. [Dokumentasi API Endpoints](#-dokumentasi-api-endpoints)
7. [Socket.io Real-Time Events](#-socketio-real-time-events)
8. [Struktur Folder](#-struktur-folder)

---

## 🛠️ Tech Stack
- **Runtime Environment:** Node.js (v20+)
- **Web Framework:** Express.js 4.x
- **Database & ORM:** PostgreSQL 16 dengan Prisma ORM
- **Authentication:** JSON Web Token (JWT) + Bcrypt Password Hashing
- **Real-Time Engine:** Socket.io (WebSocket dengan fallback HTTP long-polling)
- **Media & Image Processing:** Multer + Sharp (Auto-conversion ke WebP format)
- **Containerization:** Docker & Docker Compose

---

## 🛡️ Arsitektur & Keamanan (Zero-Trust)

Backend FCSV mengadopsi standar **Zero-Trust Security**:

1. **Zero-Trust Database Verification (`authMiddleware.js`)**
   - Setiap request berotentikasi memverifikasi keberadaan dan status pengguna langsung ke basis data PostgreSQL (`prisma.user.findUnique`).
   - Token dengan role atau ID palsu, kadaluwarsa, atau dari akun yang telah dihapus otomatis ditolak (`401 Unauthorized` / `403 Forbidden`).

2. **Perlindungan Injeksi Skalar & NoSQL / Prisma Operator (`authService.js`, `userRepository.js`)**
   - Runtime type-checking ketat (`typeof username === 'string'`) mencegah eksploitasi filter Prisma Object Injection (contoh: `{ username: { not: "" } }`).
   - Pencarian pengguna menggunakan operator skalar presisi `{ equals: cleanString }`.

3. **Perlindungan IDOR (Insecure Direct Object Reference) (`orderController.js`)**
   - Akses data dan pembuatan pesanan customer selalu dipaksa menggunakan `req.user.id` dari token sesi yang valid. Customer tidak dapat mengakses atau memodifikasi pesanan customer lain.

4. **Sanitasi Kredensial (Password Hash Stripping)**
   - Hash password (`bcrypt`) secara konsisten disaring dan dihilangkan dari seluruh return object profil, detail user, maupun daftar pengguna admin.

5. **Atomic Cascading Deletion (`userService.js`)**
   - Transaksi database atomik (`deleteSingleUserInTx`) membersihkan relasi dependensi (penugasan desainer, pesan chat, membership grup, profil) sebelum menghapus akun secara permanen, mencegah database crash / foreign key constraint violation.

6. **Path Traversal Protection & Auto WebP (`upload.js`, `index.js`)**
   - Direktori static file `/uploads` diamankan dari teknik dot-dot directory traversal (`../`).
   - Seluruh unggahan gambar otomatis dioptimalkan dan dikonversi ke format **WebP** terkompresi dengan kompresi kualitas tinggi.

---

## 🚀 Panduan Instalasi & Menjalankan

### Persyaratan Sistem
- Node.js (v20 atau lebih baru)
- PostgreSQL (v14 atau lebih baru) atau Docker Desktop

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Setup Environment Variables
Salin template environment file:
```bash
cp .env.example .env
```
Sesuaikan konfigurasi kredensial database dan JWT Secret di dalam `.env`.

### 3. Migrasi & Sinkronisasi Database
```bash
# Generate Prisma Client
npx prisma generate

# Sinkronisasi schema ke database
npx prisma db push

# Atau gunakan migrasi prisma untuk lingkungan production
npx prisma migrate dev
```

### 4. Menjalankan Server
```bash
# Mode Development (auto-reload dengan nodemon)
npm run dev

# Mode Production
node src/index.js
```
Server backend akan berjalan secara default di `http://localhost:5002`.

---

## ⚙️ Konfigurasi Environment Variable

| Variable | Deskripsi | Contoh Nilai |
| :--- | :--- | :--- |
| `PORT` | Port server Express.js | `5002` |
| `DATABASE_URL` | URL koneksi basis data PostgreSQL | `postgresql://postgres:password@localhost:5432/JerseyBaju?schema=public` |
| `JWT_SECRET` | Kunci rahasia untuk tanda tangan JWT | `fcsv_super_secret_jwt_key_2026` |
| `GEMINI_API_KEY` | *(Opsional)* API Key untuk asisten AI | `AIzaSy...` |
| `CORS_ORIGIN` | Allowed origin domain frontend | `http://localhost:3000` |

---

## 🗄️ Skema Database & Model Prisma

Prisma mengelola relasi tabel pada PostgreSQL:
- **`User`**: Data kredensial pengguna, role (`admin`, `manager`, `desain`, `gudang`, `customer`), status, dan timestamp.
- **`Profile`**: Informasi profil personal (nama lengkap, nomor HP, bio, alamat, avatar WebP).
- **`Order`**: Entitas pesanan utama (nomor nota, status produksi, total harga, status DP/lunas, tenggat waktu, referensi customer & desainer).
- **`DetailOrder`**: Rincian nama pemain, nomor punggung, ukuran jersey (XXS-5XL), dan tipe lengan (pendek/panjang).
- **`BahanBaju`**: Inventaris stok kain jersey (nama kain, deskripsi, harga per meter/kg, foto bahan, stok sisa).
- **`RiwayatBahan`**: Log mutasi stok masuk dan keluar bahan baku.
- **`ReturBahan`**: Pencatatan retur bahan kain rusak/salah kirim.
- **`DamageHistory`**: Catatan riwayat kendala atau kerusakan saat proses potong dan jahit.
- **`ChatMessage`**: Pesan teks dan file lampiran percakapan real-time.
- **`ChatGroup` & `GroupMember`**: Grup percakapan kolaboratif per pesanan atau tim internal.

---

## 📡 Dokumentasi API Endpoints

Seluruh endpoint API memiliki basis path: `/api`.

### 🔐 1. Authentication (`/api/auth`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Otentikasi pengguna & pengembalian token JWT | Publik |
| **POST** | `/api/auth/register` | Pendaftaran akun customer baru | Publik |
| **POST** | `/api/auth/logout` | Invalidasi sesi user aktif | Terotentikasi |
| **PUT** | `/api/auth/change-password` | Ganti password akun yang sedang login | Terotentikasi |

---

### 👤 2. Profil Pengguna (`/api/profile` & `/api/user`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/profile` | Mengambil profil user yang sedang login | Terotentikasi |
| **GET** | `/api/profile/:id` | Mengambil profil user berdasarkan ID | Terotentikasi |
| **PUT** | `/api/profile/:id` | Memperbarui nama, bio, dan avatar profil (WebP) | Pemilik Akun / Admin |
| **GET** | `/api/user/profile` | Alias profil akun yang sedang login | Terotentikasi |
| **PUT** | `/api/user/change-password` | Alias ganti password akun | Terotentikasi |

---

### 🛡️ 3. Admin & Manager Management (`/api/admin`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/admin/create-customer` | Pembuatan akun customer manual oleh staf | Admin, Manager |
| **POST** | `/api/admin/create-staff` | Pembuatan akun staf (`admin`, `manager`, `desain`, `gudang`) | Admin, Manager |
| **GET** | `/api/admin/users` | Mengambil daftar seluruh pengguna (Sanitasi password) | Admin, Manager |
| **GET** | `/api/admin/users/count` | Jumlah user terdaftar per role (`?role=...`) | Admin, Manager |
| **GET** | `/api/admin/users-role` | Filter pengguna berdasarkan role spesifik | Admin, Manager |
| **GET** | `/api/admin/users/:id` | Detail profil pengguna spesifik | Admin, Manager |
| **PUT** | `/api/admin/users/:id` | Update data pengguna / staf / customer | Admin, Manager |
| **DELETE**| `/api/admin/users/:id` | Hapus akun tunggal secara aman | Admin, Manager |
| **POST** | `/api/admin/users/batch-delete`| Hapus akun massal dalam satu transaksi atomik | Admin, Manager |
| **GET** | `/api/admin/designers` | Daftar seluruh staf desainer aktif | Admin, Manager, Desain, Gudang |
| **GET** | `/api/admin/dashboard-stats` | Ringkasan statistik omset & pesanan dashboard | Admin, Manager |
| **GET** | `/api/admin/omset-report` | Laporan transaksi omset (harian, bulanan, tahunan) | Admin, Manager |
| **GET** | `/api/admin/chat-customers` | Daftar customer untuk percakapan chat staf | Admin, Manager, Desain, Gudang |

---

### 🛒 4. Manajemen Pesanan & Produksi (`/api/orders`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/orders/track/:orderId` | Pelacakan status & progres pesanan publik tanpa login | Publik |
| **POST** | `/api/orders` | Membuat pesanan jersey kustom baru | Customer, Admin |
| **GET** | `/api/orders` | Mengambil seluruh pesanan produksi | Terotentikasi |
| **PUT** | `/api/orders/:id` | Memperbarui data pesanan & list pemain | Terotentikasi |
| **PATCH**| `/api/orders/:id/status` | Update status tahapan pesanan / assign desainer | Admin, Manager, Desain |
| **PATCH**| `/api/orders/:id/payment` | Update status pembayaran DP atau Pelunasan | Admin, Manager |
| **GET** | `/api/orders/customer/:customerId` | Riwayat pesanan milik customer tertentu | Customer (Self), Admin |
| **GET** | `/api/orders/designer/:designerId` | Antrean pesanan milik staf desainer | Desain, Admin |
| **POST** | `/api/orders/:id/mockup` | Unggah file mockup desain jersey (WebP) | Desain |
| **PATCH**| `/api/orders/:id/approve-design` | Persetujuan mockup desain oleh customer | Customer, Admin |
| **PATCH**| `/api/orders/:id/unapprove-design` | Pembatalan persetujuan desain | Customer, Admin |
| **PATCH**| `/api/orders/:id/revisi-design` | Pengajuan revisi desain beserta catatan kendala | Customer |
| **PATCH**| `/api/orders/:id/cancel-mockup` | Membatalkan/menghapus mockup desain | Desain, Admin |
| **POST** | `/api/orders/:id/layout` | Unggah pola layout cetak jersey | Desain |
| **PATCH**| `/api/orders/:id/approve-layout` | Persetujuan layout pola oleh tim produksi | Internal |
| **PATCH**| `/api/orders/:id/unapprove-layout` | Pembatalan approval layout | Internal |
| **PATCH**| `/api/orders/:id/revisi-layout` | Pengajuan revisi layout pola | Internal |
| **PATCH**| `/api/orders/:id/cancel-layout` | Pembatalan file layout pola | Desain, Admin |
| **POST** | `/api/orders/:id/print` | Unggah foto bukti hasil cetak sublimasi kain | Internal |
| **POST** | `/api/orders/:id/finishing` | Unggah foto bukti hasil jahit & finishing | Internal |
| **PATCH**| `/api/orders/:id/recommend-alternatives` | Rekomendasi bahan alternatif jika stok habis | Admin, Gudang |
| **PATCH**| `/api/orders/:id/select-alternative` | Pemilihan bahan alternatif oleh customer | Customer, Admin |
| **POST** | `/api/orders/:id/damage` | Catat laporan kerusakan saat produksi | Gudang, Admin |
| **PUT** | `/api/orders/damage/:historyId` | Edit data laporan kerusakan | Gudang, Admin |
| **GET** | `/api/orders/:id/damage-history` | Riwayat log kerusakan produksi | Internal |

---

### 📦 5. Inventaris Bahan Baku & Kain (`/api/bahan-baju`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/bahan-baju` | Katalog bahan jersey & produk kain | Publik |
| **GET** | `/api/bahan-baju/history` | Riwayat mutasi stok bahan kain | Admin, Gudang, Manager |
| **GET** | `/api/bahan-baju/retur` | Daftar pencatatan retur bahan kain | Admin, Gudang, Manager |
| **POST** | `/api/bahan-baju` | Tambah bahan kain baru (Auto-WebP) | Admin, Gudang |
| **PUT** | `/api/bahan-baju/:id` | Update data bahan, harga, & stok | Admin, Gudang |
| **DELETE**| `/api/bahan-baju/:id` | Hapus data bahan baku | Admin, Gudang |

---

### 💬 6. Real-Time Chat & Percakapan (`/api/chat`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/chat/contacts/:userId` | Daftar kontak & percakapan terakhir | Terotentikasi |
| **GET** | `/api/chat/history/:userId/:otherUserId` | Riwayat pesan percakapan dua arah | Terotentikasi |
| **GET** | `/api/chat/unread/:userId` | Jumlah pesan belum dibaca | Terotentikasi |
| **POST** | `/api/chat/upload` | Unggah lampiran chat (WebP / Dokumen) | Terotentikasi |
| **POST** | `/api/chat/groups` | Membuat grup obrolan pesanan | Terotentikasi |
| **DELETE**| `/api/chat/groups/:id` | Hapus grup obrolan | Terotentikasi |
| **POST** | `/api/chat/groups/:id/members` | Tambah anggota baru ke grup | Terotentikasi |
| **DELETE**| `/api/chat/groups/:id/members/:userId` | Hapus anggota dari grup chat | Terotentikasi |

---

## 🔌 Socket.io Real-Time Events

Koneksi Socket.io menangani pembaruan live tanpa polling:

| Event Name | Direction | Payload | Deskripsi |
| :--- | :--- | :--- | :--- |
| `join` | Client ➔ Server | `userId` atau `roomId` | Bergabung ke room personal atau room pesanan |
| `send_message` | Client ➔ Server | `{ senderId, receiverId, message, attachmentUrl }` | Mengirim pesan real-time |
| `receive_message`| Server ➔ Client | Object ChatMessage lengkap | Menerima pesan baru secara langsung |
| `mark_read` | Client ➔ Server | `{ messageIds, readerId }` | Menandai pesan telah dibaca |
| `message_deleted`| Server ➔ Client | `{ messageId }` | Sinkronisasi pesan yang ditarik/dihapus |

---

## 📁 Struktur Folder

```text
FCSV_BE/
├── prisma/
│   └── schema.prisma        # Definisi skema basis data PostgreSQL
├── src/
│   ├── config/              # Konfigurasi database & environment
│   ├── controllers/         # Logic controller request/response
│   ├── middleware/          # Auth JWT, Role Authorization, Multer Upload
│   ├── repositories/        # Abstraksi query database Prisma
│   ├── routes/              # Deklarasi router endpoint Express
│   ├── services/            # Business logic utama aplikasi
│   ├── utils/               # Helper fungsi & formatter
│   └── index.js             # Entry point Express.js & Socket.io server
├── uploads/                 # Direktori static file upload WebP
├── Dockerfile               # Spesifikasi build Docker container backend
├── package.json             # Dependensi & script Node.js
└── README.md                # Dokumentasi teknis backend
```
